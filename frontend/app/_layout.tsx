import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/auth";
import { CartProvider } from "@/src/cart";
import { NetProvider } from "@/src/net";
import { SyncProvider } from "@/src/sync";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

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
      <AuthProvider>
        <NetProvider>
          <SyncProvider>
            <CartProvider>
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
              </Stack>
            </CartProvider>
          </SyncProvider>
        </NetProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
