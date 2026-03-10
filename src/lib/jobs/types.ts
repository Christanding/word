// Job stage definitions
export type JobStage = "ingested" | "extracting" | "normalizing" | "defining" | "done" | "failed";

export const JOB_STAGES: JobStage[] = ["ingested", "extracting", "normalizing", "defining", "done"];

export const STAGE_TRANSITIONS: Record<JobStage, JobStage | null> = {
  ingested: "extracting",
  extracting: "normalizing",
  normalizing: "defining",
  defining: "done",
  done: null,
  failed: null,
};

export interface JobState {
  stage: JobStage;
  progress: number;
  attempts: number;
  lastError?: string;
  leaseUntil?: string;
}

export function getNextStage(current: JobStage): JobStage | null {
  return STAGE_TRANSITIONS[current] || null;
}

export function isTerminalStage(stage: JobStage): boolean {
  return stage === "done" || stage === "failed";
}

export function getStageProgress(stage: JobStage): number {
  const progressMap: Record<JobStage, number> = {
    ingested: 10,
    extracting: 30,
    normalizing: 60,
    defining: 80,
    done: 100,
    failed: 0,
  };
  return progressMap[stage];
}
