# Fullscreen Page Frame Design

## Goal

Refine the home page and convert all feature-related pages from a centered “floating big paper card” layout into a fullscreen page system with an internal reading-width content frame.

## Confirmed Constraints

- Do not change any functionality
- Do not change the current font system
- Keep the current editorial visual direction
- Change only UI layout and presentation
- Apply the fullscreen page treatment to all feature-related pages, including their subpages/detail pages

## Confirmed Layout Rule

The page itself should be fullscreen, but the primary content should still keep a readable internal `max-width` frame.

This means:

- the viewport is fully occupied by the page shell
- the whole page is no longer wrapped by one centered, floating paper block
- internal sections can still use cards, borders, or panels where helpful
- readability and interaction density remain controlled by the inner content frame

## Core Design Shift

### Before

- whole page wrapped in one large centered paper container
- strong feeling of a card placed on a larger canvas

### After

- page shell fills the screen edge-to-edge
- page structure comes from header + section rhythm + inner grid
- local sections can still look like editorial surfaces, but the page itself is no longer a floating card

## Application Strategy

### 1. Home Page

The home page should remain the most expressive surface.

Refinements:

- keep fullscreen page shell
- increase hero breathing room slightly
- make the hero and entry cards feel like one editorial spread instead of one boxed module
- keep the language switch embedded in the page header

### 2. Feature Pages

All feature-related pages should follow the same fullscreen shell pattern:

- fullscreen page background
- internal content frame with `max-width`
- section-based composition
- local cards/panels only where they serve structure

The important distinction is:

- local blocks may still look like paper sections
- the entire page must no longer look like one centered floating paper sheet

### 3. Detail / Subpages

Subpages and detail pages should follow the same rule.

Examples:

- lists
- detail views
- form pages
- testing/review flows
- history/result pages

They may keep narrower reading widths where appropriate, but should still live inside a fullscreen page shell rather than inside one giant centered card.

## Shared UI Rules

### Page Shell

- full viewport width/height feel
- no outer giant bordered paper slab
- spacing and section rhythm define the page

### Content Frame

- use a consistent internal max width
- allow narrower sections only when needed for reading/form usability
- preserve current usability and information hierarchy

### Section Surfaces

- allow local bordered surfaces
- allow local paper-like panels
- avoid making the full page one giant panel

## What Must Stay Unchanged

- all interactions
- all page flows
- all existing logic
- the current serif/mono font system
- semantic button states and functional feedback colors where they matter

## Success Criteria

- home page feels like a fullscreen editorial front page
- feature pages no longer feel like a centered floating paper card
- internal content remains readable and usable through max-width frames
- no functionality changes
- no font changes
- the site remains visually coherent with the current editorial redesign
