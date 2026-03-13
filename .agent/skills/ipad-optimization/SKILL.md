---
name: iPad Optimization
description: Professional frontend design and functional implementation for iPad screen sizes (768px - 1024px).
---

# iPad Optimization Skill

This skill ensures the application looks and functions like a premium tablet app. It focuses on the specific viewport range between 768px and 1024px, ensuring that the interface is neither "shrunken desktop" nor "blown-up mobile".

## 🎯 Core Objectives

### 1. Layout Stability & Width Control
- **No Horizontal Scrolling**: The primary goal is to fit all critical content (tables, cards) within the screen width.
- **Percentage-Based Grids**: Use flexible percentages (`width: 25%`) instead of fixed pixels (`width: 300px`) to handle the slight variations between iPad Mini, iPad Air, and iPad Pro.
- **Fixed Table Layout**: Always use `table-layout: fixed` for data tables to prevent content from pushing the container wide.

### 2. Typography & Spacing Scaling
- **Responsive Font Sizes**: Scale down fonts globally for viewports < 1024px (e.g., `font-size: 0.85rem`).
- **Compact Padding**: Reduce generous desktop padding (`2rem` -> `1rem`) to reclaim screen real estate for content.
- **Touch Targets**: Ensure buttons and interactive elements maintain a minimum hit area of `44x44px` for reliable touch interaction.

### 3. Premium Aesthetics (Tablet Edition)
- **Glassmorphism**: Maintain 24px blur and borders, but ensure transparency doesn't compromise legibility on smaller screens.
- **Micro-Animations**: Use subtle transitions that feel "alive" but don't lag on mobile processors.

## 🛠️ Implementation Checklist
- [ ] Check `style.css` for `@media (max-width: 1024px)` overrides.
- [ ] Verify that tables are wrapped in a `.table-responsive-wrapper`.
- [ ] Ensure navigation icons are properly sized and don't overlap.
- [ ] Use DevTools to test specifically at `820px` (iPad Air) and `768px` (Standard iPad).

## 💡 Best Practices
- **Prioritize Content**: If a column is too wide, hide less critical data on iPad using `.hidden-tablet`.
- **Vertical Orientation**: Always test in "Portrait" mode (768px), as this is the most constrained iPad view.
