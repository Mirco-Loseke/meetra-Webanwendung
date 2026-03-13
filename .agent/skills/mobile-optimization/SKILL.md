---
name: Mobile Optimization
description: Professional mobile-first frontend design and implementation for small screen devices (< 768px).
---

# Mobile Optimization Skill

This skill is dedicated to creating a seamless, high-performance experience on smartphones. Mobile users have the most constrained viewport and rely entirely on touch gestures.

## 🎯 Core Objectives

### 1. Mobile-First Architecture
- **Vertical Stack First**: Layouts should naturally stack vertically. Avoid horizontal multi-column grids unless they are strictly necessary and designed as "Mini-Cards".
- **Intelligent Scrolling**: For complex data tables, use a `.table-responsive-wrapper` with forced minimum widths (e.g., `min-width: 1100px`) to preserve readability via horizontal scroll.
- **Hamburger Navigation**: Ensure the sidebar toggles into a clean, smooth-sliding mobile menu.

### 2. Thumb-Friendly Interaction
- **Safe Zone Alignment**: Keep interactive elements away from the very edges of the screen where system gestures might interfere.
- **Large Interaction Areas**: Every button or link should be easy to hit with a thumb. 
- **Gestures**: Consider swipe gestures for closing modals or switching tabs if appropriate.

### 3. Visual Compression
- **Simplified UI**: Hide non-essential columns or decorative elements using `.hidden-mobile` to reduce clutter.
- **High-Impact Typography**: Large enough for easy reading, but compact enough to fit titles within the width.
- **Card-Based UX**: Instead of long rows, transform complex data into "Actionable Cards" when possible.

## 🛠️ Implementation Checklist
- [ ] Check `style.css` for `@media (max-width: 768px)` or smaller.
- [ ] Verify that all forms are single-column and labels are visible.
- [ ] Ensure SVG icons are sharp and not too small (`24px` standard).
- [ ] Test on Chrome DevTools with "iPhone 12 Pro" and "Pixel 7" presets.

## 💡 Best Practices
- **Performance**: Mobile users are sensitive to load times. Minimize heavy CSS effects if performance drops.
- **Legibility**: Use high contrast for secondary text, as mobile screens are often used in bright outdoor light.
- **Feedback**: Provide clear visual feedback for every tap (hover effects don't exist on touch, use `:active`).
