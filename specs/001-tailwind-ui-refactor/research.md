# Research: Instagram-Style UI Refinement

**Feature**: 001-tailwind-ui-refactor
**Date**: 2026-01-06

## Research Summary

This feature involves UI refinement using existing Tailwind CSS v4 configuration. The research focuses on best practices for component architecture, Tailwind CSS v4 patterns, and ensuring design consistency.

---

## 1. Tailwind CSS v4 Configuration

**Decision**: Use existing Tailwind CSS v4 setup with CSS-first configuration

**Rationale**:
- The project already has Tailwind CSS v4 installed (`@tailwindcss/postcss` v4, `tailwindcss` v4)
- Using `@import "tailwindcss"` in globals.css (v4 syntax)
- Custom theme variables defined via `@theme inline` block
- No additional configuration needed

**Alternatives Considered**:
- Tailwind CSS v3 with tailwind.config.js - Rejected (already on v4)
- CSS Modules - Rejected (Tailwind already provides utility classes)
- styled-components - Rejected (adds unnecessary dependency)

**Key v4 Patterns to Use**:
```css
/* CSS-first configuration in globals.css */
@import "tailwindcss";

@theme inline {
  --color-primary: var(--primary);
  --color-accent: var(--accent);
}
```

---

## 2. Component Architecture

**Decision**: Extract reusable components with props-based customization

**Rationale**:
- Current code has duplicated HeartIcon in both `page.tsx` and `rank/page.tsx`
- PostCard pattern repeated in home and modal views
- Icons are defined inline in multiple files
- Extracting improves maintainability and testing

**Alternatives Considered**:
- Keep inline components - Rejected (code duplication, harder to test)
- Use third-party icon library - Rejected (adds dependency, current SVGs work well)
- Create monolithic component file - Rejected (harder to tree-shake, test)

**Component Extraction Plan**:
| Current Location | New Component | Reason |
|------------------|---------------|--------|
| page.tsx:17-46 | icons/HeartIcon.tsx | Used in 3 places |
| page.tsx:48-123 | PostCard.tsx | Reusable post display |
| rank/page.tsx:48-143 | PostModal.tsx | Modal overlay pattern |
| BottomNav.tsx:6-43 | icons/*.tsx | Shared navigation icons |

---

## 3. Design Token Mapping

**Decision**: Map design mockup colors to existing CSS variables

**Rationale**:
- Design uses clean white/gray for light mode, dark tones for dark mode
- Existing CSS variables already define this palette
- Maintaining consistency with current implementation

**Color Mapping**:
| Design Element | CSS Variable | Light Value | Dark Value |
|----------------|--------------|-------------|------------|
| Background | --background | #f5f5f5 | #0a1a1a |
| Card/Surface | --card-bg | #ffffff | #0f2a2a |
| Primary text | --foreground | #1a3a3a | #ededed |
| Brand accent | --primary | #1a5c5c | #2d8a8a |
| Action accent | --accent | #3ecf8e | #3ecf8e |
| Borders | --border | #e5e5e5 | #1a3a3a |

---

## 4. Icon Design System

**Decision**: Create consistent icon components with filled/outlined variants

**Rationale**:
- Design mockups show filled icons for active states, outlined for inactive
- Current implementation already uses this pattern inconsistently
- Standardizing improves visual consistency

**Icon Props Interface**:
```typescript
interface IconProps {
  filled?: boolean;  // Active/selected state
  className?: string; // Size and color overrides
}
```

**Icon Sizes**:
- Navigation icons: `w-6 h-6` (24px)
- Action icons (heart, comment): `w-7 h-7` (28px)
- Small inline icons: `w-5 h-5` (20px)

---

## 5. Responsive Design Strategy

**Decision**: Mobile-first with max-width container

**Rationale**:
- Design mockups are mobile-focused (phone frames)
- Current implementation uses `max-w-lg` (512px) for content
- Tailwind's responsive prefixes (sm:, md:, lg:) for breakpoints

**Breakpoint Strategy**:
| Breakpoint | Width | Usage |
|------------|-------|-------|
| Default | < 640px | Mobile layout (primary) |
| sm | ≥ 640px | Slightly larger touch targets |
| md | ≥ 768px | Tablet adjustments |
| lg | ≥ 1024px | Desktop max-width container |

**Container Widths**:
- Home feed: `max-w-lg` (512px)
- Ranking grid: `max-w-2xl` (672px)
- Create post: `max-w-lg` (512px)

---

## 6. Animation & Transitions

**Decision**: Use Tailwind's built-in transition utilities

**Rationale**:
- Design implies subtle hover/active states
- Current code uses `transition-transform`, `hover:scale-110`
- Consistent with performance best practices

**Transition Patterns**:
```css
/* Button hover */
hover:scale-105 transition-transform

/* Opacity fade */
opacity-0 group-hover:opacity-100 transition-opacity

/* Color transitions */
transition-colors
```

---

## 7. Loading States

**Decision**: Enhance skeleton components with animation

**Rationale**:
- Current Skeletons.tsx provides basic structure
- Design expects smooth loading indication
- Tailwind's `animate-pulse` provides this

**Skeleton Enhancements**:
- Use `animate-pulse` on skeleton backgrounds
- Match exact dimensions of final content
- Include skeleton variants for all loading states

---

## 8. Accessibility Considerations

**Decision**: Maintain ARIA labels and semantic HTML

**Rationale**:
- Current implementation has `aria-label` on interactive elements
- Design doesn't compromise accessibility
- Focus states via `focus:ring-2 focus:ring-primary/50`

**Accessibility Patterns**:
- Buttons have `aria-label` for screen readers
- Images have descriptive `alt` text
- Modal has focus trap and escape key handling
- Color contrast meets WCAG AA standards

---

## Research Conclusion

All technical decisions align with the existing codebase patterns. No additional dependencies needed. Implementation can proceed with:

1. Extract shared icon components
2. Create PostCard and PostModal components
3. Enhance styling in existing components
4. Add/update tests for new components

**No NEEDS CLARIFICATION items remain.**
