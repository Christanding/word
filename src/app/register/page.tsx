"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, confirmPassword }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Registration failed");
      }

      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,rgba(255,255,255,0.55),rgba(246,241,232,0.96))] px-6 py-10">
      <main className="w-full max-w-xl border border-[rgba(76,63,54,0.16)] bg-[rgba(255,252,247,0.92)] shadow-[0_22px_60px_-36px_rgba(31,24,20,0.28)]">
        <div className="border-b border-[rgba(76,63,54,0.14)] px-8 py-4 text-[11px] uppercase tracking-[0.18em] text-[rgba(63,49,43,0.62)]">
          New Reader Access
        </div>
        <div className="p-8 sm:p-10">
          <h1 className="mb-2 text-center text-3xl font-semibold leading-tight text-[var(--accent-ink)]">Create Account</h1>
          <p className="mb-8 text-center text-sm leading-7 text-[rgba(63,49,43,0.74)]">
            Register to build your own private vocabulary library
          </p>

          <p className="mb-8 text-center text-sm leading-7 text-[rgba(63,49,43,0.74)]">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-[var(--accent-oxblood)] underline-offset-4 transition hover:underline">
              Back to login
            </Link>
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
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium tracking-[0.02em] text-[var(--accent-ink)]">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="mt-1 block w-full border border-[rgba(76,63,54,0.24)] bg-[rgba(255,253,248,0.96)] px-3 py-2.5 leading-6 text-[var(--accent-ink)] focus:border-[var(--accent-oxblood)] focus:outline-none"
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium tracking-[0.02em] text-[var(--accent-ink)]">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="mt-1 block w-full border border-[rgba(76,63,54,0.24)] bg-[rgba(255,253,248,0.96)] px-3 py-2.5 leading-6 text-[var(--accent-ink)] focus:border-[var(--accent-oxblood)] focus:outline-none"
                placeholder="Repeat your password"
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
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
