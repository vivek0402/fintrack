# Android Widgets Design

**Date:** 2026-05-19
**Status:** Approved

---

## Goal

Add two native Android home screen widgets to the FinTrack Capacitor APK:
1. **Quick Add Widget** (2×1) — one-tap shortcut to the add transaction screen
2. **Budget Overview Widget** (4×4) — shows income, expenses, and top 3 budgets with progress bars, auto-refreshed every 30 minutes

---

## Problem

Android App Widgets are 100% native (RemoteViews XML) and run in the home screen's process. They cannot use the Capacitor WebView. The JWT is stored in WebView `localStorage` and is not accessible to native components. A bridge is needed to make the JWT available to native widget code.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Web Layer (Next.js / Zustand)                  │
│  authStore.setAuth() → FinTrackNativePlugin.ts  │
│  authStore.logout()  → FinTrackNativePlugin.ts  │
└──────────────┬──────────────────────────────────┘
               │ Capacitor bridge
┌──────────────▼──────────────────────────────────┐
│  FinTrackNativePlugin.java                      │
│  saveToken(jwt) / clearToken()                  │
│  → SharedPreferences "fintrack_widget"          │
└──────────────┬──────────────────────────────────┘
               │ SharedPreferences
       ┌───────┴───────────────┐
       │                       │
┌──────▼──────┐   ┌────────────▼───────────────────┐
│ QuickAdd    │   │  BudgetWidget                  │
│ Widget      │   │  reads from SharedPreferences  │
│             │   │  triggered by WorkManager 30min │
│ Tap →       │   │  ← BudgetRefreshWorker         │
│ open app    │   │    GET /api/budgets             │
│ add screen  │   │    GET /api/analytics/summary  │
└─────────────┘   └────────────────────────────────┘
```

---

## SharedPreferences

**File name:** `fintrack_widget`

| Key | Value | Set by |
|---|---|---|
| `jwt` | JWT string | `FinTrackNativePlugin.saveToken()` |
| `budgets_json` | JSON array of budgets | `BudgetRefreshWorker` |
| `summary_json` | JSON object (income, expenses, net) | `BudgetRefreshWorker` |
| `last_updated` | Unix timestamp (ms) | `BudgetRefreshWorker` |

---

## Widget 1: Quick Add (2×1)

```
┌─────────────────────────┐
│  FinTrack  [+ Add]      │
└─────────────────────────┘
```

- Single tap on "+ Add" button → launches `MainActivity` with Intent extra `OPEN_ADD=true`
- `MainActivity.onNewIntent()` detects `OPEN_ADD=true` → calls `bridge.eval("window.dispatchEvent(new CustomEvent('openAddTransaction'))")`
- Web app listens for `openAddTransaction` event and opens the add transaction modal
- No network calls, no data needed — purely a launcher

---

## Widget 2: Budget Overview (4×4)

```
┌──────────────────────────────────┐
│ FinTrack Budgets    ↻  Jun 2026  │
├──────────────────────────────────┤
│ Income ₹42,000   Expenses ₹18,200│
├──────────────────────────────────┤
│ 🍽️ Food & Dining                │
│ ████████░░░░  ₹4,200 / ₹6,000   │
│                                  │
│ 🚗 Transportation                │
│ ██████████░░  ₹2,800 / ₹3,000   │
│                                  │
│ 🛍️ Shopping                     │
│ ███░░░░░░░░░  ₹800 / ₹5,000     │
└──────────────────────────────────┘
```

- Income shown in green (`#22C55E`), Expenses in red (`#EF4444`)
- Top 3 budgets sorted by `spent` descending
- Progress bar fill = `spent / amount`, capped at 100%; turns red when `spent > amount`
- ↻ refresh button → triggers immediate `WorkManager` one-time run
- Tap anywhere on widget body → opens app to Budgets screen (`/budgets`)
- If no JWT in SharedPreferences: shows "Sign in to FinTrack"
- If data is stale (>2 hours): shows "Last updated X min ago" in amber

---

## BudgetRefreshWorker

- `PeriodicWorkRequest` — interval: 30 minutes
- Constraint: `NetworkType.CONNECTED`
- Persists across device reboots via `WorkManager`
- On run:
  1. Read `jwt` from SharedPreferences — abort if missing
  2. Determine current month/year from `Calendar.getInstance()`
  3. `GET /api/budgets?month=M&year=Y` with `Authorization: Bearer <jwt>`
  4. `GET /api/analytics/summary?month=M&year=Y` with `Authorization: Bearer <jwt>`
  5. On success: write `budgets_json`, `summary_json`, `last_updated` to SharedPreferences → call `AppWidgetManager.updateAppWidget()`
  6. On 401: call `clearToken()` — widget shows "Sign in to FinTrack"
  7. On network error: leave existing data, do not update `last_updated`

---

## FinTrackNativePlugin (Java)

Capacitor plugin registered in `MainActivity.java` via `registerPlugin(FinTrackNativePlugin.class)`.

```
Plugin name: "FinTrackNative"
Methods:
  - saveToken(token: String) → void
  - clearToken() → void
```

TypeScript definition in `frontend/src/plugins/FinTrackNativePlugin.ts`:
```ts
import { registerPlugin } from '@capacitor/core';
export interface FinTrackNativePlugin {
  saveToken(options: { token: string }): Promise<void>;
  clearToken(): Promise<void>;
}
export const FinTrackNative = registerPlugin<FinTrackNativePlugin>('FinTrackNative');
```

Called from `authStore.ts`:
- `setAuth(user, token)` → `FinTrackNative.saveToken({ token })`
- `logout()` → `FinTrackNative.clearToken()`

Both calls are fire-and-forget (`.catch(() => {})`) — widget failure must never crash the web app.

---

## File List

### Web layer
| File | Change |
|---|---|
| `frontend/src/plugins/FinTrackNativePlugin.ts` | Create |
| `frontend/store/authStore.ts` | Modify — add plugin calls in `setAuth` and `logout` |

### Android native
| File | Change |
|---|---|
| `frontend/android/app/src/main/java/app/fintrack/ai/FinTrackNativePlugin.java` | Create |
| `frontend/android/app/src/main/java/app/fintrack/ai/MainActivity.java` | Modify — register plugin, handle OPEN_ADD intent |
| `frontend/android/app/src/main/java/app/fintrack/ai/QuickAddWidget.kt` | Create |
| `frontend/android/app/src/main/java/app/fintrack/ai/BudgetWidget.kt` | Create |
| `frontend/android/app/src/main/java/app/fintrack/ai/BudgetRefreshWorker.kt` | Create |
| `frontend/android/app/src/main/res/layout/widget_quick_add.xml` | Create |
| `frontend/android/app/src/main/res/layout/widget_budget.xml` | Create |
| `frontend/android/app/src/main/res/xml/widget_quick_add_info.xml` | Create |
| `frontend/android/app/src/main/res/xml/widget_budget_info.xml` | Create |
| `frontend/android/app/src/main/AndroidManifest.xml` | Modify — register receivers |
| `frontend/android/app/build.gradle` | Modify — add WorkManager dependency |

---

## Out of Scope (v1)

- Widget theming / dark mode support
- More than 3 budgets in the widget
- Goals widget
- Notification for over-budget alerts
- iOS widgets
