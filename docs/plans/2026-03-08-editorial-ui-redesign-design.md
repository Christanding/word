# Editorial UI Redesign Design

## Goal

Redesign the entire product UI toward a calm, editorial, literature-archive aesthetic inspired by `glossaryoftime.com`, while preserving current product usability and interaction efficiency.

## Confirmed Direction

- Scope: full-site visual redesign
- Overall mode: keep the product functional and efficient
- Chosen style direction: `Modern Editorial`
- Do not change any product functionality
- Do not change the already-selected font system (`EB Garamond`, `Noto Serif SC`, mono)
- Only change UI presentation: layout, spacing, color, hierarchy, borders, radius, shadows, and component styling
- Do not copy the reference site's exact layout
- Do not change business logic
- Do not sacrifice usability for pure art direction

## Core Visual Thesis

The product should feel like a contemporary editorial publication rather than a generic SaaS tool.

That means:

- more whitespace
- lighter, calmer hierarchy
- serif-led reading experience
- thinner dividers and quieter containers
- fewer loud gradients, pills, and chunky product controls

The site should read like an edited object, not a dashboard.

## Design Principles

### 1. Editorial Calm

Replace high-chroma product styling with restrained surfaces and typography-driven hierarchy.

- background tones should feel like paper, not app chrome
- visual emphasis should come from scale, spacing, and line rhythm
- decorative effects should be minimal

### 2. Functional Clarity Stays

Even after the redesign:

- navigation must remain obvious
- test actions must remain easy to scan and click
- form controls must remain clear and accessible
- progress and feedback states must remain legible

### 3. Typography Leads the UI

The new font system is already serif-led. The redesign should reinforce that direction by adjusting hierarchy, weight, spacing, and component density rather than fighting it with heavy UI treatments.

### 4. One Visual Language Across the App

Home, login, vocab test, and secondary pages should feel like parts of one editorial system.

## Visual Language

### Color

Target palette direction:

- primary background: paper white / warm off-white
- secondary surfaces: very light gray or warm gray panels
- text: ink black / deep graphite
- accent colors: low-saturation dark tones only

Recommended accents:

- deep oxblood / muted editorial red
- dark olive or muted moss
- optional deep ink blue for links or selected emphasis

Avoid:

- loud purple gradients
- bright SaaS blues as dominant surfaces
- candy-like success/warning colors except where status semantics require them

### Surfaces

Replace strong app-card styling with quieter editorial framing:

- less heavy shadow
- smaller radius or more disciplined radius usage
- more thin borders and separators
- more negative space between blocks

### Typography

- headings should be larger but lighter
- body copy should breathe more
- supporting labels should feel like annotations, not dashboard metadata
- uppercase micro-labels should be used sparingly and with less aggressive tracking than product badges

## Component Strategy

### Buttons

Buttons should feel more like refined editorial controls than chunky CTA pills.

Guidelines:

- reduce visual heaviness
- keep clear affordance
- prefer flatter fills or outlined treatments
- use slightly lighter font weight when possible
- maintain strong contrast for primary actions

### Inputs and Forms

Inputs should resemble editorial entry fields:

- cleaner borders
- calmer focus treatment
- more generous line-height
- less default “admin panel” feeling

### Cards and Panels

Cards should move toward “paper sections” rather than product tiles.

Use:

- thin strokes
- muted backgrounds
- consistent internal spacing
- restrained shadows only where needed

### Status Badges and Tags

Badges should be quieter and less toy-like:

- lighter weight
- subtle tint backgrounds
- tighter color discipline

## Page-Level Direction

### Home Page

Turn the home page into a publication-like entry point:

- stronger hero typography
- more breathing room
- fewer “feature grid” defaults
- sections that feel like editorial chapters or entries

### Vocab Test Page

Keep interaction speed, but shift tone toward a reading-and-response experience:

- the tested word remains the hero
- answer options should feel like annotated choices on a page
- modals and result surfaces should feel quieter and more archival

### Login / Entry Pages

Treat login as an editorial access page, not a generic admin gate:

- calmer framing
- lighter heading treatment
- more refined form rhythm

### Secondary / Utility Pages

Unify them under the same palette, spacing, border, and typography system so the site no longer feels split across multiple design languages.

## Motion

Motion should remain minimal.

Allowed:

- gentle fade/slide reveals
- subtle hover transitions
- smooth state transitions

Avoid:

- flashy hero animations
- excessive micro-interactions
- anything that competes with the reading atmosphere

## Constraints

This redesign must not:

- change business behavior
- change typography family choices already implemented
- reduce usability of vocab test actions
- turn the product into a pure art piece
- introduce a second conflicting design system

## Success Criteria

The redesign is successful when:

- the whole site feels visually unified
- the product still feels efficient to use
- the UI reads as editorial/literary rather than generic SaaS
- home, login, vocab test, and secondary pages all share the same design language
- typography, spacing, borders, and color do most of the work

## Expected Implementation Surface

Likely implementation areas:

- global tokens / globals CSS
- root layout-level classes
- home page
- login page
- vocab test page
- shared button / card / input styling patterns where needed

Implementation should proceed incrementally, with verification after each major surface.
