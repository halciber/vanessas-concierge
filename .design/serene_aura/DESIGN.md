---
name: Serene Aura
colors:
  surface: '#fbf9f8'
  surface-dim: '#dbd9d9'
  surface-bright: '#fbf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f3'
  surface-container: '#efeded'
  surface-container-high: '#eae8e7'
  surface-container-highest: '#e4e2e2'
  on-surface: '#1b1c1c'
  on-surface-variant: '#4d4547'
  inverse-surface: '#303030'
  inverse-on-surface: '#f2f0f0'
  outline: '#7e7577'
  outline-variant: '#d0c3c6'
  surface-tint: '#665c5e'
  primary: '#665c5e'
  on-primary: '#ffffff'
  primary-container: '#fff0f3'
  on-primary-container: '#776c6f'
  inverse-primary: '#d1c3c6'
  secondary: '#665978'
  on-secondary: '#ffffff'
  secondary-container: '#ead9fe'
  on-secondary-container: '#6a5d7c'
  tertiary: '#416656'
  on-tertiary: '#ffffff'
  tertiary-container: '#d4fde8'
  on-tertiary-container: '#527766'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#eddfe2'
  primary-fixed-dim: '#d1c3c6'
  on-primary-fixed: '#211a1c'
  on-primary-fixed-variant: '#4e4447'
  secondary-fixed: '#ecdcff'
  secondary-fixed-dim: '#d0c0e4'
  on-secondary-fixed: '#211631'
  on-secondary-fixed-variant: '#4d415f'
  tertiary-fixed: '#c3ecd7'
  tertiary-fixed-dim: '#a8cfbc'
  on-tertiary-fixed: '#002115'
  on-tertiary-fixed-variant: '#294e3f'
  background: '#fbf9f8'
  on-background: '#1b1c1c'
  surface-variant: '#e4e2e2'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.02em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  base: 8px
  margin-mobile: 24px
  margin-desktop: 64px
  gutter: 16px
  stack-sm: 12px
  stack-md: 24px
  stack-lg: 48px
---

## Brand & Style
The design system is centered on emotional wellness and gentle productivity. It targets users seeking a sanctuary from high-stress digital environments, evoking a sense of "digital breathing room." 

The style is a sophisticated blend of **Minimalism** and **Soft Modernism**. It prioritizes low-frequency visual stimuli, using wide margins, airy compositions, and a total absence of sharp edges or aggressive contrasts. Every interaction should feel fluid and supportive, like a physical object made of soft, tactile material.

## Colors
The palette is built on a foundation of "Blush Mist" (#FFF5F7), which serves as the primary canvas for all screens. This choice reduces eye strain compared to pure white. 

- **Primary (Accent):** A soft lavender for primary actions and highlights.
- **Task Categorization:** Mint Green is reserved for completion/success, while Sky Blue is used for informational states or calm focus tasks.
- **Typography & Details:** We avoid pure black (#000000) entirely, opting for a deep charcoal gray to maintain the soft aesthetic while ensuring high legibility.

## Typography
This design system utilizes **Plus Jakarta Sans** exclusively. Its soft, rounded terminals and open apertures provide exceptional legibility while reinforcing the brand's friendly and optimistic personality.

Headlines should use slightly tighter letter spacing to create a cohesive visual block, while body text remains standard for maximum readability. We use font weight to establish hierarchy rather than color contrast, keeping the overall tonal range narrow and peaceful.

## Layout & Spacing
The layout follows a **Fixed Grid** philosophy on desktop to prevent content from becoming too sparse on ultra-wide monitors, maintaining a "contained" and organized feel. 

- **Desktop:** 12-column grid, max-width 1120px, 64px side margins.
- **Mobile:** Single column with generous 24px horizontal safe areas.

Spacing relies on a strict 8px rhythmic scale. We favor large internal padding within cards and containers (typically 24px or 32px) to ensure content never feels crowded.

## Elevation & Depth
Depth is created through **Tonal Layering** and **Ambient Shadows**. Instead of traditional drop shadows, we use "Glow Shadows"—low-opacity, highly diffused blurs that use a slightly darker version of the background color rather than gray.

- **Level 0 (Base):** The Blush Mist background.
- **Level 1 (Cards):** Pure white surfaces with a 16px blur, 4% opacity shadow.
- **Level 2 (Floating/Active):** Pure white surfaces with a 32px blur, 8% opacity shadow.

No hard borders or high-contrast outlines are permitted. All separation is achieved through subtle color shifts or these soft shadows.

## Shapes
The shape language is defined by extreme roundedness. By utilizing a level **3** (Pill-shaped) setting, the UI eliminates all sharp corners, which can subconsciously trigger "alert" responses in users. 

Large containers like cards should use a minimum of 24px (rounded-2xl) to 32px (rounded-3xl) corner radii. Interactive elements like buttons and chips should be fully pill-shaped.

## Components
- **Buttons:** Fully pill-shaped. Primary buttons use the Lavender accent with dark charcoal text. Secondary buttons are white with a Lavender border-tint.
- **Cards:** White backgrounds, 32px corner radius, and a soft ambient shadow. Cards should have generous internal padding (min 24px).
- **Chips/Tags:** Used for task categories. These use the Mint, Sky Blue, and Lavender accents at 20% opacity with full-strength text color for high legibility without visual noise.
- **Input Fields:** Soft gray-pink background (#FDF2F4) with no border. On focus, they transition to a white background with a subtle lavender glow.
- **Lists:** Items are separated by whitespace or very faint, 1px lines in a slightly darker pink (#FCE4EC), never harsh grays.
- **Progress Indicators:** Use the Mint Green accent with a soft, rounded track. The motion should be slow and easing-heavy.