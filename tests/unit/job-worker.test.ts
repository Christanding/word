import { describe, it, expect, beforeEach } from "vitest";
import { JobWorker } from "@/lib/jobs/worker";
import { getDBAdapter } from "@/lib/db";
import { resetMockDBAdapter } from "@/lib/db/mock";
import type { Job } from "@/lib/models";

describe("Job Worker", () => {
  let worker: JobWorker;
  let db: ReturnType<typeof getDBAdapter>;

  beforeEach(() => {
    resetMockDBAdapter();
    db = getDBAdapter();
    worker = new JobWorker(db);
  });

  it("should create a job in ingested stage", async () => {
    const job = await db.create<Job>("jobs", {
      type: "job",
      userId: "user-1",
      documentId: "doc-1",
      stage: "ingested",
      progress: 10,
      maxAttempts: 3,
      attempts: 0,
    });

    expect(job.id).toBeDefined();
    expect(job.stage).toBe("ingested");
    expect(job.progress).toBe(10);
  });

  it("should acquire lease on a job", async () => {
    const job = await db.create<Job>("jobs", {
      type: "job",
      userId: "user-1",
      documentId: "doc-1",
      stage: "ingested",
      progress: 10,
      maxAttempts: 3,
      attempts: 0,
    });

    expect(job.id).toBeDefined();
    const leased = await worker.acquireLease(job.id!);
    expect(leased).toBeDefined();
    expect(leased!.id).toBe(job.id);
    expect(leased!.leaseUntil).toBeDefined();
  });

  it("should not acquire lease on already leased job", async () => {
    const job = await db.create<Job>("jobs", {
      type: "job",
      userId: "user-1",
      documentId: "doc-1",
      stage: "ingested",
      progress: 10,
      maxAttempts: 3,
      attempts: 0,
    });

    await worker.acquireLease(job.id!);
    const secondLease = await worker.acquireLease(job.id!);
    
    expect(secondLease).toBeNull();
  });

  it("should advance job through stages", async () => {
    const job = await db.create<Job>("jobs", {
      type: "job",
      userId: "user-1",
      documentId: "doc-1",
      stage: "ingested",
      progress: 10,
      maxAttempts: 3,
      attempts: 0,
    });

    expect(job.id).toBeDefined();
    let updated = await worker.advanceStage(job.id!);
    expect(updated?.stage).toBe("extracting");
    expect(updated?.progress).toBe(30);

    updated = await worker.advanceStage(job.id!);
    expect(updated?.stage).toBe("normalizing");
    expect(updated?.progress).toBe(60);

    updated = await worker.advanceStage(job.id!);
    expect(updated?.stage).toBe("defining");
    expect(updated?.progress).toBe(80);

    updated = await worker.advanceStage(job.id!);
    expect(updated?.stage).toBe("done");
    expect(updated?.progress).toBe(100);
  });

  it("should fail job after max attempts", async () => {
    const job = await db.create<Job>("jobs", {
      type: "job",
      userId: "user-1",
      documentId: "doc-1",
      stage: "ingested",
      progress: 10,
      maxAttempts: 3,
      attempts: 3,
    });

    expect(job.id).toBeDefined();
    await worker.failJob(job.id!, "Test error");
    const failed = await db.findById<Job>("jobs", job.id!);
    
    expect(failed?.stage).toBe("failed");
    expect(failed?.lastError).toBe("Test error");
  });

  it("should get next runnable job", async () => {
    const job = await db.create<Job>("jobs", {
      type: "job",
      userId: "user-1",
      documentId: "doc-1",
      stage: "ingested",
      progress: 10,
      maxAttempts: 3,
      attempts: 0,
    });

    expect(job.id).toBeDefined();
    const nextJob = await worker.getNextJob();
    expect(nextJob).toBeDefined();
    expect(nextJob?.documentId).toBe("doc-1");
  });
});
