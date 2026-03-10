# Vocab Test Start And Early Prepare Performance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce `start` backend latency and the early-question `prepare_next` bottleneck without regressing the already-fast `answer` path or changing vocab-test behavior.

**Architecture:** Keep the existing `answer -> prepare_next` split intact. Move more cold and repeated work out of the request critical path by warming and reusing question-bank-derived data, and reduce per-question CPU by avoiding repeated full-bank distractor scans. Keep all API semantics and UI flow unchanged except for faster readiness.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Testing Library.

---

### Task 1: Lock performance-sensitive behavior with tests

**Files:**
- Modify: `tests/unit/vocab-test-route.test.ts`
- Modify: `tests/unit/vocab-test-page.test.tsx`

**Step 1:** Add a route test that proves fresh `start` still returns a ready `currentQuestion` and does not regress the existing `answer -> prepare_next` contract.

**Step 2:** Add a route-level regression test around repeated bank-question preparation so we can optimize internals without changing visible behavior.

**Step 3:** Add or update page tests to preserve: immediate feedback after answer, disabled next button until `prepare_next` completes, and loading state when re-testing from history.

**Step 4:** Run focused tests and confirm any new expectation fails before implementation.

### Task 2: Remove repeated cold and repeated work from question generation

**Files:**
- Modify: `src/lib/vocab-test/engine.ts`
- Modify: `src/lib/vocab-test/bank.ts`
- Modify: `src/app/api/vocab-test/route.ts`

**Step 1:** Add reusable derived question-bank structures for distractor generation so repeated `buildOptions` calls do not rescan and dedupe the whole bank for every candidate.

**Step 2:** Warm the built-in/user question bank earlier on the `start` path and reuse the same bank object through the request instead of letting helper calls rediscover it.

**Step 3:** Keep `prepare_next` and `start` using the same optimized question-generation path so early-question latency drops without touching `answer` semantics.

**Step 4:** Keep AI fallback, finish logic, review queue, and imported-wordlist behavior unchanged.

### Task 3: Final verification and evidence

**Files:**
- Verify: `tests/unit/vocab-test-route.test.ts`
- Verify: `tests/unit/vocab-test-page.test.tsx`
- Verify: `tests/unit/vocab-test-engine.test.ts`
- Verify: `tests/unit/vocab-test-bank-cache.test.ts`

**Step 1:** Run related unit tests.

**Step 2:** Run `npx tsc --noEmit`.

**Step 3:** Run `npm run build`.

**Step 4:** Run HTTP measurements for `start`, `answer`, and the first several `prepare_next` calls to confirm `answer` stays fast and early-question readiness improves.
