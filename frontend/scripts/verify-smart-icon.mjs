// Checked-in regression check for getSmartIcon() in ../lib/utils.ts. Not run by
// any CI/test command (no test framework exists for this frontend) -- run it by
// hand after editing CATEGORY_KEYWORD_ICONS or getSmartIcon's matching logic:
//   node frontend/scripts/verify-smart-icon.mjs
// This is a hand-copy, not an import, because there's no bundler/ts-node set up
// to run a .ts file directly with plain node. Keep it in sync with lib/utils.ts
// whenever the real dictionary or matching algorithm changes.
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const CATEGORY_KEYWORD_ICONS = {
  'Food & Dining': [
    ['pizza', '🍕'], ['coffee', '☕'], ['cafe', '☕'], ['tea', '🍵'],
    ['burger', '🍔'], ['biryani', '🍛'], ['sweet', '🍬'], ['ice cream', '🍦'],
    ['bakery', '🥐'], ['zomato', '🛵'], ['swiggy', '🛵'], ['grocery', '🛒'],
    ['groceries', '🛒'], ['milk', '🥛'], ['restaurant', '🍽️'], ['breakfast', '🍳'],
  ],
  'Transportation': [
    ['uber', '🚕'], ['ola auto', '🛺'], ['ola', '🚕'], ['cab', '🚕'], ['taxi', '🚕'],
    ['petrol', '⛽'], ['fuel', '⛽'], ['diesel', '⛽'], ['metro', '🚇'],
    ['train', '🚆'], ['bus', '🚌'], ['parking', '🅿️'],
    ['autorickshaw', '🛺'], ['auto rickshaw', '🛺'],
  ],
  'Shopping': [
    ['amazon', '📦'], ['flipkart', '📦'], ['myntra', '👕'], ['clothes', '👕'],
    ['shirt', '👕'], ['shoes', '👟'], ['phone', '📱'], ['laptop', '💻'],
    ['furniture', '🛋️'],
  ],
  'Entertainment': [
    ['movie', '🎬'], ['cinema', '🎬'], ['netflix', '📺'], ['prime video', '📺'],
    ['hotstar', '📺'], ['spotify', '🎵'], ['game', '🎮'], ['concert', '🎤'],
  ],
  'Healthcare': [
    ['doctor', '🏥'], ['hospital', '🏥'], ['medicine', '💊'], ['pharmacy', '💊'],
    ['dentist', '🦷'], ['gym', '🏋️'], ['fitness', '🏋️'],
  ],
  'Education': [
    ['course', '📚'], ['tuition', '🎓'], ['book', '📖'], ['exam', '📝'],
  ],
  'Utilities': [
    ['electricity', '⚡'], ['power bill', '⚡'], ['water bill', '💧'],
    ['wifi', '📶'], ['internet', '📶'], ['recharge', '📱'], ['gas cylinder', '🔥'],
  ],
  'Rent & Housing': [
    ['rent', '🏠'], ['maintenance', '🔧'], ['deposit', '🏦'],
  ],
  'Salary': [
    ['salary', '💰'], ['bonus', '🎁'], ['freelance', '💼'],
  ],
  'Investments': [
    ['mutual fund', '📈'], ['sip', '📈'], ['stock', '📈'], ['gold', '🪙'],
    ['fixed deposit', '🏦'],
  ],
  'Personal Care': [
    ['salon', '💇'], ['haircut', '💇'], ['spa', '🧖'], ['cosmetics', '💄'],
  ],
  'Family & Kids': [
    ['school fee', '🎒'], ['toy', '🧸'], ['daycare', '🍼'],
  ],
  'Travel': [
    ['flight', '✈️'], ['hotel', '🏨'], ['airbnb', '🏨'], ['booking.com', '🏨'],
  ],
  'Subscriptions': [
    ['netflix', '📺'], ['spotify', '🎵'], ['prime', '📦'], ['apple', '📱'],
    ['icloud', '📱'], ['youtube', '📺'],
  ],
  'Gifts & Donations': [
    ['gift', '🎁'], ['donation', '❤️'], ['charity', '❤️'],
  ],
};

function getSmartIcon(description, categoryName, categoryIcon) {
  const desc = (description || '').toLowerCase();
  const table = categoryName ? CATEGORY_KEYWORD_ICONS[categoryName] : null;
  if (table) {
    for (const [keyword, icon] of table) {
      const re = new RegExp(`\\b${escapeRegExp(keyword)}\\b`);
      if (re.test(desc)) return icon;
    }
  }
  return categoryIcon || '💳';
}

const cases = [
  // [description, categoryName, categoryIcon, expected]
  ["Domino's Pizza order",     'Food & Dining',  '🍽️', '🍕'],
  ['Starbucks Coffee',         'Food & Dining',  '🍽️', '☕'],
  ['Big Bazaar groceries run', 'Food & Dining',  '🍽️', '🛒'],
  ['Apple Store purchase',     'Subscriptions',   '🛍️', '📱'],   // 'apple' lives in Subscriptions, not Shopping, in the real table
  ['Random unmatched thing',   'Food & Dining',  '🍽️', '🍽️'],   // no keyword -> categoryIcon
  ['Anything',                 null,              null, '💳'],   // no category -> generic
  ['PIZZA IN CAPS',            'Food & Dining',  '🍽️', '🍕'],   // case-insensitive

  // Regression cases from code review (word-boundary matching + collision fixes)
  ['Steak House Dinner',       'Food & Dining',  '🍽️', '🍽️'],   // 'tea' must NOT match inside 'steak'
  ['AUTO DEBIT - Loan EMI',    'Transportation', '🚗', '🚗'],    // bare 'auto' no longer a keyword
  ['AUTOPAY UPI Mandate',      'Transportation', '🚗', '🚗'],    // same
  ['Ola Auto ride',            'Transportation', '🚗', '🛺'],    // 'ola auto' still matches
  ['NEFT to FD account',       'Investments',    '📈', '📈'],    // bare 'fd' no longer matches
  ['SIP investment',           'Investments',    '📈', '📈'],    // 'sip' still matches
];

let failures = 0;
for (const [desc, cat, icon, expected] of cases) {
  const got = getSmartIcon(desc, cat, icon);
  const pass = got === expected;
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  "${desc}" (${cat}) -> ${got} (expected ${expected})`);
}
console.log(failures === 0 ? `\nAll ${cases.length} cases passed.` : `\n${failures} of ${cases.length} cases FAILED.`);
process.exit(failures === 0 ? 0 : 1);
