# Homepage Hero Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the homepage hero feel more like an editorial front cover while preserving the current fullscreen layout, functionality, fonts, and information architecture.

**Architecture:** Keep the current homepage structure and interactive behavior intact. Refine only the hero composition, spacing rhythm, and feature-card icon language inside `src/app/app/app-page-client.tsx`. No routing, translation logic, or font changes are allowed.

**Tech Stack:** Next.js App Router, React, Tailwind utility classes

---

### Task 1: Refine the hero composition into a stronger cover-like layout

**Files:**
- Modify: `src/app/app/app-page-client.tsx`

**Step 1: Keep the homepage behavior unchanged**

Do not alter:

- language switching behavior
- feature card links
- quick setup logic
- review limit behavior

**Step 2: Increase the cover-like rhythm of the hero**

Adjust only presentation details in the hero area:

- stronger vertical breathing room
- slightly more intentional headline/subheadline composition
- more publication-like relationship between kicker, headline, and subtitle

Do not add new content blocks.

**Step 3: Keep the hero aligned with the current fullscreen shell**

The page must remain fullscreen, and the hero should still sit inside the existing internal max-width frame.

---

### Task 2: Replace the colorful feature icons with restrained monochrome editorial symbols

**Files:**
- Modify: `src/app/app/app-page-client.tsx`

**Step 1: Identify the current icon rendering points**

Find the four feature-card icon usages in the homepage feature grid.

**Step 2: Replace them with a quieter icon treatment**

The new icons should be:

- monochrome or near-monochrome
- visually coherent across all cards
- more archival / editorial in tone
- less playful than the current colorful symbols

Allowed implementation approaches:

- inline text symbols
- inline SVG
- small geometric emblem-like treatments

Do not introduce a new icon library if avoidable.

**Step 3: Preserve card labels, links, and hierarchy**

Only the icon treatment and nearby visual rhythm should change.

---

### Task 3: Tighten the relationship between hero and feature index

**Files:**
- Modify: `src/app/app/app-page-client.tsx`

**Step 1: Refine the transition from hero to cards**

Adjust spacing so the feature grid reads more like a table of contents under a cover page.

Targets:

- the gap after subtitle
- the gap before the card grid
- the card internal density if needed

**Step 2: Keep card interactions untouched**

Do not change:

- hrefs
- click targets
- hover behavior semantics
- button text or content

---

### Task 4: Validate the homepage polish did not affect functionality

**Files:**
- Modify: none expected

**Step 1: Run page and route verification**

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

**Step 3: Confirm the preserved constraints**

Check that:

- fonts are unchanged
- homepage remains fullscreen
- no feature entry behavior changed
- language switcher remains in the header

---

### Task 5: Final summary

**Files:**
- Modify: none expected

**Step 1: Summarize visual changes**

Report:

- hero spacing changes
- icon language changes
- card density / transition changes

**Step 2: Explicitly confirm what stayed unchanged**

List:

- functionality
- fonts
- homepage information architecture

**Step 3: Do not create a git commit unless explicitly requested**

No commit should be created unless the user asks for one.
