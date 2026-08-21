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
    <View style={{ flex: 1, overflow: "hidden" }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: COLORS.textMuted,
          tabBarStyle: isDesktop
            ? { display: "none" }
            : {
                backgroundColor: COLORS.white,
                borderTopColor: COLORS.border,
                borderTopWidth: 1,
                height: 64 + insets.bottom,
                paddingBottom: insets.bottom + 6,
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
            tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="billing"
          options={{
            title: "Billing",
            tabBarIcon: ({ color }) => <Feather name="shopping-cart" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="inventory"
          options={{
            title: "Inventory",
            tabBarIcon: ({ color }) => <Feather name="package" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="reports"
          options={{
            title: "Reports",
            tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ color }) => <Feather name="settings" size={22} color={color} />,
          }}
        />
      </Tabs>
    </View>
  );
}
