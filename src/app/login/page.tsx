"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Login failed");
      }

      // Redirect to app on success
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,rgba(255,255,255,0.55),rgba(246,241,232,0.96))] px-6 py-10">
      <main className="w-full max-w-xl border border-[rgba(76,63,54,0.16)] bg-[rgba(255,252,247,0.92)] shadow-[0_22px_60px_-36px_rgba(31,24,20,0.28)]">
        <div className="border-b border-[rgba(76,63,54,0.14)] px-8 py-4 text-[11px] uppercase tracking-[0.18em] text-[rgba(63,49,43,0.62)]">
          Editorial Access
        </div>
        <div className="p-8 sm:p-10">
          <h1 className="mb-2 text-center text-3xl font-semibold leading-tight text-[var(--accent-ink)]">Vocab Study</h1>
          <p className="mb-8 text-center text-sm leading-7 text-[rgba(63,49,43,0.74)]">
            Login to access your vocabulary learning
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium tracking-[0.02em] text-[var(--accent-ink)]">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1 block w-full border border-[rgba(76,63,54,0.24)] bg-[rgba(255,253,248,0.96)] px-3 py-2.5 leading-6 text-[var(--accent-ink)] focus:border-[var(--accent-oxblood)] focus:outline-none"
                placeholder="admin@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium tracking-[0.02em] text-[var(--accent-ink)]">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1 block w-full border border-[rgba(76,63,54,0.24)] bg-[rgba(255,253,248,0.96)] px-3 py-2.5 leading-6 text-[var(--accent-ink)] focus:border-[var(--accent-oxblood)] focus:outline-none"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="border border-[rgba(110,59,51,0.28)] bg-[rgba(110,59,51,0.08)] p-3 text-sm leading-6 text-[var(--accent-oxblood)]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full border border-[var(--accent-ink)] bg-[var(--accent-ink)] py-2.5 text-sm font-medium leading-5 text-white transition-colors hover:border-[var(--accent-oxblood)] hover:bg-[var(--accent-oxblood)] disabled:opacity-50"
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>

          <div className="mt-8 border-t border-[rgba(76,63,54,0.14)] pt-5 text-center text-xs leading-6 text-[rgba(63,49,43,0.6)]">
            <p>Default credentials (dev only):</p>
            <p className="font-mono">admin@example.com / admin123</p>
          </div>
        </div>
      </main>
    </div>
  );
}
