import { getDBAdapter, type DBAdapter } from "../db";
import type { Job, JobEvent } from "../models";
import type { JobStage } from "./types";
import { getNextStage, isTerminalStage, getStageProgress } from "./types";
import { processExtractingStage } from "./stages/extract";
import { processNormalizingStage } from "./stages/normalize";
import { processDefiningStage } from "./stages/define";

const LEASE_DURATION_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const RUNNABLE_STAGES: JobStage[] = ["ingested", "extracting", "normalizing", "defining"];

export class JobWorker {
  private db: DBAdapter;

  constructor(db?: DBAdapter) {
    this.db = db || getDBAdapter();
  }

  async acquireLease(jobId: string): Promise<Job | null> {
    const job = await this.db.findById<Job>("jobs", jobId);
    if (!job) return null;
    if (isTerminalStage(job.stage)) return null;
    if (job.leaseUntil && new Date(job.leaseUntil) > new Date()) return null;
    const leaseUntil = new Date(Date.now() + LEASE_DURATION_MS).toISOString();
    return await this.db.update<Job>("jobs", jobId, { leaseUntil, attempts: job.attempts + 1 } as Partial<Job>);
  }

  async releaseLease(jobId: string): Promise<void> {
    await this.db.update<Job>("jobs", jobId, { leaseUntil: undefined });
  }

  async advanceStage(jobId: string, result?: Record<string, unknown>): Promise<Job | null> {
    const job = await this.db.findById<Job>("jobs", jobId);
    if (!job) return null;
    const nextStage = getNextStage(job.stage);
    if (!nextStage) return job;
    const updated = await this.db.update<Job>("jobs", jobId, {
      stage: nextStage,
      progress: getStageProgress(nextStage),
      result: result ? { ...job.result, ...result } : job.result,
    } as Partial<Job>);
    await this.db.create<JobEvent>("job_events", {
      type: "job_event",
      userId: job.userId,
      jobId,
      stage: nextStage,
      message: `Advanced to ${nextStage} stage`,
    });
    return updated;
  }

  async failJob(jobId: string, error: string): Promise<Job | null> {
    const job = await this.db.findById<Job>("jobs", jobId);
    if (!job) return null;
    const shouldRetry = job.attempts < MAX_ATTEMPTS;
    if (shouldRetry) {
      await this.db.update<Job>("jobs", jobId, {
        stage: job.stage,
        lastError: error,
        leaseUntil: undefined,
      });
    } else {
      await this.db.update<Job>("jobs", jobId, {
        stage: "failed",
        progress: 0,
        lastError: error,
        leaseUntil: undefined,
      });
    }
    await this.db.create<JobEvent>("job_events", {
      type: "job_event",
      userId: job.userId,
      jobId,
      stage: "failed",
      message: `Job failed: ${error}`,
      metadata: { attempts: job.attempts, shouldRetry },
    });
    return await this.db.findById<Job>("jobs", jobId);
  }

  async getNextJob(): Promise<Job | null> {
    for (const stage of RUNNABLE_STAGES) {
      const jobs = await this.db.findMany<Job>("jobs", { stage });
      for (const job of jobs) {
        if (!job.leaseUntil || new Date(job.leaseUntil) < new Date()) return job;
      }
    }
    return null;
  }

  async processJobById(jobId: string): Promise<{ processed: boolean; jobId?: string; stage?: string }> {
    const job = await this.db.findById<Job>("jobs", jobId);
    if (!job || isTerminalStage(job.stage)) {
      return { processed: false };
    }

    const leasedJob = await this.acquireLease(job.id!);
    if (!leasedJob) {
      return { processed: false, jobId: job.id, stage: job.stage };
    }

    try {
      switch (leasedJob.stage) {
        case "ingested":
          await this.processIngestedStage(leasedJob);
          break;
        case "extracting":
          await this.processExtractingStage(leasedJob);
          break;
        case "normalizing":
          await this.processNormalizingStage(leasedJob);
          break;
        case "defining":
          await this.processDefiningStage(leasedJob);
          break;
        default:
          await this.releaseLease(leasedJob.id!);
          return { processed: false, jobId: leasedJob.id, stage: leasedJob.stage };
      }
      await this.releaseLease(leasedJob.id!);
      return { processed: true, jobId: leasedJob.id, stage: leasedJob.stage };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await this.failJob(leasedJob.id!, message);
      return { processed: false, jobId: leasedJob.id, stage: leasedJob.stage };
    }
  }

  async processTick(): Promise<{ processed: boolean; jobId?: string; stage?: string }> {
    const job = await this.getNextJob();
    if (!job) return { processed: false };
    const leasedJob = await this.acquireLease(job.id!);
    if (!leasedJob) return { processed: false };
    try {
      switch (job.stage) {
        case "ingested":
          await this.processIngestedStage(job);
          break;
        case "extracting":
          await this.processExtractingStage(job);
          break;
        case "normalizing":
          await this.processNormalizingStage(job);
          break;
        case "defining":
          await this.processDefiningStage(job);
          break;
        default:
          await this.releaseLease(job.id!);
          return { processed: false };
      }
      await this.releaseLease(job.id!);
      return { processed: true, jobId: job.id, stage: job.stage };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await this.failJob(job.id!, message);
      return { processed: false, jobId: job.id, stage: job.stage };
    }
  }

  private async processIngestedStage(job: Job): Promise<void> {
    await this.advanceStage(job.id!, { ingestedAt: new Date().toISOString() });
  }

  private async processExtractingStage(job: Job): Promise<void> {
    await processExtractingStage(job);
    await this.advanceStage(job.id!, { extractedAt: new Date().toISOString() });
  }

  private async processNormalizingStage(job: Job): Promise<void> {
    await processNormalizingStage(job);
    await this.advanceStage(job.id!, { normalizedAt: new Date().toISOString() });
  }

  private async processDefiningStage(job: Job): Promise<void> {
    await processDefiningStage(job);
    await this.advanceStage(job.id!, { definedAt: new Date().toISOString() });
  }
}

let cachedWorker: JobWorker | null = null;

export function getJobWorker(): JobWorker {
  if (!cachedWorker) {
    cachedWorker = new JobWorker();
  }
  return cachedWorker;
}
