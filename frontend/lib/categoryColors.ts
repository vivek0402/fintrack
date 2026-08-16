// Mirrors DESIGN.md's --cat-0 through --cat-7 chart/category palette tokens
// (same 8 values in both light and dark themes). Hardcoded rather than read
// from CSS custom properties because these values are needed for random
// assignment at category-creation time, not for rendering already-mounted
// elements -- see callers for why a live getComputedStyle read isn't a fit
// here. Keep in sync with DESIGN.md if the token palette ever changes.
export const CATEGORY_COLORS = [
  '#2563eb', // --cat-0
  '#16a34a', // --cat-1
  '#d97706', // --cat-2
  '#dc2626', // --cat-3
  '#7c3aed', // --cat-4
  '#0891b2', // --cat-5
  '#db2777', // --cat-6
  '#65a30d', // --cat-7
];

export function randomCategoryColor(): string {
  return CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)];
}
