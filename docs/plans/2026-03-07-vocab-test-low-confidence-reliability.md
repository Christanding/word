# Vocab Test Low-Confidence Reliability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the vocab test produce conservative, clearly labeled results when confidence stays low at the 150-question cap, while keeping early confidence growth slower and routing later questions toward same-level edge evidence.

**Architecture:** Keep the existing adaptive engine and finish flow, but add a thin result-normalization layer for low-confidence completed sessions, a richer session/result shape to persist warning metadata, and a targeted late-stage candidate-routing rule in the question engine. Drive the change test-first across engine, route, and page so the UI and persisted results stay aligned.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Testing Library, Zod

---

### Task 1: Add failing engine tests for confidence and conservative result normalization

**Files:**
- Modify: `tests/unit/vocab-test-engine.test.ts`
- Modify: `src/lib/vocab-test/engine.ts`

**Step 1: Write the failing test**

Add tests that assert:
- questions `1-5` clamp confidence lower than questions `6-8`
- a low-confidence result gets a conservative vocab estimate and no high recommended level
- after `40` questions, unstable same-level evidence is preferred over cross-level jumps

**Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/vocab-test-engine.test.ts`
Expected: FAIL on missing conservative-result helpers / new routing behavior

**Step 3: Write minimal implementation**

Implement only the helpers and routing inputs required by the tests in `src/lib/vocab-test/engine.ts`.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/unit/vocab-test-engine.test.ts`
Expected: PASS

### Task 2: Add failing route tests for 150-question low-confidence completion metadata

**Files:**
- Modify: `tests/unit/vocab-test-route.test.ts`
- Modify: `src/app/api/vocab-test/route.ts`
- Modify: `src/lib/models/index.ts`
- Modify: `src/lib/vocab-test/types.ts`

**Step 1: Write the failing test**

Add tests that assert:
- reaching `150` questions with low confidence still finishes
- returned `state` includes low-confidence metadata
- estimate/recommended level are conservative when low-confidence mode is triggered
- history `GET` includes the same metadata

**Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/vocab-test-route.test.ts`
Expected: FAIL because metadata fields and conservative result shaping do not exist yet

**Step 3: Write minimal implementation**

Extend schemas/types and wire the low-confidence completion metadata through `route.ts`.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/unit/vocab-test-route.test.ts`
Expected: PASS

### Task 3: Add failing page tests for strong low-confidence warnings

**Files:**
- Modify: `tests/unit/vocab-test-page.test.tsx`
- Modify: `src/app/app/vocab-test/page.tsx`
- Modify: `src/lib/i18n.ts`

**Step 1: Write the failing test**

Add tests that assert:
- completed low-confidence results render a strong warning block
- retry/retest guidance is visible
- low-confidence results do not show “ready/stable” semantics in result messaging

**Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/vocab-test-page.test.tsx`
Expected: FAIL because the warning UI and copy do not exist yet

**Step 3: Write minimal implementation**

Add the warning UI and translation keys only as required by the tests.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/unit/vocab-test-page.test.tsx`
Expected: PASS

### Task 4: Run focused then full verification

**Files:**
- Verify: `src/lib/vocab-test/engine.ts`
- Verify: `src/app/api/vocab-test/route.ts`
- Verify: `src/app/app/vocab-test/page.tsx`
- Verify: `src/lib/models/index.ts`
- Verify: `src/lib/vocab-test/types.ts`
- Verify: `src/lib/i18n.ts`

**Step 1: Run LSP diagnostics on modified files**

Expected: zero errors

**Step 2: Run focused tests**

Run: `npm test -- --run tests/unit/vocab-test-engine.test.ts tests/unit/vocab-test-route.test.ts tests/unit/vocab-test-page.test.tsx tests/unit/vocab-test-progress.test.ts`
Expected: PASS

**Step 3: Run typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS

**Step 4: Run final real-flow verification if local app is available**

Run the local test flow against `/api/vocab-test` and confirm mixed-answer sessions no longer end with low confidence plus GRE/high estimate.
