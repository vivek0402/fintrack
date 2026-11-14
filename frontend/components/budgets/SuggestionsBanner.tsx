/**
 * A suggested change to one budget's limit, built on the Budgets page from the
 * last two months of spend. It renders on that category's row, next to the
 * numbers it is about.
 */
export interface SuggestionItem {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  type: 'over' | 'under';
  avgSpend: number;
  currentBudget: number;
  suggestedAmount: number;
}
