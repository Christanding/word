# Font Replacement Design

## Goal

Replace global body typography so English text uses `EB Garamond`, Chinese text uses `思源宋体` via `Noto Serif SC`, and code / mono content keeps a dedicated monospaced font.

## Confirmed Scope

- Replace global body text fonts only
- Keep code, preformatted, and mono-oriented UI content on a mono font
- Avoid changing business logic, component behavior, or page structure
- Minimize the implementation surface to the global app entry points

## Recommended Approach

Use `next/font/google` in `src/app/layout.tsx` to load:

- `EB_Garamond` for Latin text
- `Noto_Serif_SC` for Chinese text
- keep a mono font for code and fixed-width content

Then wire those fonts into global CSS variables in `src/app/globals.css` and make the main body typography use the serif stack instead of the current `Geist` / `Arial` fallback.

This keeps font loading optimized, preserves SSR-safe font handling, and avoids component-by-component edits.

## Design Details

### 1. Global Font Loading

Current state:

- `src/app/layout.tsx` loads `Geist` and `Geist_Mono`
- `src/app/globals.css` maps `--font-sans` and `--font-mono`
- `body` still explicitly uses `Arial, Helvetica, sans-serif`

Target state:

- Replace the current sans font import with `EB_Garamond`
- Replace the Chinese serif source with `Noto_Serif_SC`
- Keep a mono font variable for code and fixed-width content
- Add both serif font variables to `<body>` so CSS can compose a mixed Chinese/English serif stack

### 2. Typography Mapping

Body text should use a variable-driven serif stack, for example:

- English-first serif variable: `--font-eb-garamond`
- Chinese serif variable: `--font-noto-serif-sc`
- Mono variable: `--font-mono`

CSS should define:

- `--font-sans` as the serif reading stack used by the app body and normal UI copy
- `--font-mono` as the mono stack used for code and narrow utility text

The body font-family should stop hardcoding `Arial, Helvetica, sans-serif` and instead use the global serif stack.

### 3. Functional Guardrails

The change must not:

- alter code blocks or mono content into Garamond
- change app behavior, routing, or visual layout logic
- require component-level font overrides unless an existing component already hardcodes its own font-family

If any component later overrides fonts locally, that should be handled only if discovered during implementation verification.

## Alternatives Considered

### A. Global `next/font` replacement only (recommended)

- Lowest risk
- Smallest code surface
- Best caching / loading behavior

### B. Plain CSS `font-family` stacks without `next/font`

- Simpler on paper
- Worse loading control and weaker integration with current Next.js setup

### C. Fine-grained `:lang(zh)` / `:lang(en)` selectors

- More explicit language routing
- Unnecessarily complex for this app right now
- More likely to miss mixed-language UI cases

## Validation Plan

Implementation should verify:

- `src/app/layout.tsx` compiles with new font imports
- `src/app/globals.css` applies the new body font stack globally
- English text renders with `EB Garamond`
- Chinese text renders with `Noto Serif SC`
- code / mono content still uses the mono stack
- `npx tsc --noEmit` passes
- `npm run build` passes

## Files Expected To Change

- `src/app/layout.tsx`
- `src/app/globals.css`

Potentially, but only if verification reveals hardcoded overrides:

- specific component styles with explicit `font-family`

## Risks

- `Noto Serif SC` is the Google-hosted equivalent used to deliver the open-source 思源宋体 family in this setup; naming in code may differ from the Chinese product name the user requested, but the intended typeface family is aligned
- Some utility classes or component-level styles may still override body fonts and need small follow-up fixes if found during implementation

## Success Criteria

- Global English body text uses `EB Garamond`
- Global Chinese body text uses `思源宋体` / `Noto Serif SC`
- Mono text remains mono
- No business logic regressions
- Build and typecheck pass
