---
name: iPad Optimization
description: Professional frontend design and functional implementation for iPad screen sizes (768px - 1024px).
---

# iPad Optimization Skill

This skill ensures the application looks and functions like a premium tablet app. It focuses on the specific viewport range between 768px and 1024px, ensuring that the interface is neither "shrunken desktop" nor "blown-up mobile".

## 🎯 Core Objectives

### 1. Layout Stability & Width Control
- **No Horizontal Scrolling**: Fit all critical content (tables, cards) within the screen width.
- **Multitasking & Split View**: Handle varying widths (1/3, 1/2, 2/3) gracefully. Use relative units and avoid hardcoded viewport-based assumptions where possible.
- **Percentage-Based Grids**: Use flexible percentages (`width: 33.3%`) or CSS Grid (`repeat(auto-fit, minmax(...))`) to handle iPad Mini to iPad Pro 12.9".

### 2. Interaction & Spacing
- **Pencil & Pointer**: iPadOS supports hover states via Apple Pencil or Trackpad. Keep subtle hover effects, but ensure they aren't critical for functionality.
- **Safe Area Insets**: Use CSS variables like `env(safe-area-inset-bottom)` to avoid overlapping the home bar on newer iPads.
- **Touch Targets**: Maintain a minimum hit area of `44x44px`.

### 3. Premium Aesthetics
- **Glassmorphism**: Maintain 24px blur, but ensure it performs well during scrolling on mobile chips.
- **Retina Assets**: Use high-resolution SVGs or `srcset` for images to ensure crispness on high-DPI displays.

## 🛠️ Implementation Checklist
- [ ] Check `style.css` for `@media (max-width: 1024px)` overrides.
- [ ] Verify that tables use `table-layout: fixed` when they shouldn't scroll.
- [ ] Ensure navigation icons have sufficient spacing and don't overlap.
- [ ] Test specifically at `820px` (iPad Air) and `768px` (Standard iPad).
- [ ] Test Split View sizes in DevTools.

## 💡 Best Practices
- **Prioritize Content**: If a column is too wide, hide less critical data on iPad using `.hidden-tablet`.
- **Vertical Orientation**: Always test in "Portrait" mode (768px), as this is the most constrained iPad view.
