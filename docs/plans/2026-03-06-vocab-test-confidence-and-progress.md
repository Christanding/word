# Vocab Test Confidence And Progress Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Shorten vocab-test sessions and reduce completion anxiety by lowering the finish confidence target to 90%, improving question ordering, and adding clear progress/remaining guidance in the UI.

**Architecture:** Keep the existing adaptive test structure, review queue, and level switching logic intact. Make the smallest safe changes in the engine and page layers: retune finish thresholds, rank candidate questions by expected information, and surface conservative progress guidance plus a finish-ready banner/modal flow.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Testing Library.

---

### Task 1: Lock behavior with tests

**Files:**
- Modify: `tests/unit/vocab-test-route.test.ts`
- Modify: `tests/unit/vocab-test-page.test.tsx`

**Step 1:** Add route tests for 90% finish-ready behavior.

**Step 2:** Add page tests for completion-condition copy, conservative remaining range, and persistent ready-to-finish hint.

**Step 3:** Run focused tests and confirm they fail for the expected reasons.

### Task 2: Retune finish policy and question ordering

**Files:**
- Modify: `src/lib/vocab-test/engine.ts`

**Step 1:** Change the finish confidence target from 95% to 90%.

**Step 2:** Add a conservative remaining-question estimator based on current confidence and minimum question floor.

**Step 3:** Rank candidate bank questions by expected information gain while preserving current level-switch logic and review queue behavior.

**Step 4:** Run focused tests and confirm the new engine behavior passes.

### Task 3: Surface progress guidance in UI

**Files:**
- Modify: `src/app/app/vocab-test/page.tsx`
- Modify: `src/lib/i18n.ts`

**Step 1:** Show completion conditions with explicit numbers.

**Step 2:** Show a conservative remaining-question range / fallback message.

**Step 3:** Keep the finish modal, update it to 90%, and add a persistent in-page ready-to-finish hint after the first threshold hit.

**Step 4:** Verify the page still preserves existing answer, exit, resume, and history flows.

### Task 4: Final verification

**Files:**
- Verify: `tests/unit/vocab-test-page.test.tsx`
- Verify: `tests/unit/vocab-test-route.test.ts`
- Verify: `tests/unit/definition-display.test.ts`

**Step 1:** Run related unit tests.

**Step 2:** Run TypeScript diagnostics and `tsc --noEmit`.

**Step 3:** Run `npm run build`.

**Step 4:** Report exact verification evidence and note any residual risks.
