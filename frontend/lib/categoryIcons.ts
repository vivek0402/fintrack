import { escapeRegExp } from './utils';

// Keyword -> emoji, checked as whole-word matches against a category name
// typed at creation time. Whole-word matching (not plain substring) matters
// here specifically: a naive substring check on "car" would also match
// inside "Personal Care", which is not a car-related category.
//
// The first ~16 entries mirror the signup-seeded defaults (see
// DEFAULT_CATEGORIES in backend/src/routes/auth.js) so retyping one of
// those names, or a close variant, lands on the same icon a fresh signup
// would already show. The rest cover common categories people create that
// aren't in that seeded set.
const CATEGORY_NAME_ICONS: Array<[string, string]> = [
  ['food', '🍽️'], ['dining', '🍽️'], ['restaurant', '🍽️'],
  ['grocery', '🛒'], ['groceries', '🛒'],
  ['transport', '🚗'], ['transportation', '🚗'], ['car', '🚗'],
  ['fuel', '⛽'], ['petrol', '⛽'], ['diesel', '⛽'],
  ['shopping', '🛍️'],
  ['entertainment', '🎬'], ['movie', '🎬'], ['movies', '🎬'],
  ['health', '🏥'], ['healthcare', '🏥'], ['medical', '🏥'], ['doctor', '🏥'],
  ['medicine', '💊'], ['pharmacy', '💊'],
  ['education', '📚'], ['school', '📚'],
  ['course', '🎓'], ['tuition', '🎓'],
  ['utility', '⚡'], ['utilities', '⚡'], ['electricity', '⚡'],
  ['internet', '📶'], ['wifi', '📶'], ['broadband', '📶'],
  ['rent', '🏠'], ['housing', '🏠'], ['house', '🏠'], ['home', '🏠'],
  ['salary', '💰'], ['income', '💰'], ['paycheck', '💰'],
  ['investment', '📈'], ['investments', '📈'], ['stocks', '📈'], ['mutual fund', '📈'],
  ['personal care', '💆'], ['salon', '💆'], ['spa', '💆'], ['grooming', '💆'],
  ['family', '👨‍👩‍👧'], ['kids', '👨‍👩‍👧'], ['kid', '👨‍👩‍👧'], ['child', '👨‍👩‍👧'], ['children', '👨‍👩‍👧'], ['baby', '👨‍👩‍👧'],
  ['travel', '✈️'], ['vacation', '✈️'], ['trip', '✈️'], ['holiday', '✈️'], ['flight', '✈️'],
  ['subscription', '📱'], ['subscriptions', '📱'],
  ['gift', '🎁'], ['gifts', '🎁'], ['donation', '🎁'], ['donations', '🎁'], ['charity', '🎁'],
  // Beyond the seeded defaults.
  ['pet', '🐾'], ['pets', '🐾'],
  ['gym', '🏋️'], ['fitness', '🏋️'], ['workout', '🏋️'],
  ['insurance', '🛡️'],
  ['loan', '🏦'], ['emi', '🏦'],
  ['tax', '🧾'], ['taxes', '🧾'],
  ['maintenance', '🔧'], ['repair', '🔧'], ['repairs', '🔧'],
  ['parking', '🅿️'],
  ['laundry', '🧺'],
  ['electronics', '💻'], ['gadget', '💻'], ['gadgets', '💻'],
  ['furniture', '🛋️'],
  ['book', '📚'], ['books', '📚'],
  ['music', '🎵'], ['game', '🎮'], ['games', '🎮'], ['gaming', '🎮'],
  ['alcohol', '🍷'], ['bar', '🍷'], ['wine', '🍷'], ['beer', '🍺'],
  ['coffee', '☕'],
  ['business', '💼'],
];

// Falls back to the same generic box the backend already defaults to when
// no icon is supplied at all -- see categories.js's `icon || '📦'`.
export function guessCategoryIcon(name: string): string {
  const n = name.trim().toLowerCase();
  if (!n) return '📦';
  for (const [keyword, icon] of CATEGORY_NAME_ICONS) {
    if (new RegExp(`\\b${escapeRegExp(keyword)}\\b`).test(n)) return icon;
  }
  return '📦';
}
