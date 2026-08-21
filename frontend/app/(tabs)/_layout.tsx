import { Tabs, useRouter, usePathname } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import {
  Platform,
  useWindowDimensions,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useAuth } from "@/src/auth";

const NAV_ITEMS = [
  { name: "home",      label: "Dashboard",  icon: "home"        as const },
  { name: "billing",   label: "Billing",    icon: "shopping-cart" as const },
  { name: "inventory", label: "Inventory",  icon: "package"     as const },
  { name: "reports",   label: "Reports",    icon: "bar-chart-2" as const },
  { name: "settings",  label: "Settings",   icon: "settings"    as const },
];

function DesktopSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();

  const isActive = (name: string) => pathname.includes(`/(tabs)/${name}`) || pathname === `/${name}`;

  return (
    <View style={ds.sidebar}>
      {/* Brand */}
      <View style={ds.brand}>
        <View style={ds.logoMark}>
          <Feather name="activity" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={ds.brandName}>Pharma Counter</Text>
          <Text style={ds.brandSub} numberOfLines={1}>{user?.name || "Owner"}</Text>
        </View>
      </View>

      {/* Nav */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={ds.navSection}>
          <Text style={ds.navLabel}>MAIN</Text>
          {NAV_ITEMS.slice(0, 4).map((item) => {
            const active = isActive(item.name);
            return (
              <TouchableOpacity
                key={item.name}
                style={[ds.navItem, active && ds.navItemActive]}
                onPress={() => router.push(`/(tabs)/${item.name}` as any)}
                activeOpacity={0.75}
              >
                <Feather name={item.icon} size={18} color={active ? COLORS.primary : COLORS.textSecondary} />
                <Text style={[ds.navItemText, active && ds.navItemTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={ds.navSection}>
          <Text style={ds.navLabel}>QUICK ACCESS</Text>
          {[
            { label: "History",    icon: "clock"       as const, path: "/history" },
            { label: "Customers",  icon: "users"       as const, path: "/customers" },
            { label: "Suppliers",  icon: "truck"       as const, path: "/suppliers" },
            { label: "Expenses",   icon: "credit-card" as const, path: "/expenses" },
            { label: "Ledger",     icon: "book"        as const, path: "/general-ledger" },
            { label: "Cash Flow",  icon: "trending-up" as const, path: "/cashflow" },
            { label: "Reorder",    icon: "refresh-cw"  as const, path: "/reorder" },
            { label: "Staff",      icon: "user"        as const, path: "/staff" },
          ].map((item) => {
            const active = pathname === item.path;
            return (
              <TouchableOpacity
                key={item.path}
                style={[ds.navItem, active && ds.navItemActive]}
                onPress={() => router.push(item.path as any)}
                activeOpacity={0.75}
              >
                <Feather name={item.icon} size={16} color={active ? COLORS.primary : COLORS.textSecondary} />
                <Text style={[ds.navItemText, active && ds.navItemTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Bottom: Settings + role */}
      <View style={ds.sidebarFooter}>
        <TouchableOpacity
          style={[ds.navItem, isActive("settings") && ds.navItemActive]}
          onPress={() => router.push("/(tabs)/settings" as any)}
          activeOpacity={0.75}
        >
          <Feather name="settings" size={16} color={isActive("settings") ? COLORS.primary : COLORS.textSecondary} />
          <Text style={[ds.navItemText, isActive("settings") && ds.navItemTextActive]}>Settings</Text>
        </TouchableOpacity>
        <View style={ds.rolePill}>
          <Feather name="shield" size={11} color={COLORS.primary} />
          <Text style={ds.roleText}>{user?.role?.toUpperCase() || "STAFF"}</Text>
        </View>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, flexDirection: isDesktop ? "row" : "column", backgroundColor: COLORS.surface }}>
      {isDesktop && <DesktopSidebar />}

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
              fontSize: 11,
              fontWeight: "600",
              marginTop: Platform.OS === "ios" ? 0 : 2,
            },
          }}
        >
          <Tabs.Screen
            name="home"
            options={{
              title: "Home",
              tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="billing"
            options={{
              title: "Billing",
              tabBarIcon: ({ color, size }) => <Feather name="shopping-cart" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="inventory"
            options={{
              title: "Inventory",
              tabBarIcon: ({ color, size }) => <Feather name="package" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="reports"
            options={{
              title: "Reports",
              tabBarIcon: ({ color, size }) => <Feather name="bar-chart-2" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: "Settings",
              tabBarIcon: ({ color, size }) => <Feather name="settings" size={size} color={color} />,
            }}
          />
        </Tabs>
      </View>
    </View>
  );
}

const SIDEBAR_W = 220;

const ds = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_W,
    backgroundColor: COLORS.white,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    paddingTop: 20,
    paddingBottom: 12,
    flexDirection: "column",
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 8,
  },
  logoMark: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  brandSub: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: "500",
    marginTop: 1,
  },
  navSection: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  navLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: COLORS.textMuted,
    paddingHorizontal: 8,
    paddingBottom: 4,
    paddingTop: 8,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    marginBottom: 1,
  },
  navItemActive: {
    backgroundColor: COLORS.primaryLight,
  },
  navItemText: {
    fontSize: 13,
    fontWeight: "500",
    color: COLORS.textSecondary,
  },
  navItemTextActive: {
    color: COLORS.primary,
    fontWeight: "700",
  },
  sidebarFooter: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 10,
    paddingTop: 8,
    gap: 6,
  },
  rolePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.pill,
    alignSelf: "flex-start",
    marginLeft: 2,
  },
  roleText: {
    fontSize: 10,
    fontWeight: "800",
    color: COLORS.primary,
    letterSpacing: 0.8,
  },
});
