# GabayX Design System & Direction (DESIGN.md)

## 🏛️ Project Identity
- **Product:** GabayX — Community & LGU Emergency Public Safety Platform
- **Audience:** Ordinary community residents, families, barangay leaders, and local emergency dispatchers
- **Tone:** Honest, calm, intuitive, stress-resilient, trustworthy, accessible
- **Design Dials:** ENERGY 1 (Calm) / RHYTHM 2 (Structured) / MOTION 1 (Minimal & Purposeful)

---

## 🎨 Color Palette (Civic Emergency Palette)

All colors meet WCAG AA contrast ratio standards (4.5:1 minimum for normal text, 3:1 for large text).

### Core Neutrals
- `--bg-canvas`: `#F8FAFC` (Soft warm clean daylight background)
- `--bg-surface`: `#FFFFFF` (Solid, elevated white card/surface)
- `--bg-subtle`: `#F1F5F9` (Secondary surface & input fill)
- `--border-subtle`: `#E2E8F0` (Crisp 1px boundary)
- `--border-focus`: `#0284C7` (Clear keyboard focus ring)
- `--text-primary`: `#0F172A` (Deep slate, maximum legibility)
- `--text-secondary`: `#475569` (Readable slate caption)
- `--text-tertiary`: `#64748B` (Muted helper text)

### Emergency State Accents
- `--alert-danger`: `#DC2626` (Immediate SOS / Critical Danger)
- `--alert-danger-bg`: `#FEF2F2` (Soft red container)
- `--alert-safe`: `#16A34A` (Safe / All Clear status)
- `--alert-safe-bg`: `#F0FDF4` (Soft green container)
- `--alert-warning`: `#D97706` (Hazard warning / Advisory)
- `--alert-warning-bg`: `#FFFBEB` (Soft amber container)
- `--civic-primary`: `#0F766E` (Deep Teal / Public Safety Official action)
- `--civic-primary-hover`: `#115E59`

---

## ✍️ Typography

- **Font Family:** `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`
- **Scale:**
  - Page Title (H1): 28px - 32px (Bold, Line-height 1.25)
  - Card / Section Header: 18px - 20px (Semi-bold, Line-height 1.35)
  - Body Text: 16px (Regular, Line-height 1.5)
  - Helper / Metadata: 13px - 14px (Regular, Line-height 1.4)
- **Rules:**
  - No decorative monospace for titles. Monospace is reserved exclusively for coordinates or voucher codes (`GX-XXXXXX`).
  - No em dashes (`—`).
  - No uppercase tracked-out tech jargon.

---

## 📐 Ergonomics & Accessibility
- **Minimum Touch Target:** 48px height across all buttons and inputs (54px for emergency action buttons).
- **Forms:** Always visible `<label>` tags above inputs with high contrast.
- **Elevation:** Flat with crisp 1px borders, subtle 2px drop-shadow on active elevation layers. No floating mesh blobs, no blurry glassmorphism.
- **Simplicity:** Designed for stress scenarios: large buttons, plain English/Tagalog phrasing, obvious actions.
