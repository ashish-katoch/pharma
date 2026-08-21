import { useRouter, usePathname } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from "react-native";
import { useAuth } from "@/src/auth";
import { COLORS } from "@/src/theme";

// Sidebar palette — dark navy, independent of COLORS to avoid coupling
const S = {
  bg:           "#0D1B3E",
  bgHover:      "rgba(255,255,255,0.06)",
  bgActive:     "rgba(99,179,237,0.14)",
  border:       "rgba(255,255,255,0.07)",
  accent:       "#60A5FA",
  accentDim:    "rgba(96,165,250,0.4)",
  text:         "#FFFFFF",
  textSecondary:"rgba(255,255,255,0.55)",
  textMuted:    "rgba(255,255,255,0.30)",
  logoMark:     COLORS.primary,
  divider:      "rgba(255,255,255,0.08)",
  shadow:       "rgba(0,0,0,0.45)",
};

const NAV_ITEMS = [
  { name: "home",      label: "Dashboard",  icon: "home"          as const },
  { name: "billing",   label: "Billing",    icon: "shopping-cart" as const },
  { name: "inventory", label: "Inventory",  icon: "package"       as const },
  { name: "reports",   label: "Reports",    icon: "bar-chart-2"   as const },
];

const QUICK_ITEMS: { label: string; icon: any; path: string }[] = [
  { label: "Bill History",  icon: "clock",        path: "/history" },
  { label: "Customers",     icon: "users",        path: "/customers" },
  { label: "Suppliers",     icon: "truck",        path: "/suppliers" },
  { label: "Expenses",      icon: "credit-card",  path: "/expenses" },
  { label: "General Ledger",icon: "book",         path: "/general-ledger" },
  { label: "Cash Flow",     icon: "trending-up",  path: "/cashflow" },
  { label: "Reorder",       icon: "refresh-cw",   path: "/reorder" },
  { label: "Staff",         icon: "user",         path: "/staff" },
];

function NavItem({
  icon,
  label,
  active,
  onPress,
  small = false,
}: {
  icon: any;
  label: string;
  active: boolean;
  onPress: () => void;
  small?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[ds.item, active && ds.itemActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {active && <View style={ds.activeBar} />}
      <View style={[ds.iconWrap, active && ds.iconWrapActive]}>
        <Feather
          name={icon}
          size={small ? 15 : 16}
          color={active ? S.accent : S.textSecondary}
        />
      </View>
      <Text
        style={[ds.itemLabel, small && ds.itemLabelSmall, active && ds.itemLabelActive]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SectionLabel({ title }: { title: string }) {
  return (
    <View style={ds.sectionHeader}>
      <Text style={ds.sectionLabel}>{title}</Text>
      <View style={ds.sectionLine} />
    </View>
  );
}

export function DesktopSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();

  const isTabActive = (name: string) =>
    pathname.includes(`/(tabs)/${name}`) || pathname === `/${name}`;

  const isPathActive = (path: string) => pathname === path;

  const initials = (user?.name ?? "U")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <View style={ds.sidebar}>
      {/* Brand */}
      <View style={ds.brand}>
        <View style={ds.logoMark}>
          <Feather name="activity" size={16} color="#fff" />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={ds.brandName}>Pharma Counter</Text>
          <Text style={ds.brandSub} numberOfLines={1}>
            {user?.name || "Owner"}
          </Text>
        </View>
      </View>

      <View style={ds.divider} />

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={ds.scrollContent}>
        {/* Main navigation */}
        <SectionLabel title="MAIN" />
        <View style={ds.navGroup}>
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.name}
              icon={item.icon}
              label={item.label}
              active={isTabActive(item.name)}
              onPress={() => router.push(`/(tabs)/${item.name}` as any)}
            />
          ))}
        </View>

        {/* Quick access */}
        <SectionLabel title="QUICK ACCESS" />
        <View style={ds.navGroup}>
          {QUICK_ITEMS.map((item) => (
            <NavItem
              key={item.path}
              icon={item.icon}
              label={item.label}
              active={isPathActive(item.path)}
              onPress={() => router.push(item.path as any)}
              small
            />
          ))}
        </View>
      </ScrollView>

      <View style={ds.divider} />

      {/* Footer */}
      <View style={ds.footer}>
        <NavItem
          icon="settings"
          label="Settings"
          active={isTabActive("settings")}
          onPress={() => router.push("/(tabs)/settings" as any)}
          small
        />
        {/* User row */}
        <View style={ds.userRow}>
          <View style={ds.avatar}>
            <Text style={ds.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={ds.userName} numberOfLines={1}>{user?.name || "Owner"}</Text>
            <Text style={ds.userRole}>{(user?.role || "staff").toUpperCase()}</Text>
          </View>
          <View style={ds.rolePill}>
            <Feather name="shield" size={10} color={S.accent} />
          </View>
        </View>
      </View>
    </View>
  );
}

const ds = StyleSheet.create({
  sidebar: {
    width: 232,
    backgroundColor: S.bg,
    flexDirection: "column",
    // Web shadow
    ...(Platform.OS === "web" ? {
      boxShadow: `2px 0 24px ${S.shadow}`,
    } as any : {
      shadowColor: "#000",
      shadowOffset: { width: 2, height: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      elevation: 8,
    }),
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 18,
  },
  logoMark: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    fontSize: 13.5,
    fontWeight: "700",
    color: S.text,
    letterSpacing: -0.3,
  },
  brandSub: {
    fontSize: 11,
    color: S.textMuted,
    fontWeight: "500",
    letterSpacing: 0.1,
  },
  divider: {
    height: 1,
    backgroundColor: S.divider,
    marginHorizontal: 0,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 6,
  },
  sectionLabel: {
    fontSize: 9.5,
    fontWeight: "700",
    color: S.textMuted,
    letterSpacing: 1.4,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: S.divider,
  },
  navGroup: {
    paddingHorizontal: 10,
    gap: 1,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingVertical: 9,
    paddingRight: 12,
    paddingLeft: 8,
    gap: 10,
    position: "relative",
    overflow: "hidden",
  },
  itemActive: {
    backgroundColor: S.bgActive,
  },
  activeBar: {
    position: "absolute",
    left: 0,
    top: 6,
    bottom: 6,
    width: 3,
    borderRadius: 2,
    backgroundColor: S.accent,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  iconWrapActive: {
    backgroundColor: "rgba(96,165,250,0.15)",
  },
  itemLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: S.textSecondary,
    flex: 1,
    letterSpacing: 0.1,
  },
  itemLabelSmall: {
    fontSize: 12.5,
  },
  itemLabelActive: {
    color: S.text,
    fontWeight: "600",
  },
  footer: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 2,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: S.border,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.5,
  },
  userName: {
    fontSize: 12,
    fontWeight: "600",
    color: S.text,
    letterSpacing: -0.1,
  },
  userRole: {
    fontSize: 9.5,
    fontWeight: "700",
    color: S.textMuted,
    letterSpacing: 1.2,
    marginTop: 1,
  },
  rolePill: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: "rgba(96,165,250,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
});
