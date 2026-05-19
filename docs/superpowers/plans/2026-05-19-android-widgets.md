# Android Widgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two native Android home screen widgets to the FinTrack Capacitor APK — a Quick Add widget (2×1) and a Budget Overview widget (4×4) with income/expense summary and 30-minute background refresh.

**Architecture:** A custom Capacitor Java plugin (`FinTrackNativePlugin`) writes the JWT to Android `SharedPreferences` whenever the user logs in or out. Two `AppWidgetProvider` classes render widgets using `RemoteViews`. `BudgetRefreshWorker` (WorkManager, 30-min periodic) reads the JWT from SharedPreferences, calls the Express backend directly, and writes results back for the Budget widget to display.

**Tech Stack:** Java (Android), WorkManager 2.9.1, Capacitor 6 Plugin API, RemoteViews XML, SharedPreferences, Next.js (client event bridge)

---

## File Map

| File | Change | Purpose |
|---|---|---|
| `frontend/android/app/build.gradle` | Modify | WorkManager dep + BuildConfig API_BASE_URL |
| `frontend/android/app/src/main/java/app/fintrack/ai/FinTrackNativePlugin.java` | Create | Capacitor plugin: saveToken/clearToken → SharedPreferences |
| `frontend/android/app/src/main/java/app/fintrack/ai/MainActivity.java` | Modify | Register plugin, handle OPEN_ADD + OPEN_SCREEN intents |
| `frontend/src/plugins/FinTrackNativePlugin.ts` | Create | TypeScript plugin definition |
| `frontend/store/authStore.ts` | Modify | Call plugin on setAuth/logout |
| `frontend/components/CapacitorBridge.tsx` | Create | Client component: listens for widget intents, routes in app |
| `frontend/app/layout.tsx` | Modify | Import CapacitorBridge |
| `frontend/android/app/src/main/res/drawable/widget_background.xml` | Create | Rounded dark card background |
| `frontend/android/app/src/main/res/layout/widget_quick_add.xml` | Create | Quick Add widget layout |
| `frontend/android/app/src/main/res/layout/widget_budget.xml` | Create | Budget widget layout |
| `frontend/android/app/src/main/res/xml/widget_quick_add_info.xml` | Create | AppWidgetProviderInfo for Quick Add |
| `frontend/android/app/src/main/res/xml/widget_budget_info.xml` | Create | AppWidgetProviderInfo for Budget |
| `frontend/android/app/src/main/java/app/fintrack/ai/QuickAddWidget.java` | Create | Quick Add AppWidgetProvider |
| `frontend/android/app/src/main/java/app/fintrack/ai/BudgetWidget.java` | Create | Budget AppWidgetProvider + WorkManager scheduling |
| `frontend/android/app/src/main/java/app/fintrack/ai/BudgetRefreshWorker.java` | Create | WorkManager worker: fetch budgets + summary, write to SP |
| `frontend/android/app/src/main/AndroidManifest.xml` | Modify | Register both widget receivers |

---

### Task 1: Gradle — WorkManager + API_BASE_URL BuildConfig

**Files:**
- Modify: `frontend/android/app/build.gradle`

- [ ] **Step 1: Add WorkManager dependency and BuildConfig field**

Open `frontend/android/app/build.gradle`. Make these two changes:

In the `android { defaultConfig { ... } }` block, add after `versionName`:
```groovy
buildConfigField "String", "API_BASE_URL", '"https://YOUR-RENDER-BACKEND.onrender.com/"'
```
Replace `YOUR-RENDER-BACKEND` with your actual Render backend subdomain. Trailing slash required.

Also add `buildFeatures { buildConfig true }` inside `android { }`:
```groovy
android {
    namespace = "app.fintrack.ai"
    compileSdk = rootProject.ext.compileSdkVersion
    defaultConfig {
        applicationId "app.fintrack.ai"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
        buildConfigField "String", "API_BASE_URL", '"https://YOUR-RENDER-BACKEND.onrender.com/"'
        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
        aaptOptions {
            ignoreAssetsPattern = '!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~'
        }
    }
    buildFeatures {
        buildConfig true
    }
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

In the `dependencies { }` block, add:
```groovy
implementation "androidx.work:work-runtime:2.9.1"
```

- [ ] **Step 2: Sync Gradle in Android Studio**

In Android Studio: File → Sync Project with Gradle Files.
Expected: BUILD SUCCESSFUL, no errors.

- [ ] **Step 3: Commit**

```bash
cd frontend
git add android/app/build.gradle
git commit -m "feat(android/widgets): add WorkManager dep and API_BASE_URL BuildConfig"
```

---

### Task 2: FinTrackNativePlugin — JWT bridge to SharedPreferences

**Files:**
- Create: `frontend/android/app/src/main/java/app/fintrack/ai/FinTrackNativePlugin.java`
- Modify: `frontend/android/app/src/main/java/app/fintrack/ai/MainActivity.java`

- [ ] **Step 1: Create `FinTrackNativePlugin.java`**

```java
package app.fintrack.ai;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FinTrackNative")
public class FinTrackNativePlugin extends Plugin {

    static final String PREFS_NAME = "fintrack_widget";
    static final String KEY_JWT = "jwt";

    @PluginMethod
    public void saveToken(PluginCall call) {
        String token = call.getString("token");
        if (token == null) {
            call.reject("token is required");
            return;
        }
        getContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_JWT, token)
            .apply();
        call.resolve();
    }

    @PluginMethod
    public void clearToken(PluginCall call) {
        getContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_JWT)
            .remove("budgets_json")
            .remove("summary_json")
            .remove("last_updated")
            .apply();

        // Trigger widget update to show "Sign in" state
        BudgetWidget.triggerUpdate(getContext());
        call.resolve();
    }
}
```

- [ ] **Step 2: Modify `MainActivity.java`**

Replace the entire file:

```java
package app.fintrack.ai;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FinTrackNativePlugin.class);
        super.onCreate(savedInstanceState);
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;

        if (intent.getBooleanExtra("OPEN_ADD", false)) {
            evalOnBridge("window.dispatchEvent(new CustomEvent('fintrack:openAdd'))");
        }

        String screen = intent.getStringExtra("OPEN_SCREEN");
        if ("budgets".equals(screen)) {
            evalOnBridge("window.dispatchEvent(new CustomEvent('fintrack:openBudgets'))");
        }
    }

    private void evalOnBridge(String js) {
        // Wait for WebView to be ready before evaluating
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() ->
                getBridge().getWebView().evaluateJavascript(js, null)
            );
        }
    }
}
```

- [ ] **Step 3: Build in Android Studio to verify no compile errors**

Build → Make Project (Ctrl+F9).
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/java/app/fintrack/ai/FinTrackNativePlugin.java
git add android/app/src/main/java/app/fintrack/ai/MainActivity.java
git commit -m "feat(android/widgets): add FinTrackNativePlugin JWT bridge and intent handler"
```

---

### Task 3: TypeScript plugin + authStore bridge

**Files:**
- Create: `frontend/src/plugins/FinTrackNativePlugin.ts`
- Modify: `frontend/store/authStore.ts`

- [ ] **Step 1: Create `frontend/src/plugins/FinTrackNativePlugin.ts`**

```typescript
import { registerPlugin } from '@capacitor/core';

export interface FinTrackNativePlugin {
  saveToken(options: { token: string }): Promise<void>;
  clearToken(): Promise<void>;
}

// Web implementation is a no-op — plugin only runs on Android
export const FinTrackNative = registerPlugin<FinTrackNativePlugin>('FinTrackNative', {
  web: {
    saveToken: async () => {},
    clearToken: async () => {},
  },
});
```

- [ ] **Step 2: Modify `frontend/store/authStore.ts`**

Add the import at the top of the file (after existing imports):
```typescript
import { FinTrackNative } from '@/plugins/FinTrackNativePlugin';
```

Replace the `setAuth` method:
```typescript
setAuth: (user, token) => {
    set({ user, token, isLoading: false });
    FinTrackNative.saveToken({ token }).catch(() => {});
},
```

Replace the `logout` method:
```typescript
logout: () => {
    set({ user: null, token: null, isLoading: false });
    FinTrackNative.clearToken().catch(() => {});
},
```

Both calls use `.catch(() => {})` — a plugin failure must never crash the web app.

- [ ] **Step 3: Verify the web app still builds**

```bash
cd frontend
npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/plugins/FinTrackNativePlugin.ts store/authStore.ts
git commit -m "feat(android/widgets): add Capacitor plugin TS definition and wire authStore"
```

---

### Task 4: CapacitorBridge client component + layout

**Files:**
- Create: `frontend/components/CapacitorBridge.tsx`
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: Create `frontend/components/CapacitorBridge.tsx`**

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CapacitorBridge() {
  const router = useRouter();

  useEffect(() => {
    const handleOpenAdd = () => {
      // Navigate to transactions page with query param to open add modal
      router.push('/?openAdd=1');
    };

    const handleOpenBudgets = () => {
      router.push('/budgets');
    };

    window.addEventListener('fintrack:openAdd', handleOpenAdd);
    window.addEventListener('fintrack:openBudgets', handleOpenBudgets);

    return () => {
      window.removeEventListener('fintrack:openAdd', handleOpenAdd);
      window.removeEventListener('fintrack:openBudgets', handleOpenBudgets);
    };
  }, [router]);

  return null;
}
```

> **Note for the developer:** The `router.push('/?openAdd=1')` navigates to the home/dashboard page with `openAdd=1` in the URL. You need to add a `useEffect` in your home page / transactions component to detect `searchParams.get('openAdd') === '1'` and open the add transaction modal. If the modal is already accessible via a different mechanism, adapt this accordingly.

- [ ] **Step 2: Add CapacitorBridge to `frontend/app/layout.tsx`**

Import the component at the top of `layout.tsx`:
```tsx
import CapacitorBridge from '@/components/CapacitorBridge';
```

Add `<CapacitorBridge />` inside the `<body>` tag, before `{children}`:
```tsx
<body>
  <CapacitorBridge />
  {children}
  <Analytics />
</body>
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/CapacitorBridge.tsx app/layout.tsx
git commit -m "feat(android/widgets): add CapacitorBridge for widget→app navigation events"
```

---

### Task 5: Widget drawable + XML layouts + metadata

**Files:**
- Create: `frontend/android/app/src/main/res/drawable/widget_background.xml`
- Create: `frontend/android/app/src/main/res/layout/widget_quick_add.xml`
- Create: `frontend/android/app/src/main/res/layout/widget_budget.xml`
- Create: `frontend/android/app/src/main/res/xml/widget_quick_add_info.xml`
- Create: `frontend/android/app/src/main/res/xml/widget_budget_info.xml`

- [ ] **Step 1: Create `widget_background.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="#CC1A1A2E" />
    <corners android:radius="16dp" />
</shape>
```

- [ ] **Step 2: Create `widget_quick_add.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="horizontal"
    android:background="@drawable/widget_background"
    android:gravity="center_vertical"
    android:padding="12dp">

    <TextView
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_weight="1"
        android:text="FinTrack"
        android:textColor="#F0F4FF"
        android:textSize="14sp"
        android:textStyle="bold" />

    <TextView
        android:id="@+id/widget_quick_add_button"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="+ Add"
        android:textColor="#FFFFFF"
        android:background="#4F8EF7"
        android:textSize="13sp"
        android:textStyle="bold"
        android:paddingStart="12dp"
        android:paddingEnd="12dp"
        android:paddingTop="6dp"
        android:paddingBottom="6dp" />
</LinearLayout>
```

- [ ] **Step 3: Create `widget_budget.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_budget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:background="@drawable/widget_background"
    android:padding="12dp">

    <!-- Header row -->
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:gravity="center_vertical">

        <TextView
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:text="FinTrack Budgets"
            android:textColor="#F0F4FF"
            android:textSize="13sp"
            android:textStyle="bold" />

        <TextView
            android:id="@+id/widget_budget_month"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:textColor="#9BA3C0"
            android:textSize="11sp"
            android:layout_marginEnd="8dp" />

        <TextView
            android:id="@+id/widget_budget_refresh"
            android:layout_width="24dp"
            android:layout_height="24dp"
            android:text="↻"
            android:textColor="#9BA3C0"
            android:textSize="16sp"
            android:gravity="center" />
    </LinearLayout>

    <!-- Status text: shown when not logged in, hidden otherwise -->
    <TextView
        android:id="@+id/widget_budget_status"
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1"
        android:gravity="center"
        android:text="Sign in to FinTrack"
        android:textColor="#9BA3C0"
        android:textSize="12sp"
        android:visibility="gone" />

    <!-- Content: shown when logged in -->
    <LinearLayout
        android:id="@+id/widget_budget_content"
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1"
        android:orientation="vertical"
        android:layout_marginTop="6dp">

        <!-- Income / Expenses summary -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:layout_marginBottom="8dp">

            <TextView
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="Income"
                android:textColor="#9BA3C0"
                android:textSize="10sp" />

            <TextView
                android:id="@+id/widget_income"
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="₹0"
                android:textColor="#22C55E"
                android:textSize="12sp"
                android:textStyle="bold"
                android:gravity="center" />

            <TextView
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="Expenses"
                android:textColor="#9BA3C0"
                android:textSize="10sp"
                android:gravity="end" />

            <TextView
                android:id="@+id/widget_expenses"
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="₹0"
                android:textColor="#EF4444"
                android:textSize="12sp"
                android:textStyle="bold"
                android:gravity="end" />
        </LinearLayout>

        <!-- Budget 1 -->
        <TextView
            android:id="@+id/budget1_name"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:textColor="#F0F4FF"
            android:textSize="11sp"
            android:singleLine="true"
            android:ellipsize="end" />
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:gravity="center_vertical"
            android:layout_marginBottom="6dp">
            <ProgressBar
                android:id="@+id/budget1_progress"
                style="@android:style/Widget.ProgressBar.Horizontal"
                android:layout_width="0dp"
                android:layout_height="6dp"
                android:layout_weight="1"
                android:layout_marginEnd="6dp"
                android:max="100"
                android:progress="0" />
            <TextView
                android:id="@+id/budget1_amount"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:textColor="#9BA3C0"
                android:textSize="10sp" />
        </LinearLayout>

        <!-- Budget 2 -->
        <TextView
            android:id="@+id/budget2_name"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:textColor="#F0F4FF"
            android:textSize="11sp"
            android:singleLine="true"
            android:ellipsize="end" />
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:gravity="center_vertical"
            android:layout_marginBottom="6dp">
            <ProgressBar
                android:id="@+id/budget2_progress"
                style="@android:style/Widget.ProgressBar.Horizontal"
                android:layout_width="0dp"
                android:layout_height="6dp"
                android:layout_weight="1"
                android:layout_marginEnd="6dp"
                android:max="100"
                android:progress="0" />
            <TextView
                android:id="@+id/budget2_amount"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:textColor="#9BA3C0"
                android:textSize="10sp" />
        </LinearLayout>

        <!-- Budget 3 -->
        <TextView
            android:id="@+id/budget3_name"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:textColor="#F0F4FF"
            android:textSize="11sp"
            android:singleLine="true"
            android:ellipsize="end" />
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:gravity="center_vertical">
            <ProgressBar
                android:id="@+id/budget3_progress"
                style="@android:style/Widget.ProgressBar.Horizontal"
                android:layout_width="0dp"
                android:layout_height="6dp"
                android:layout_weight="1"
                android:layout_marginEnd="6dp"
                android:max="100"
                android:progress="0" />
            <TextView
                android:id="@+id/budget3_amount"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:textColor="#9BA3C0"
                android:textSize="10sp" />
        </LinearLayout>
    </LinearLayout>
</LinearLayout>
```

- [ ] **Step 4: Create `widget_quick_add_info.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="110dp"
    android:minHeight="40dp"
    android:targetCellWidth="2"
    android:targetCellHeight="1"
    android:updatePeriodMillis="0"
    android:initialLayout="@layout/widget_quick_add"
    android:resizeMode="none"
    android:widgetCategory="home_screen" />
```

- [ ] **Step 5: Create `widget_budget_info.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="270dp"
    android:minHeight="270dp"
    android:targetCellWidth="4"
    android:targetCellHeight="4"
    android:updatePeriodMillis="0"
    android:initialLayout="@layout/widget_budget"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen" />
```

- [ ] **Step 6: Build to verify no resource errors**

Build → Make Project (Ctrl+F9) in Android Studio.
Expected: 0 errors. The R class will have entries for all new IDs.

- [ ] **Step 7: Commit**

```bash
git add android/app/src/main/res/
git commit -m "feat(android/widgets): add widget layouts, backgrounds, and metadata XML"
```

---

### Task 6: QuickAddWidget

**Files:**
- Create: `frontend/android/app/src/main/java/app/fintrack/ai/QuickAddWidget.java`
- Modify: `frontend/android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Create `QuickAddWidget.java`**

```java
package app.fintrack.ai;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

public class QuickAddWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    static void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_quick_add);

        Intent intent = new Intent(context, MainActivity.class);
        intent.putExtra("OPEN_ADD", true);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        views.setOnClickPendingIntent(R.id.widget_quick_add_button, pendingIntent);
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
}
```

- [ ] **Step 2: Register QuickAddWidget in `AndroidManifest.xml`**

Add inside the `<application>` tag, after the existing `<provider>`:

```xml
<receiver
    android:name=".QuickAddWidget"
    android:exported="true">
    <intent-filter>
        <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
    </intent-filter>
    <meta-data
        android:name="android.appwidget.provider"
        android:resource="@xml/widget_quick_add_info" />
</receiver>
```

- [ ] **Step 3: Build and verify**

Build → Make Project. Expected: 0 errors.

- [ ] **Step 4: Manual test — add widget to home screen**

Run the app on a device/emulator. Long-press the home screen → Widgets → scroll to find "FinTrack". Add the Quick Add widget. It should show "FinTrack [+ Add]". Tap "+ Add" — the app should open.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/app/fintrack/ai/QuickAddWidget.java
git add android/app/src/main/AndroidManifest.xml
git commit -m "feat(android/widgets): add QuickAddWidget and register in manifest"
```

---

### Task 7: BudgetRefreshWorker

**Files:**
- Create: `frontend/android/app/src/main/java/app/fintrack/ai/BudgetRefreshWorker.java`

- [ ] **Step 1: Create `BudgetRefreshWorker.java`**

```java
package app.fintrack.ai;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Calendar;

public class BudgetRefreshWorker extends Worker {

    private static final String PREFS_NAME = "fintrack_widget";

    public BudgetRefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        SharedPreferences prefs = getApplicationContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        String jwt = prefs.getString("jwt", null);
        if (jwt == null) return Result.success(); // Not logged in

        Calendar cal = Calendar.getInstance();
        int month = cal.get(Calendar.MONTH) + 1;
        int year = cal.get(Calendar.YEAR);
        String base = BuildConfig.API_BASE_URL;

        try {
            String budgetsJson = fetchJson(base + "api/budgets?month=" + month + "&year=" + year, jwt, prefs);
            String summaryJson = fetchJson(base + "api/analytics/summary?month=" + month + "&year=" + year, jwt, prefs);

            if (budgetsJson != null && summaryJson != null) {
                prefs.edit()
                    .putString("budgets_json", budgetsJson)
                    .putString("summary_json", summaryJson)
                    .putLong("last_updated", System.currentTimeMillis())
                    .apply();

                BudgetWidget.triggerUpdate(getApplicationContext());
            }

            return Result.success();
        } catch (Exception e) {
            return Result.retry(); // WorkManager will retry with backoff
        }
    }

    private String fetchJson(String urlStr, String jwt, SharedPreferences prefs) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestProperty("Authorization", "Bearer " + jwt);
        conn.setRequestProperty("Accept", "application/json");
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(10000);

        int status = conn.getResponseCode();

        if (status == 401) {
            // JWT expired — clear token so widget shows "Sign in"
            prefs.edit().remove("jwt").apply();
            return null;
        }

        if (status != 200) return null;

        StringBuilder sb = new StringBuilder();
        BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
        String line;
        while ((line = reader.readLine()) != null) sb.append(line);
        reader.close();
        conn.disconnect();
        return sb.toString();
    }
}
```

- [ ] **Step 2: Build and verify**

Build → Make Project. Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add android/app/src/main/java/app/fintrack/ai/BudgetRefreshWorker.java
git commit -m "feat(android/widgets): add BudgetRefreshWorker — 30min WorkManager fetch"
```

---

### Task 8: BudgetWidget

**Files:**
- Create: `frontend/android/app/src/main/java/app/fintrack/ai/BudgetWidget.java`
- Modify: `frontend/android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Create `BudgetWidget.java`**

```java
package app.fintrack.ai;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

public class BudgetWidget extends AppWidgetProvider {

    private static final String PREFS_NAME = "fintrack_widget";
    static final String ACTION_REFRESH = "app.fintrack.ai.BUDGET_WIDGET_REFRESH";
    static final String WORK_TAG = "budget_widget_refresh";

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    @Override
    public void onEnabled(Context context) {
        schedulePeriodicRefresh(context);
    }

    @Override
    public void onDisabled(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_TAG);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        schedulePeriodicRefresh(context);
        for (int id : appWidgetIds) {
            renderWidget(context, appWidgetManager, id);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(BudgetRefreshWorker.class)
                .setConstraints(constraints)
                .build();
            WorkManager.getInstance(context).enqueue(request);
        }
    }

    // ─── Public helpers ───────────────────────────────────────────────────────

    static void triggerUpdate(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, BudgetWidget.class));
        for (int id : ids) renderWidget(context, manager, id);
    }

    // ─── Rendering ────────────────────────────────────────────────────────────

    private static void renderWidget(Context context, AppWidgetManager manager, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_budget);
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String jwt = prefs.getString("jwt", null);

        if (jwt == null) {
            views.setViewVisibility(R.id.widget_budget_status, View.VISIBLE);
            views.setViewVisibility(R.id.widget_budget_content, View.GONE);
            manager.updateAppWidget(widgetId, views);
            return;
        }

        views.setViewVisibility(R.id.widget_budget_status, View.GONE);
        views.setViewVisibility(R.id.widget_budget_content, View.VISIBLE);

        // Month/year header
        String monthYear = new SimpleDateFormat("MMM yyyy", Locale.getDefault())
            .format(Calendar.getInstance().getTime());
        views.setTextViewText(R.id.widget_budget_month, monthYear);

        // Refresh button pending intent
        Intent refreshIntent = new Intent(context, BudgetWidget.class);
        refreshIntent.setAction(ACTION_REFRESH);
        PendingIntent refreshPI = PendingIntent.getBroadcast(
            context, 1, refreshIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_budget_refresh, refreshPI);

        // Tap body → open app to /budgets
        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.putExtra("OPEN_SCREEN", "budgets");
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPI = PendingIntent.getActivity(
            context, 2, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_budget_root, openPI);

        // Income / Expenses
        try {
            String summaryStr = prefs.getString("summary_json", null);
            if (summaryStr != null) {
                JSONObject summary = new JSONObject(summaryStr);
                long income = Math.round(summary.optDouble("total_income", 0));
                long expenses = Math.round(summary.optDouble("total_expenses", 0));
                views.setTextViewText(R.id.widget_income, "₹" + income);
                views.setTextViewText(R.id.widget_expenses, "₹" + expenses);
            }
        } catch (Exception ignored) {}

        // Top 3 budgets
        int[] nameIds    = { R.id.budget1_name,     R.id.budget2_name,     R.id.budget3_name };
        int[] progressIds = { R.id.budget1_progress, R.id.budget2_progress, R.id.budget3_progress };
        int[] amountIds  = { R.id.budget1_amount,   R.id.budget2_amount,   R.id.budget3_amount };

        try {
            String budgetsStr = prefs.getString("budgets_json", null);
            if (budgetsStr != null) {
                JSONObject root = new JSONObject(budgetsStr);
                JSONArray budgets = root.getJSONArray("budgets");

                for (int i = 0; i < 3; i++) {
                    if (i >= budgets.length()) {
                        views.setTextViewText(nameIds[i], "");
                        views.setProgressBar(progressIds[i], 100, 0, false);
                        views.setTextViewText(amountIds[i], "");
                        continue;
                    }
                    JSONObject b = budgets.getJSONObject(i);
                    String icon = b.optString("category_icon", "");
                    String name = b.optString("category_name", "Budget " + (i + 1));
                    double spent = b.optDouble("spent", 0);
                    double amount = b.optDouble("amount", 1);
                    int progress = (int) Math.min(100, (spent / amount) * 100);

                    views.setTextViewText(nameIds[i], icon + " " + name);
                    views.setProgressBar(progressIds[i], 100, progress, false);
                    views.setTextViewText(amountIds[i],
                        "₹" + Math.round(spent) + "/" + "₹" + Math.round(amount));
                }
            }
        } catch (Exception ignored) {}

        manager.updateAppWidget(widgetId, views);
    }

    // ─── WorkManager ──────────────────────────────────────────────────────────

    private static void schedulePeriodicRefresh(Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
            BudgetRefreshWorker.class, 30, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_TAG,
            ExistingPeriodicWorkPolicy.KEEP,
            request
        );
    }
}
```

- [ ] **Step 2: Register BudgetWidget in `AndroidManifest.xml`**

Add inside the `<application>` tag (after the QuickAddWidget receiver from Task 6):

```xml
<receiver
    android:name=".BudgetWidget"
    android:exported="true">
    <intent-filter>
        <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
        <action android:name="app.fintrack.ai.BUDGET_WIDGET_REFRESH" />
    </intent-filter>
    <meta-data
        android:name="android.appwidget.provider"
        android:resource="@xml/widget_budget_info" />
</receiver>
```

- [ ] **Step 3: Build and verify**

Build → Make Project. Expected: 0 errors.

- [ ] **Step 4: Manual test — add budget widget**

Run on device/emulator. Long-press home → Widgets → find "FinTrack" → add Budget widget (4×4). Should show "Sign in to FinTrack" initially (no JWT in SharedPreferences yet). Log in to the app — the plugin now writes the JWT. Tap ↻ to trigger a manual refresh. After a few seconds the budget data should appear.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/app/fintrack/ai/BudgetWidget.java
git add android/app/src/main/AndroidManifest.xml
git commit -m "feat(android/widgets): add BudgetWidget with WorkManager 30min refresh"
```

---

### Task 9: Sync Capacitor and final build

- [ ] **Step 1: Build the Next.js web app**

```bash
cd frontend
npm run build
```

Expected: Build completes, `out/` directory populated.

- [ ] **Step 2: Sync Capacitor**

```bash
npx cap sync android
```

Expected: `Sync finished in X.Xs` with no errors. This copies the updated web assets and any new Capacitor plugin registrations into the Android project.

- [ ] **Step 3: Build APK in Android Studio**

In Android Studio: Build → Build Bundle(s) / APK(s) → Build APK(s).
Expected: `app-debug.apk` generated in `android/app/build/outputs/apk/debug/`.

- [ ] **Step 4: End-to-end test checklist**

On a physical device or emulator:

- [ ] Install the APK
- [ ] Log in — check that `fintrack_widget` SharedPreferences has `jwt` set (use Android Studio's App Inspection → Database Inspector or add a log in `FinTrackNativePlugin.saveToken`)
- [ ] Add Quick Add widget to home screen → tap "+ Add" → app opens and navigates correctly
- [ ] Add Budget widget (4×4) to home screen → shows "Sign in" state immediately after fresh install
- [ ] Log in → tap ↻ on Budget widget → after ~2-3 seconds budget data appears
- [ ] Log out from the app → Budget widget reverts to "Sign in to FinTrack"
- [ ] Wait 30 minutes (or force WorkManager run via `adb shell am broadcast -a androidx.work.diagnostics.REQUEST_DIAGNOSTICS`) → Budget widget data refreshes

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(android/widgets): complete widget implementation — sync and final build"
```
