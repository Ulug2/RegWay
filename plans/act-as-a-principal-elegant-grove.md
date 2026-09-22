# Regulatory Intelligence Platform — Implementation Plan

## Context

Build a high-fidelity B2B SaaS web app for an AI-powered regulatory intelligence platform targeting Private Equity firms and GPs. The brief explicitly specifies frosted glassmorphism aesthetics. This is a greenfield build on a blank React+Vite+Tailwind v4 canvas (`App.tsx` is a single empty div).

The deliverable is a multi-screen application with 4 primary views:
1. 3-Step Guided Onboarding Modal
2. Executive Dashboard (primary screen)
3. Harvey AI Copilot slide-up drawer
4. Regulatory Headline Deep-Dive Detail View

---

## Design Tokens & Typography

### Fonts (Google Fonts via @import in src/index.css)
- **Inter** (weights 300–700) — primary typeface for all UI text per the brief

### Color Tokens (in src/index.css via @theme)
```
--color-canvas: #FDFBF7
--color-canvas-alt: #F8F6F0
--color-glass-fill: rgba(255,255,255,0.75)
--color-glass-border-start: rgba(255,255,255,0.95)
--color-glass-border-end: rgba(186,230,253,0.35)
--color-sky-sphere: #BAE6FD
--color-ice-sphere: #E0F2FE
--color-primary: #0284C7
--color-primary-light: #38BDF8
--color-ice: #E0F2FE
--color-text-900: #0F172A
--color-text-600: #334155
--color-text-400: #64748B
--color-amber: #F59E0B
--color-emerald: #10B981
--color-rose: #F43F5E
```

### Glassmorphism utility classes (defined in src/index.css)
```css
.glass-card {
  background: rgba(255,255,255,0.75);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid;
  border-image: linear-gradient(135deg, rgba(255,255,255,0.95), rgba(186,230,253,0.35)) 1;
  border-radius: 16px;
}
.glass-modal { border-radius: 24px; backdrop-filter: blur(24px); }
.glass-pill { border-radius: 9999px; }
```

---

## File Structure

All logic lives in `src/App.tsx` with extracted sub-components as named functions in the same file (or split into `src/components/` if the file grows beyond ~600 lines). No router — view switching via React state.

```
src/
  App.tsx          — root shell + view state + ambient background
  index.css        — Google Font imports, @theme tokens, glass utilities
  components/
    OnboardingModal.tsx
    Dashboard.tsx
    HarveyAICopilot.tsx
    HeadlineDetailView.tsx
    shared/
      GlassCard.tsx
      Badge.tsx
      AvatarButton.tsx
```

---

## Implementation Plan

### Step 1 — Global CSS Setup (src/index.css)
1. Add Google Fonts @import for Inter at top of file
2. Add @theme block with all color tokens
3. Add glassmorphism utility classes (.glass-card, .glass-modal, .glass-pill, .glass-input)
4. Add ambient background spheres as CSS custom properties for radial gradients
5. Hide scrollbars by default, show on hover

### Step 2 — App Shell & Ambient Background (src/App.tsx)
- Canvas: `bg-[#FDFBF7]` with two absolutely-positioned blurred radial gradient spheres (sky blue `#BAE6FD` and ice blue `#E0F2FE`, each ~600–800px, blur-3xl, opacity-40)
- View state: `'onboarding' | 'dashboard' | 'detail' | 'harvey'` — start on `'onboarding'`
- Render the active view component over the ambient background

### Step 3 — Onboarding Modal (src/components/OnboardingModal.tsx)
- Full-screen dimmed backdrop (bg-black/30 backdrop-blur-sm)
- Central glass card (max-w-2xl, glass-modal class)
- 3-step pill progress indicator at top
- Step 1: Firm Name, HQ Location, Operating Jurisdictions (multi-select tags), GP profiles
- Step 2: Dynamic portfolio company creator with Company Name, Industry Sector tags, Regions, AUM, Core Offerings
- Step 3: Fund count, Fund Names array, Fund Size, Legal Structure select, Target Jurisdictions
- Footer: ghost "Save Draft" button + solid sky-blue "Complete Setup & Launch Dashboard" pill button
- State: `currentStep` (1–3), form data objects, tag arrays

### Step 4 — Primary Executive Dashboard (src/components/Dashboard.tsx)
- Sticky top glass bar: logo (text mark "Lex" + regulatory shield icon), firm switcher dropdown, date range picker, notification bell badge, user avatar
- Hero "Today's Regulatory Pulse" glass card: AI summary text, 3 highlight pills (Amber flagged, Rose critical, Emerald low)
- Command Grid (CSS Grid, 3 cols on desktop, 1 col mobile):
  - PE Firm regulatory column (5 clickable headline cards)
  - Fund regulatory column (5 headline cards)
  - Portfolio Companies grid (6 company cards with logo, name, impact count badge)
- Harvey AI prompt bar: large glass pill input "Ask Harvey AI about today's regulatory impact across your funds and portfolio..." with mic icon + send button
- Translucent footer nav

**Realistic data**: Use real-sounding PE firm names (Blackstone, Apollo, KKR), fund names, jurisdictions (Delaware, Luxembourg, SEC, FINRA, FCA), portfolio companies (fintech, healthcare, infrastructure sectors), and regulation references (Dodd-Frank, MiFID II, AIFMD, Form PF, SEC Rule 18f-4).

### Step 5 — Harvey AI Copilot Drawer (src/components/HarveyAICopilot.tsx)
- Slides up from bottom to full-height via CSS transform + transition (translateY 100% → 0%)
- Split layout: conversation area (left/main) + context panel (right, collapsible)
- User query bubbles: soft translucent sky-blue glass pill
- Harvey response cards: frosted white glass cards with citation chips (e.g. "17 CFR §275.204-2")
- Action chips row: "Summarize today's changes", "Impact on Portfolio Co", "Compare regulations", "Export to PDF"
- Input bar at bottom matches dashboard prompt bar style
- Dismiss via X button or click overlay

### Step 6 — Headline Detail View (src/components/HeadlineDetailView.tsx)
- Back button, headline title, jurisdiction badge, effective date
- Glass action toolbar: "Flag for Review" (amber toggle), "Add Note" (slide-out glass notepad panel), "Original Source" external link
- Side-by-side comparison matrix: Previous Regulation vs New Regulation (glass cards, color-coded diff highlights)
- 3-Way AI Impact Grid: PE Firm impact card (slate), Active Funds card (sky-blue), Portfolio Companies card (ice)
- AI Risk/Opportunity analysis card
- Primary source link card (gov.domain style)

### Step 7 — Shared Components
- `GlassCard.tsx`: wraps children with glass-card class + optional hover shadow lift (`hover:shadow-sky-200/40`)
- `Badge.tsx`: status badges for Amber/Emerald/Rose/Sky with appropriate backgrounds
- Transitions: 200ms ease-out on all interactive states

---

## Key Technical Decisions

- **No router**: view switching via `useState` in App.tsx — appropriate for a prototype/demo
- **No external icon library**: use inline SVG or Unicode symbols for icons (avoids dependency)
  - OR install `lucide-react` (very lightweight) for crisp icons — prefer this
- **No chart library needed**: no charts in the brief
- **Backdrop-filter**: use both `backdrop-filter` and `-webkit-backdrop-filter` for compatibility
- **Border gradient on glass cards**: use `border-image` or a pseudo-element `::before` approach since CSS `border-image` doesn't support `border-radius`. Use the pseudo-element technique with `background: linear-gradient(...)` clipped to border area via padding and background-clip.
- **Tailwind v4**: all custom tokens in `src/index.css` under `@theme {}`, use `border-image` workaround in plain CSS classes

### Glass border technique (border-radius + gradient border):
```css
.glass-card {
  position: relative;
  background: rgba(255,255,255,0.75);
  backdrop-filter: blur(20px);
  border-radius: 16px;
}
.glass-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(135deg, rgba(255,255,255,0.95), rgba(186,230,253,0.35));
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
```

---

## Realistic Placeholder Data

- **Firm**: Meridian Capital Partners (fictional PE firm, HQ: New York)
- **Funds**: Meridian Fund VI ($2.4B, Delaware LP), Meridian Europe SCSp (€800M, Luxembourg)
- **Portfolio companies**: NovaPay (Fintech), ClearPath Health (Healthcare), GridForce (Infrastructure), Veritas Data (SaaS), ArcLight Energy (Energy), Portsmith Logistics (Logistics)
- **Regulations**: SEC Proposed Rule on Private Fund Advisers, EU AIFMD II implementation, Form PF reporting amendments, Delaware LLC Act amendments

---

## Verification

1. Dev server already running — check preview panel for visual output after each major step
2. Verify glassmorphism renders correctly: backdrop-filter blur visible on cards over ambient spheres
3. Check all 4 views are reachable via state transitions
4. Verify WCAG AA contrast on text over glass surfaces (slate-900 on white/0.75 glass passes easily)
5. Verify responsive collapse at ~1000px (CSS Grid `grid-cols-1 md:grid-cols-3`)
