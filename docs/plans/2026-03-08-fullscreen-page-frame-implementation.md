# Fullscreen Page Frame Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the home page feel like a true fullscreen editorial front page and convert all feature-related pages to fullscreen page shells with internal max-width content frames, without changing functionality or the current font system.

**Architecture:** Keep the redesign entirely in the presentation layer. Remove the page-level "floating big paper card" wrapper pattern and replace it with fullscreen page shells plus narrower internal content frames where needed. Preserve current interaction logic, routes, forms, test flow, and the existing serif/mono font setup.

**Tech Stack:** Next.js App Router, React, Tailwind utility classes, global CSS

---

### Task 1: Inventory all feature pages that still use page-level floating paper wrappers

**Files:**
- Search: `src/app/**/*.tsx`

**Step 1: Search for page-level wrapper patterns**

Search for visual patterns that suggest a centered floating page wrapper, such as:

- `mx-auto max-w-* border bg-* shadow-*`
- `rounded-* border bg-* shadow-*` on the outermost page shell
- large outer wrappers that visually box the whole page

Run searches for:

```bash
grep -R "mx-auto max-w\|rounded-\|shadow-\|border" src/app
```

Expected: identify the main page-level wrapper files for feature pages and subpages.

**Step 2: Write down the target list before editing**

At minimum, include:

- `src/app/app/app-page-client.tsx`
- `src/app/app/vocab-test/page.tsx`

Then expand to all feature-related pages and subpages that still visually wrap the whole page in one centered paper block.

**Step 3: Do not edit functionality while inventorying**

This step is discovery only.

---

### Task 2: Refine the home page into a true fullscreen editorial front page

**Files:**
- Modify: `src/app/app/app-page-client.tsx`
- Verify: `src/app/language-provider.tsx` only if needed for homepage language placement

**Step 1: Keep the current homepage behavior intact**

Do not change:

- links
- quick setup behavior
- review limit logic
- language switching behavior

**Step 2: Remove the page-level floating paper shell**

Change the homepage so:

- the page shell fills the viewport
- the outer experience feels like a fullscreen editorial page
- the internal content still uses a readable max-width

The homepage must no longer feel like one large card placed in the middle of the screen.

**Step 3: Keep language controls inside the page header**

The language switcher should remain a light editorial control in the header, not a floating top-right pill.

**Step 4: Apply a small homepage-only polish pass**

Focus only on 1-2 high-value refinements, for example:

- hero vertical breathing room
- card density / spacing rhythm
- section spacing under the hero

Do not broaden this into another full redesign pass.

**Step 5: Run homepage/page-level verification**

Run:

```bash
npm test -- --run tests/unit/vocab-test-page.test.tsx
```

Expected: PASS.

---

### Task 3: Convert feature pages to fullscreen page shells

**Files:**
- Modify: all feature-related `src/app/**/page.tsx` files identified in Task 1

**Step 1: Replace outer page wrappers, not inner local cards**

For each feature page:

- remove the page-level floating paper-card treatment
- keep the page itself fullscreen
- preserve a readable internal `max-width` content frame
- allow local cards/panels only where they support structure inside the page

The page should no longer look like one centered bordered slab.

**Step 2: Preserve page-specific usability**

Do not change:

- forms
- test controls
- filters
- tables
- buttons
- links
- client-side state behavior

Only change layout and presentation.

**Step 3: Apply the same shell rule to subpages/detail pages**

This includes feature-adjacent pages such as:

- detail views
- list/detail combinations
- form pages
- result/history views

Use narrower internal frames where appropriate, but keep the overall page fullscreen.

---

### Task 4: Resolve page-level visual inconsistencies after fullscreen conversion

**Files:**
- Modify: only files that visibly conflict after Task 3

**Step 1: Check for pages that now feel too loose or too cramped**

Look for:

- content that becomes too wide
- headers that lose hierarchy
- sections that need dividers after the wrapper disappears

**Step 2: Add minimal supporting structure**

Allowed fixes:

- inner max-width wrappers
- section padding
- thin divider lines
- local panel adjustments

Do not reintroduce the old full-page floating card pattern.

---

### Task 5: Final verification

**Files:**
- Modify: none expected

**Step 1: Run focused page and route verification**

Run:

```bash
npm test -- --run tests/unit/vocab-test-page.test.tsx tests/unit/vocab-test-route.test.ts
```

Expected: PASS.

**Step 2: Run typecheck and production build**

Run:

```bash
npx tsc --noEmit && npm run build
```

Expected: PASS.

**Step 3: Manual review checklist**

Confirm:

- home page feels fullscreen, not boxed-in
- language switcher stays in the homepage header as a light editorial control
- feature pages are fullscreen at the shell level
- internal content remains readable through max-width framing
- fonts remain unchanged
- no functionality changed

**Step 4: Do not create a git commit unless explicitly requested**

No commit should be created unless the user asks for one.
