# Font Replacement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace global English body typography with `EB Garamond`, Chinese body typography with `Noto Serif SC` (for the 思源宋体 line), and keep code / mono content on a monospaced font.

**Architecture:** Keep the implementation centralized in the app shell. Load fonts in `src/app/layout.tsx` through `next/font/google`, expose them as CSS variables on `<body>`, and switch the global body stack in `src/app/globals.css` to the new serif combination while preserving the mono variable for code and fixed-width content.

**Tech Stack:** Next.js App Router, `next/font/google`, global CSS, Tailwind theme variables

---

### Task 1: Replace global font imports in the root layout

**Files:**
- Modify: `src/app/layout.tsx`

**Step 1: Inspect the current font imports and body variables**

Check `src/app/layout.tsx` and confirm it currently imports `Geist` and `Geist_Mono`, then attaches their CSS variables to `<body>`.

**Step 2: Write the minimal font-loading replacement**

Replace the current imports and font declarations with:

- `EB_Garamond`
- `Noto_Serif_SC`
- one mono font kept for code / fixed-width content

Implementation target:

```ts
import { EB_Garamond, Noto_Serif_SC, Geist_Mono } from "next/font/google";

const ebGaramond = EB_Garamond({
  variable: "--font-eb-garamond",
  subsets: ["latin"],
});

const notoSerifSc = Noto_Serif_SC({
  variable: "--font-noto-serif-sc",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});
```

Then apply the variables to `<body>`:

```tsx
<body className={`${ebGaramond.variable} ${notoSerifSc.variable} ${mono.variable} antialiased`}>
```

**Step 3: Run typecheck on the layout change**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

---

### Task 2: Switch the global body stack to the new serif fonts

**Files:**
- Modify: `src/app/globals.css`

**Step 1: Replace the current font variable mapping**

Update the `@theme inline` section so the app-level text stack uses the new serif variables instead of `--font-geist-sans`.

Implementation target:

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-eb-garamond), var(--font-noto-serif-sc);
  --font-mono: var(--font-mono);
}
```

If a self-referential mono variable becomes confusing, rename the CSS variable consistently so the Tailwind theme still points to the mono font variable loaded from layout.

**Step 2: Replace the hardcoded body font-family**

Remove:

```css
font-family: Arial, Helvetica, sans-serif;
```

and replace it with the serif stack:

```css
font-family: var(--font-eb-garamond), var(--font-noto-serif-sc), serif;
```

**Step 3: Ensure mono content is preserved**

If the project has explicit code/pre/mono styling, make sure it still resolves to the mono variable instead of inheriting the body serif stack.

**Step 4: Run typecheck/build after CSS changes**

Run:

```bash
npx tsc --noEmit && npm run build
```

Expected: PASS.

---

### Task 3: Verify there are no remaining hardcoded global font conflicts

**Files:**
- Search: `src/**/*.tsx`
- Search: `src/**/*.css`

**Step 1: Search for remaining hardcoded font-family declarations**

Run searches for:

- `font-family`
- `Geist`
- `Arial`

Expected: only intentional mono-specific declarations remain.

**Step 2: Fix only actual global conflicts**

If any component-level style is forcing the old global body font, update it only when necessary. Do not perform broad aesthetic refactors.

**Step 3: Re-run targeted verification**

Run:

```bash
npm test -- --run tests/unit/vocab-test-page.test.tsx
```

Expected: PASS if page-level rendering assumptions remain intact.

---

### Task 4: Manual visual verification

**Files:**
- Verify: `src/app/layout.tsx`
- Verify: `src/app/globals.css`

**Step 1: Start the app if needed and inspect mixed-language text**

Check at least one page with:

- English headings or labels
- Chinese text
- code or fixed-width UI text

Expected:

- English body text renders in `EB Garamond`
- Chinese body text renders in `Noto Serif SC`
- code/fixed-width text remains mono

**Step 2: Confirm no layout regressions**

Look for:

- line-height issues
- button or input text clipping
- broken wrapping in mixed Chinese/English text

**Step 3: If issues appear, apply minimal typography-only fixes**

Allowed follow-ups:

- adjust font stacks
- adjust line-height on global body text
- add targeted mono selectors

Do not broaden scope into unrelated UI redesign.

---

### Task 5: Final verification and summary

**Files:**
- Modify: none expected

**Step 1: Run final verification commands**

Run:

```bash
npx tsc --noEmit
npm run build
```

If available and relevant, also run:

```bash
npm test -- --run tests/unit/vocab-test-page.test.tsx
```

**Step 2: Summarize the final state**

Report:

- files changed
- fonts loaded
- whether body text, Chinese text, and mono text behave as intended
- verification commands and outcomes

**Step 3: Do not create a git commit unless the user explicitly asks**

This session must follow the repo rule: no commits without direct user request.
