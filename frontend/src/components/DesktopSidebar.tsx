import { useRouter, usePathname } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useAuth } from "@/src/auth";
import { COLORS, RADIUS } from "@/src/theme";

const NAV_ITEMS = [
  { name: "home",      label: "Dashboard",  icon: "home"          as const },
  { name: "billing",   label: "Billing",    icon: "shopping-cart" as const },
  { name: "inventory", label: "Inventory",  icon: "package"       as const },
  { name: "reports",   label: "Reports",    icon: "bar-chart-2"   as const },
];

const QUICK_ITEMS: { label: string; icon: any; path: string }[] = [
  { label: "History",    icon: "clock",        path: "/history" },
  { label: "Customers",  icon: "users",        path: "/customers" },
  { label: "Suppliers",  icon: "truck",        path: "/suppliers" },
  { label: "Expenses",   icon: "credit-card",  path: "/expenses" },
  { label: "Ledger",     icon: "book",         path: "/general-ledger" },
  { label: "Cash Flow",  icon: "trending-up",  path: "/cashflow" },
  { label: "Reorder",    icon: "refresh-cw",   path: "/reorder" },
  { label: "Staff",      icon: "user",         path: "/staff" },
];

export function DesktopSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();

  const isTabActive = (name: string) =>
    pathname.includes(`/(tabs)/${name}`) || pathname === `/${name}`;

  const isPathActive = (path: string) => pathname === path;

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

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Main tabs */}
        <View style={ds.navSection}>
          <Text style={ds.navLabel}>MAIN</Text>
          {NAV_ITEMS.map((item) => {
            const active = isTabActive(item.name);
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

        {/* Quick access */}
        <View style={ds.navSection}>
          <Text style={ds.navLabel}>QUICK ACCESS</Text>
          {QUICK_ITEMS.map((item) => {
            const active = isPathActive(item.path);
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

      {/* Footer: Settings + role badge */}
      <View style={ds.sidebarFooter}>
        <TouchableOpacity
          style={[ds.navItem, isTabActive("settings") && ds.navItemActive]}
          onPress={() => router.push("/(tabs)/settings" as any)}
          activeOpacity={0.75}
        >
          <Feather name="settings" size={16} color={isTabActive("settings") ? COLORS.primary : COLORS.textSecondary} />
          <Text style={[ds.navItemText, isTabActive("settings") && ds.navItemTextActive]}>Settings</Text>
        </TouchableOpacity>
        <View style={ds.rolePill}>
          <Feather name="shield" size={11} color={COLORS.primary} />
          <Text style={ds.roleText}>{user?.role?.toUpperCase() || "STAFF"}</Text>
        </View>
      </View>
    </View>
  );
}

const ds = StyleSheet.create({
  sidebar: {
    width: 220,
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
  brandName: { fontSize: 13, fontWeight: "800", color: COLORS.text, letterSpacing: -0.2 },
  brandSub:  { fontSize: 11, color: COLORS.textMuted, fontWeight: "500", marginTop: 1 },
  navSection: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 },
  navLabel: {
    fontSize: 9, fontWeight: "800", letterSpacing: 1.2, color: COLORS.textMuted,
    paddingHorizontal: 8, paddingBottom: 4, paddingTop: 8,
  },
  navItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: RADIUS.md, marginBottom: 1,
  },
  navItemActive:     { backgroundColor: COLORS.primaryLight },
  navItemText:       { fontSize: 13, fontWeight: "500", color: COLORS.textSecondary },
  navItemTextActive: { color: COLORS.primary, fontWeight: "700" },
  sidebarFooter: {
    borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingHorizontal: 10, paddingTop: 8, gap: 6,
  },
  rolePill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.pill, alignSelf: "flex-start", marginLeft: 2,
  },
  roleText: { fontSize: 10, fontWeight: "800", color: COLORS.primary, letterSpacing: 0.8 },
});
