import { NextRequest, NextResponse } from "next/server";
import { getSessionData } from "@/lib/session";
import { getDBAdapter } from "@/lib/db";
import { getJobWorker } from "@/lib/jobs/worker";
import { isTerminalStage } from "@/lib/jobs/types";
import type { Job } from "@/lib/models";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = await getSessionData();
    if (!session?.isLoggedIn) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userId = session.email!;
    const { jobId } = await params;
    const db = getDBAdapter();

    const job = await db.findById<Job>("jobs", jobId);

    if (!job) {
      return NextResponse.json({ message: "Job not found" }, { status: 404 });
    }

    if (job.userId !== userId) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    if (!isTerminalStage(job.stage)) {
      const worker = getJobWorker();
      await worker.processJobById(jobId);
    }

    const updatedJob = await db.findById<Job>("jobs", jobId);

    return NextResponse.json({
      success: true,
      job: updatedJob,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Get job error:", error);
    return NextResponse.json(
      { message: "Failed to get job", error: message },
      { status: 500 }
    );
  }
}
