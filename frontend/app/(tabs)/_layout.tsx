import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/src/theme";
import { Platform, useWindowDimensions, View } from "react-native";

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor:   COLORS.primary,
          tabBarInactiveTintColor: COLORS.textMuted,
          tabBarStyle: isDesktop
            ? { display: "none" }
            : {
                backgroundColor: COLORS.surface,
                borderTopColor:  COLORS.border,
                borderTopWidth:  1,
                height: 60 + insets.bottom,
                paddingBottom: insets.bottom + 4,
                paddingTop: 8,
              },
          tabBarLabelStyle: {
            fontSize: 10.5,
            fontWeight: "600",
            marginTop: Platform.OS === "ios" ? 0 : 2,
          },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            tabBarIcon: ({ color, focused }) => (
              <Feather name="home" size={22} color={focused ? COLORS.primary : COLORS.textMuted} />
            ),
          }}
        />
        <Tabs.Screen
          name="billing"
          options={{
            title: "Billing",
            tabBarIcon: ({ color, focused }) => (
              <Feather name="shopping-cart" size={22} color={focused ? COLORS.primary : COLORS.textMuted} />
            ),
          }}
        />
        <Tabs.Screen
          name="inventory"
          options={{
            title: "Inventory",
            tabBarIcon: ({ color, focused }) => (
              <Feather name="package" size={22} color={focused ? COLORS.primary : COLORS.textMuted} />
            ),
          }}
        />
        <Tabs.Screen
          name="reports"
          options={{
            title: "Reports",
            tabBarIcon: ({ color, focused }) => (
              <Feather name="bar-chart-2" size={22} color={focused ? COLORS.primary : COLORS.textMuted} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ color, focused }) => (
              <Feather name="settings" size={22} color={focused ? COLORS.primary : COLORS.textMuted} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}
