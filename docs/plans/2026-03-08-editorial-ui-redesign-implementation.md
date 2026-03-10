# Editorial UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the site into a modern editorial aesthetic inspired by glossaryoftime.com while preserving all existing functionality and the current font system.

**Architecture:** Keep the redesign strictly in the presentation layer. Use global tokens and page-level styling refinements to shift the product from SaaS-like chrome toward a calmer editorial system. Do not modify behavior, flows, data logic, or the existing font choices (`EB Garamond`, `Noto Serif SC`, mono).

**Tech Stack:** Next.js App Router, React, Tailwind utility classes, global CSS

---

### Task 1: Establish global editorial UI tokens without changing fonts

**Files:**
- Modify: `src/app/globals.css`

**Step 1: Write the failing visual acceptance target**

Define the intended token changes before implementation:

- paper-like backgrounds instead of stark product-white
- calmer border and divider colors
- lower-shadow, flatter surface language
- no changes to `font-family` variables already in place

**Step 2: Inspect current global tokens**

Review `src/app/globals.css` and identify the current background, foreground, border, and base body styles.

**Step 3: Implement minimal global token refinement**

Adjust only presentation tokens, for example:

- background tone
- foreground tone
- shared divider rhythm
- body line-height / selection / surface defaults

Do **not** change:

- the current serif + mono font-family mapping
- behavior or component logic

**Step 4: Run validation**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

---

### Task 2: Redesign the home page into a modern editorial landing surface

**Files:**
- Modify: `src/app/app/app-page-client.tsx`
- Verify: `src/app/page.tsx` if needed for routing wrapper only

**Step 1: Add page-specific acceptance checks**

The home page should:

- feel like an editorial front page
- keep all current actions and navigation intact
- rely more on spacing, lines, muted surfaces, and hierarchy than on product-card styling

**Step 2: Refactor only the visual layer**

Make visual-only changes to:

- hero spacing and composition
- section framing
- card styling
- button styling
- list rhythm and divider usage

Keep intact:

- click targets
- navigation behavior
- form behavior
- translation logic

**Step 3: Run page-level verification**

Run:

```bash
npm test -- --run tests/unit/vocab-test-page.test.tsx
```

Expected: PASS.

---

### Task 3: Reframe login and form surfaces as editorial entry pages

**Files:**
- Modify: `src/app/login/page.tsx`

**Step 1: Keep the form behavior unchanged**

Do not alter:

- inputs
- submission flow
- validation behavior
- loading/error handling

**Step 2: Update the visual framing only**

Refine:

- container width and spacing
- heading treatment
- input surface styling
- button chrome
- supporting copy rhythm

Keep the current font families unchanged.

**Step 3: Re-run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

---

### Task 4: Make the vocab test page feel like a reading-and-response artifact

**Files:**
- Modify: `src/app/app/vocab-test/page.tsx`

**Step 1: Define the visual intent**

The vocab test page should remain highly usable, but visually feel calmer and more literary:

- the tested word remains the hero
- answer choices feel like editorial choices on a page
- result/modals/history feel quieter and more archival

**Step 2: Apply only UI styling changes**

Adjust:

- card/background treatments
- button chrome
- modal surfaces
- dividers and spacing
- status chips and badges

Do not alter:

- test flow
- answer submission logic
- finish logic
- progress logic

**Step 3: Run page and regression verification**

Run:

```bash
npm test -- --run tests/unit/vocab-test-page.test.tsx tests/unit/vocab-test-route.test.ts
```

Expected: PASS.

---

### Task 5: Normalize shared UI language across remaining app surfaces

**Files:**
- Search: `src/app/**/*.tsx`

**Step 1: Search for obvious outliers**

Search for pages/components that still visually use:

- heavy shadows
- bright product gradients
- oversized pills
- conflicting border radius patterns

**Step 2: Apply minimal consistency fixes only where needed**

Examples:

- standardize border tone
- standardize card radius
- standardize button emphasis hierarchy

Do not broaden this into a full component-library rewrite.

---

### Task 6: Final validation

**Files:**
- Modify: none expected

**Step 1: Run core verification**

Run:

```bash
npm test -- --run tests/unit/vocab-test-page.test.tsx tests/unit/vocab-test-route.test.ts
npx tsc --noEmit
npm run build
```

Expected: PASS.

**Step 2: Manual visual review checklist**

Check that:

- fonts are unchanged from the current serif/mono setup
- interactions still behave exactly the same
- home, login, vocab test, and secondary pages feel part of one editorial system
- no UI surface regressed into cramped spacing or unusable contrast

**Step 3: Final summary**

Summarize:

- files changed
- visual principles applied
- what stayed intentionally unchanged (fonts, functionality)
- validation results

**Step 4: Do not create a git commit unless explicitly requested**

No commit should be created unless the user asks for one.
