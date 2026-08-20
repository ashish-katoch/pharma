import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/auth";
import { CartProvider } from "@/src/cart";
import { NetProvider } from "@/src/net";
import { SyncProvider } from "@/src/sync";
import { DbProvider } from "@/src/db/DbProvider";
import { LockProvider, useLock } from "@/src/lock/LockProvider";
import { StoreConfigProvider } from "@/src/storeConfig";
import { LockScreen } from "@/src/lock/LockScreen";
import { setupNotificationHandler, registerPushToken } from "@/src/notifications";
import * as Sentry from "@sentry/react-native";

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.2,
    environment: __DEV__ ? "development" : "production",
    enabled: !__DEV__,
  });
}

setupNotificationHandler();

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function PushRegistrar() {
  const { user } = useAuth();
  useEffect(() => {
    if (user) {
      const projectId = process.env.EXPO_PUBLIC_PROJECT_ID ?? "";
      registerPushToken(projectId).catch(() => {});
    }
  }, [user?.email]);
  return null;
}

function AppContent() {
  const { locked } = useLock();
  return (
    <>
      <PushRegistrar />
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F8FAFC" } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="stock-in" options={{ presentation: "modal" }} />
        <Stack.Screen name="scan" options={{ presentation: "fullScreenModal" }} />
        <Stack.Screen name="import-csv" options={{ presentation: "modal" }} />
        <Stack.Screen name="outbox" />
        <Stack.Screen name="medicine/[id]" />
        <Stack.Screen name="bill/[id]" />
        <Stack.Screen name="history" />
        <Stack.Screen name="staff" />
        <Stack.Screen name="printer-settings" />
        <Stack.Screen name="customers" />
        <Stack.Screen name="customer/[id]" />
        <Stack.Screen name="suppliers" />
        <Stack.Screen name="purchase-new" />
        <Stack.Screen name="stock-adjust" />
        <Stack.Screen name="eod-close" />
        <Stack.Screen name="reorder" />
        <Stack.Screen name="app-lock-setup" />
        <Stack.Screen name="doctors" />
        <Stack.Screen name="supplier-return" options={{ presentation: "modal" }} />
        <Stack.Screen name="purchase-returns" />
        <Stack.Screen name="location-browser" />
        <Stack.Screen name="staff-report" />
        <Stack.Screen name="shifts" />
        <Stack.Screen name="general-ledger" />
        <Stack.Screen name="cashflow" />
        <Stack.Screen name="pnl-breakdown" />
        <Stack.Screen name="barcode-labels" />
        {/* Auth / Onboarding */}
        <Stack.Screen name="welcome" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="otp" />
        <Stack.Screen name="onboarding-store" />
        <Stack.Screen name="stay-notified" />
        <Stack.Screen name="language" />
        {/* Loyalty & Discounts */}
        <Stack.Screen name="loyalty" />
        <Stack.Screen name="loyalty-history" />
        <Stack.Screen name="discounts" />
        <Stack.Screen name="discount-new" options={{ presentation: "modal" }} />
        {/* Prescriptions */}
        <Stack.Screen name="prescriptions" />
        {/* Staff / Shifts */}
        <Stack.Screen name="staff-payroll" />
        <Stack.Screen name="shift-handover" options={{ presentation: "modal" }} />
        <Stack.Screen name="shift-summary" />
        {/* Analytics */}
        <Stack.Screen name="analytics/real-time" />
        <Stack.Screen name="analytics/sales" />
        <Stack.Screen name="analytics/abc" />
        <Stack.Screen name="analytics/turnover" />
        <Stack.Screen name="analytics/expiry-forecast" />
        <Stack.Screen name="analytics/restock" />
        {/* Purchases */}
        <Stack.Screen name="purchase-order-draft" />
        {/* Search */}
        <Stack.Screen name="global-search" options={{ presentation: "modal" }} />
        {/* Finance */}
        <Stack.Screen name="bulk-supplier-payments" />
        {/* Admin */}
        <Stack.Screen name="roles" />
        <Stack.Screen name="permissions" />
        {/* Settings sub-screens */}
        <Stack.Screen name="store-profile" />
        <Stack.Screen name="billing-preferences" />
        <Stack.Screen name="tax-settings" />
        <Stack.Screen name="hardware-settings" />
        <Stack.Screen name="network-settings" />
        <Stack.Screen name="network-overview" />
        <Stack.Screen name="backup-security" />
        <Stack.Screen name="data-retention" />
        <Stack.Screen name="help-support" />
        <Stack.Screen name="automation" />
        {/* Logs */}
        <Stack.Screen name="access-logs" />
        <Stack.Screen name="activity-logs" />
        <Stack.Screen name="archive-logs" />
        {/* Multi-store */}
        <Stack.Screen name="store-performance" />
        <Stack.Screen name="inter-store-transfers" />
        {/* Reports */}
        <Stack.Screen name="report-builder" />
        <Stack.Screen name="report-preview" />
        <Stack.Screen name="scheduled-reports" />
        <Stack.Screen name="export-history" />
        <Stack.Screen name="bulk-export" />
        <Stack.Screen name="export-config" />
        <Stack.Screen name="regulatory-vault" />
      </Stack>
      {locked && <LockScreen />}
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <DbProvider>
        <AuthProvider>
          <StoreConfigProvider>
            <NetProvider>
              <SyncProvider>
                <CartProvider>
                  <LockProvider>
                    <AppContent />
                  </LockProvider>
                </CartProvider>
              </SyncProvider>
            </NetProvider>
          </StoreConfigProvider>
        </AuthProvider>
      </DbProvider>
    </SafeAreaProvider>
  );
}
