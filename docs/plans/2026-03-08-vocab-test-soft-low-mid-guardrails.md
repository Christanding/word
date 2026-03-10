# Vocab Test Soft Low-Mid Guardrails Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current hard low/mid ceilings with softer conservative target bands so low-mid users no longer repeatedly land exactly on `3400` and `4900`.

**Architecture:** Keep the existing weighting, early-finish thresholds, and high-band protection unchanged. Limit the change to the guardrail layer in `src/lib/vocab-test/engine.ts` by converting the current hard ceilings into low-mid conservative target bands with small floating ranges, then lock the new behavior with targeted engine tests and seeded live verification.

**Tech Stack:** TypeScript, Next.js route handlers, Vitest, local seeded HTTP evaluation script

---

### Task 1: Define soft low-mid conservative targets

**Files:**
- Modify: `src/lib/vocab-test/engine.ts`
- Test: `tests/unit/vocab-test-engine.test.ts`

**Step 1: Add explicit soft target constants**

Add constants near the current low-mid guardrail helpers for the new target ranges:

```ts
const CET4_SOFT_TARGET = { min: 3200, max: 3300 };
const CET6_SOFT_TARGET = { min: 4700, max: 4800 };
```

Also add a short helper signature for calculating a bounded target inside those ranges:

```ts
function getSoftTargetInBand(
  input: EstimatedVocabGuardrailInput,
  band: { min: number; max: number },
  recentAverageScore: number,
): number
```

**Step 2: Run the existing engine guardrail tests before changing behavior**

Run:

```bash
npm test -- --run tests/unit/vocab-test-engine.test.ts
```

Expected: PASS on current tests before introducing the new soft-band assertions.

**Step 3: Replace the hard `3400` / `4900` low-mid outcomes with soft targets**

Update only the low-mid branches in `getEstimatedVocabCeiling(...)` and the second-pass ceiling application path so that:

- `cet4` low-band outcomes no longer hard-return `3400`
- `cet6` low-mid outcomes no longer hard-return `4900`
- the returned value stays inside the requested conservative range
- the result remains monotonic and never exceeds the incoming estimate

Implementation shape:

```ts
if (/* current cet4 low-band branch */) {
  return getSoftTargetInBand(input, CET4_SOFT_TARGET, recentAverageScore);
}

if (/* current cet6 low-mid branch */) {
  return getSoftTargetInBand(input, CET6_SOFT_TARGET, recentAverageScore);
}
```

Guidelines for `getSoftTargetInBand(...)`:

- bias toward the lower half of the band when the session ended early or confidence is close to the manual-finish floor
- allow only a small upward float when the finish is later and the recent score is slightly stronger
- clamp to `band.min <= result <= band.max`
- always return `Math.min(input.estimatedVocab, target)`

**Step 4: Keep higher-band guardrails unchanged**

Do **not** change these branches in this task:

- `recommendedLevel === "ielts"` early mismatch path
- `recommendedLevel === "gre"` early mismatch path
- `hasStrongAdvancedMasteryEvidence(...)`
- `getEarlyFinishConservativePenalty(...)`

**Step 5: Run the engine test file again**

Run:

```bash
npm test -- --run tests/unit/vocab-test-engine.test.ts
```

Expected: FAIL only on assertions that still expect `3400` / `4900` exactly, or PASS if test updates from Task 2 are already in place.

---

### Task 2: Lock the new soft-band behavior with focused tests

**Files:**
- Modify: `tests/unit/vocab-test-engine.test.ts`

**Step 1: Update low-band exact-ceiling assertions to band assertions**

Replace exact-value expectations with bounded soft-target expectations:

```ts
expect(guarded).toBeGreaterThanOrEqual(3200);
expect(guarded).toBeLessThanOrEqual(3300);
```

for the current low-band cases that now represent `cet4` conservative outcomes.

**Step 2: Update low-mid exact-ceiling assertions to band assertions**

For `cet6` conservative outcomes, use:

```ts
expect(guarded).toBeGreaterThanOrEqual(4700);
expect(guarded).toBeLessThanOrEqual(4800);
```

**Step 3: Add a new regression proving results do not stick to the old hard ceiling**

Add one test case that verifies the output is still below the old hard cap:

```ts
expect(guarded).toBeLessThan(3400);
```

for the `cet4` path, and similarly:

```ts
expect(guarded).toBeLessThan(4900);
```

for the `cet6` path when the soft band is expected.

**Step 4: Add a regression for second-pass soft-band application**

Extend the `resolveGuardedEstimatedVocab(...)` coverage so a case that drops from a higher raw recommendation into `cet4` or `cet6` is asserted inside the new target band, not on the former hard ceiling.

Example target shape:

```ts
expect(resolved.recommendedLevel).toBe("cet4");
expect(resolved.estimatedVocab).toBeGreaterThanOrEqual(3200);
expect(resolved.estimatedVocab).toBeLessThanOrEqual(3300);
```

**Step 5: Run the engine tests and confirm all pass**

Run:

```bash
npm test -- --run tests/unit/vocab-test-engine.test.ts
```

Expected: PASS.

---

### Task 3: Verify the full vocab-test regression surface

**Files:**
- Modify: none expected
- Test: `tests/unit/vocab-test-engine.test.ts`
- Test: `tests/unit/vocab-test-progress.test.ts`
- Test: `tests/unit/vocab-test-route.test.ts`
- Test: `tests/unit/vocab-test-page.test.tsx`

**Step 1: Run the full focused regression suite sequentially**

Run:

```bash
npm test -- --run tests/unit/vocab-test-engine.test.ts tests/unit/vocab-test-progress.test.ts tests/unit/vocab-test-route.test.ts tests/unit/vocab-test-page.test.tsx
```

Expected: PASS, with no route-test mock DB cross-talk.

**Step 2: Run typecheck and production build**

Run:

```bash
npx tsc --noEmit && npm run build
```

Expected: PASS.

**Step 3: Do seeded live verification for the user-facing result shape**

Run:

```bash
node .local/vocab_eval.js all 3
```

Expected targets:

- `3000` should usually land inside `3200~3300`
- `4500` should usually land inside `4700~4800`
- `6000` should stay at or below roughly `6400`
- `8000` should not get pushed downward materially compared with the current seeded baseline

**Step 4: Record user-facing evaluation notes**

Capture:

- whether low-mid results still feel like hard clipping
- whether finish counts remain in the current `~62-80` range
- whether `8000/high` becomes too conservative

Do not expand scope into new weighting changes unless the soft-band approach clearly fails.

---

### Task 4: Final review and handoff

**Files:**
- Modify: `docs/plans/2026-03-08-vocab-test-soft-low-mid-guardrails.md` (only if clarifications are needed)

**Step 1: Re-read the user goal before declaring success**

Confirm all of the following remain true:

- no increase in total question count or test duration
- low-mid users no longer repeatedly land exactly on the old hard ceilings
- current high-band behavior is preserved as much as possible

**Step 2: Summarize verification evidence**

Prepare a short report listing:

- changed files
- test commands run
- seeded live results before vs after
- any remaining tradeoffs

**Step 3: Do not create a git commit unless the user explicitly asks**

This repo rule overrides the default “frequent commits” planning pattern for execution in this session.
