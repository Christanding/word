"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/language-provider";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function readJsonSafely<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export default function UploadPage() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [jobId, setJobId] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { language, t } = useLanguage();

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError("");
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await readJsonSafely<{ message?: string }>(res);
        throw new Error(data?.message || t("upload.error.uploadFailed"));
      }

      const data = await readJsonSafely<{ jobId?: string }>(res);
      if (!data?.jobId) {
        throw new Error(t("upload.error.unknown"));
      }
      setJobId(data.jobId);
      setProgress(10);
      pollJobStatus(data.jobId);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const pollJobStatus = async (jid: string) => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jid}`);
        const data = await readJsonSafely<{
          job?: {
            progress: number;
            stage: string;
            lastError?: string;
          };
        }>(res);

        if (!data?.job) {
          setTimeout(poll, 2000);
          return;
        }

        setProgress(data.job.progress);

        if (data.job.stage === "done") {
          setUploading(false);
          router.push("/app/words");
        } else if (data.job.stage === "failed") {
          setError(`${t("upload.error.processingFailed")}: ${data.job.lastError || t("upload.error.unknown")}`);
          setUploading(false);
        } else {
          setTimeout(poll, 2000);
        }
      } catch (err: unknown) {
        setError(`${t("upload.error.checkStatusFailed")}: ${getErrorMessage(err)}`);
        setUploading(false);
      }
    };

    setTimeout(poll, 1000);
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(255,255,255,0.55),rgba(246,241,232,0.96))] px-6 py-10 sm:px-10">
      <div className="mx-auto w-full max-w-[min(1320px,100vw)]">
          <div className="mb-10 border-b border-[rgba(76,63,54,0.14)] pb-8 pt-4 text-center">
            <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-[rgba(63,49,43,0.5)]">
              {language === "zh" ? "资料接收" : "Document Intake"}
            </div>
            <h1 className="mb-4 text-5xl font-semibold leading-[1.02] text-[var(--accent-ink)]">
              {t("upload.title")}
            </h1>
            <p className="text-lg leading-8 text-[rgba(63,49,43,0.75)]">
              {t("upload.subtitle")}
            </p>
          </div>

          <div className="border border-[rgba(76,63,54,0.16)] bg-[rgba(255,252,247,0.92)] p-8 shadow-[0_18px_40px_-30px_rgba(40,30,24,0.24)]">
            <button
              type="button"
              className={`relative w-full border-2 border-dashed p-12 text-center transition-all duration-300 ${
                dragActive
                  ? "border-[var(--accent-oxblood)] bg-[rgba(249,243,235,0.9)] scale-[1.01]"
                  : "border-[rgba(76,63,54,0.24)] hover:border-[var(--accent-oxblood)] hover:bg-[rgba(249,243,235,0.86)]"
              } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => !uploading && inputRef.current?.click()}
              onKeyDown={(event) => {
                if ((event.key === "Enter" || event.key === " ") && !uploading) {
                  event.preventDefault();
                  inputRef.current?.click();
                }
              }}
              aria-label={t("upload.browse")}
            >
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept=".pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.webp"
                onChange={handleFileChange}
                disabled={uploading}
              />
              
              <div className="space-y-4">
                <div className="mb-4 text-6xl leading-none text-[var(--accent-ink)]">§</div>
                <div>
                  <p className="text-xl font-semibold text-slate-700 mb-2">
                    {dragActive ? t("upload.dropHere") : t("upload.dragDrop")}
                  </p>
                  <p className="text-slate-500">
                    <span className="font-medium text-[var(--accent-oxblood)] underline">{t("upload.browse")}</span>
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
                  <span className="border border-[rgba(76,63,54,0.14)] px-3 py-1">PDF</span>
                  <span className="border border-[rgba(76,63,54,0.14)] px-3 py-1">Word</span>
                  <span className="border border-[rgba(76,63,54,0.14)] px-3 py-1">Excel</span>
                  <span className="border border-[rgba(76,63,54,0.14)] px-3 py-1">{t("upload.file.images")}</span>
                </div>
              </div>
            </button>

            {/* Progress Section */}
            {uploading && (
              <div className="mt-8 border border-[rgba(76,63,54,0.16)] bg-[rgba(255,253,248,0.92)] p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center border border-[rgba(76,63,54,0.14)] bg-[rgba(255,253,248,0.96)]">
                    <svg className="h-5 w-5 animate-spin text-[var(--accent-oxblood)]" fill="none" viewBox="0 0 24 24">
                      <title>{t("upload.processingTitle")}</title>
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-700">{t("upload.processingTitle")}</h3>
                    <p className="text-sm text-slate-500">{t("upload.processingDesc")}</p>
                  </div>
                </div>
                
                <div className="relative h-3 overflow-hidden bg-[rgba(76,63,54,0.12)]">
                  <div
                    className="absolute inset-y-0 left-0 bg-[linear-gradient(90deg,#6e3b33,#8f5a49)] transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-sm">
                  <span className="text-slate-500">{progress}% {t("upload.progressComplete")}</span>
                  <span className="text-slate-400 font-mono text-xs">{jobId.slice(0, 8)}...</span>
                </div>
              </div>
            )}

            {/* Error Section */}
            {error && (
              <div className="mt-8 animate-shake border border-[rgba(110,59,51,0.24)] bg-[rgba(110,59,51,0.08)] p-6">
                <div className="flex items-start gap-3">
                  <div className="text-2xl leading-none text-[var(--accent-oxblood)]">!</div>
                  <div>
                    <h3 className="mb-1 font-semibold text-[var(--accent-oxblood)]">{t("upload.errorTitle")}</h3>
                    <p className="text-sm text-[var(--accent-oxblood)]">{error}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
      </div>
      <style jsx global>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}
