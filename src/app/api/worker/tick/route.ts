import { NextRequest, NextResponse } from "next/server";
import { getJobWorker } from "@/lib/jobs/worker";

const WORKER_SECRET = process.env.WORKER_SECRET || "default-worker-secret";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function POST(request: NextRequest) {
  try {
    // Verify worker secret
    const secret = request.headers.get("x-worker-secret");
    if (secret !== WORKER_SECRET) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const worker = getJobWorker();
    const result = await worker.processTick();

    return NextResponse.json({
      success: true,
      processed: result.processed,
      jobId: result.jobId,
      stage: result.stage,
    });
  } catch (error: unknown) {
    console.error("Worker tick error:", error);
    return NextResponse.json(
      { message: "Worker tick failed", error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
