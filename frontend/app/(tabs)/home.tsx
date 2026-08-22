import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { SPACING, DARK, ACCENT } from "@/src/theme";

type Stats = {
  sales_total: number;
  bill_count: number;
  profit_today: number;
  purchase_total: number;
  pending_credit_count: number;
  pending_credit_amount: number;
  low_stock_count: number;
  expiring_30_count: number;
  wow_sales: number;
  wow_pct: number;
};

const rupee = (n: number) =>
  `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [shopName, setShopName] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, shop] = await Promise.all([
        api<Stats & { total_sales?: number }>("/stats/today"),
        api<{ name: string }>("/shop"),
      ]);
      // Backend returns `total_sales`; normalize to the `sales_total` field the UI reads.
      setStats({ ...s, sales_total: s.sales_total ?? s.total_sales ?? 0 });
      setShopName(shop.name);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => { load(); }, [load])
  );

  const wowPct = stats?.wow_pct ?? 0;
  const profitPositive = (stats?.profit_today ?? 0) >= 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (user?.name || shopName || "there").split(" ")[0];

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <SafeAreaView style={s.safe} edges={["top"]}>
        <ScrollView
          contentContainerStyle={s.scroll}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={ACCENT.base} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={s.container}>
            {/* Top bar */}
            <View style={s.topbar}>
              <View style={{ flex: 1 }}>
                <Text style={s.greeting}>{greeting},</Text>
                <Text style={s.name} numberOfLines={1}>{firstName}</Text>
              </View>
              <TouchableOpacity
                style={s.bellBtn}
                activeOpacity={0.8}
                onPress={() => router.push("/notification-settings" as any)}
                accessibilityRole="button"
                accessibilityLabel="Notifications"
              >
                <Feather name="bell" size={20} color={DARK.text} />
              </TouchableOpacity>
            </View>

            {/* Hero sales card */}
            <View style={s.hero}>
              <View style={s.heroTopRow}>
                <Text style={s.heroLabel}>{"TODAY'S SALES"}</Text>
                {!loading && wowPct !== 0 && (
                  <View style={[s.wowBadge, { backgroundColor: wowPct >= 0 ? DARK.successSoft : DARK.dangerSoft }]}>
                    <Feather name={wowPct >= 0 ? "trending-up" : "trending-down"} size={12} color={wowPct >= 0 ? DARK.success : DARK.danger} />
                    <Text style={[s.wowText, { color: wowPct >= 0 ? DARK.success : DARK.danger }]}>
                      {wowPct >= 0 ? "+" : ""}{wowPct}%
                    </Text>
                  </View>
                )}
              </View>
              <Text style={s.heroAmount} testID="home-today-sales" numberOfLines={1} adjustsFontSizeToFit>
                {loading ? "…" : rupee(stats?.sales_total ?? 0)}
              </Text>
              <View style={s.heroFootRow}>
                <View style={s.heroChip}>
                  <Feather name="file-text" size={13} color={DARK.textSecondary} />
                  <Text style={s.heroChipText}>{stats?.bill_count ?? 0} bills</Text>
                </View>
                <View style={s.heroChip}>
                  <Feather name="trending-up" size={13} color={profitPositive ? DARK.success : DARK.danger} />
                  <Text style={[s.heroChipText, { color: profitPositive ? DARK.success : DARK.danger }]}>
                    {loading ? "…" : rupee(stats?.profit_today ?? 0)} profit
                  </Text>
                </View>
              </View>
            </View>

            {/* KPI row */}
            <View style={s.kpiRow}>
              <View style={s.kpiCard}>
                <View style={[s.kpiIcon, { backgroundColor: profitPositive ? DARK.successSoft : DARK.dangerSoft }]}>
                  <Feather name="trending-up" size={16} color={profitPositive ? DARK.success : DARK.danger} />
                </View>
                <Text style={s.kpiLabel}>PROFIT</Text>
                <Text style={s.kpiValue}>{loading ? "…" : rupee(stats?.profit_today ?? 0)}</Text>
              </View>

              <TouchableOpacity style={s.kpiCard} activeOpacity={0.85} onPress={() => router.push("/history" as any)}>
                <View style={[s.kpiIcon, { backgroundColor: DARK.warningSoft }]}>
                  <Feather name="clock" size={16} color={DARK.warning} />
                </View>
                <Text style={s.kpiLabel}>PENDING</Text>
                <Text style={s.kpiValue}>{loading ? "…" : rupee(stats?.pending_credit_amount ?? 0)}</Text>
                <Text style={s.kpiSub}>{stats?.pending_credit_count ?? 0} credit bills</Text>
              </TouchableOpacity>
            </View>

            {/* New Bill CTA */}
            <TouchableOpacity
              testID="home-new-bill-cta"
              style={s.cta}
              activeOpacity={0.9}
              onPress={() => router.push("/(tabs)/billing")}
            >
              <View style={s.ctaIcon}>
                <Feather name="plus" size={22} color={ACCENT.on} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.ctaTitle}>New Bill</Text>
                <Text style={s.ctaSub}>Search · Scan · Voice</Text>
              </View>
              <Feather name="arrow-right" size={22} color={ACCENT.on} />
            </TouchableOpacity>

            {/* Quick actions */}
            <Text style={s.section}>QUICK ACTIONS</Text>
            <View style={s.grid}>
              {QUICK_TILES.map((t) => (
                <TouchableOpacity
                  key={t.label}
                  style={s.tile}
                  activeOpacity={0.85}
                  onPress={() => router.push(t.route as any)}
                  testID={t.testID}
                >
                  <View style={s.tileIcon}>
                    <Feather name={t.icon as any} size={20} color={DARK.text} />
                  </View>
                  <Text style={s.tileLabel} numberOfLines={1}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Attention needed */}
            <Text style={s.section}>ATTENTION NEEDED</Text>
            <View style={s.alertsRow}>
              <TouchableOpacity
                testID="home-low-stock-alert"
                style={s.alertCard}
                activeOpacity={0.85}
                onPress={() => router.push("/(tabs)/reports")}
              >
                <View style={[s.alertIcon, { backgroundColor: DARK.dangerSoft }]}>
                  <Feather name="alert-triangle" size={18} color={DARK.danger} />
                </View>
                <Text style={[s.alertCount, { color: DARK.danger }]}>
                  {loading ? "–" : stats?.low_stock_count ?? 0}
                </Text>
                <Text style={s.alertLabel}>Low Stock</Text>
                <Text style={s.alertSub}>items need restock</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="home-expiring-alert"
                style={s.alertCard}
                activeOpacity={0.85}
                onPress={() => router.push("/(tabs)/reports")}
              >
                <View style={[s.alertIcon, { backgroundColor: DARK.warningSoft }]}>
                  <Feather name="calendar" size={18} color={DARK.warning} />
                </View>
                <Text style={[s.alertCount, { color: DARK.warning }]}>
                  {loading ? "–" : stats?.expiring_30_count ?? 0}
                </Text>
                <Text style={s.alertLabel}>Expiring Soon</Text>
                <Text style={s.alertSub}>within 30 days</Text>
              </TouchableOpacity>
            </View>

            {loading && !stats && <ActivityIndicator style={{ marginTop: 24 }} color={ACCENT.base} />}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const QUICK_TILES = [
  { label: "Stock In",  icon: "download",    route: "/stock-in",         testID: "home-stock-in-tile" },
  { label: "History",   icon: "clock",        route: "/history",          testID: "home-history-tile" },
  { label: "Inventory", icon: "package",      route: "/(tabs)/inventory", testID: "home-inventory-tile" },
  { label: "Reports",   icon: "bar-chart-2",  route: "/(tabs)/reports",   testID: "home-reports-tile" },
  { label: "Customers", icon: "users",        route: "/customers",        testID: "home-customers-tile" },
  { label: "Close Day", icon: "moon",         route: "/eod-close",        testID: "home-eod-tile" },
  { label: "Reorder",   icon: "refresh-cw",   route: "/reorder",          testID: "home-reorder-tile" },
  { label: "Expenses",  icon: "credit-card",  route: "/expenses",         testID: "home-expenses-tile" },
];

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  safe: { flex: 1, backgroundColor: DARK.bg },
  scroll: { paddingBottom: 130 },
  container: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: SPACING.sm,
    gap: 18,
  },

  /* Top bar */
  topbar: { flexDirection: "row", alignItems: "center", gap: 12 },
  greeting: { fontSize: 14, color: DARK.textSecondary, fontWeight: "500" },
  name: { fontSize: 26, fontWeight: "800", color: DARK.text, letterSpacing: -0.6, marginTop: 2 },
  bellBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: DARK.surfaceHigh,
    borderWidth: 1, borderColor: DARK.borderSoft,
    alignItems: "center", justifyContent: "center",
  },

  /* Hero */
  hero: {
    backgroundColor: DARK.surface,
    borderRadius: 24, padding: 22,
    borderWidth: 1, borderColor: DARK.borderSoft,
  },
  heroTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.4, color: DARK.textMuted },
  wowBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  wowText: { fontSize: 12, fontWeight: "800" },
  heroAmount: { fontSize: 46, fontWeight: "900", color: DARK.text, letterSpacing: -1.6, marginTop: 10, marginBottom: 16 },
  heroFootRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  heroChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: DARK.surfaceHigh,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
  },
  heroChipText: { fontSize: 13, fontWeight: "600", color: DARK.textSecondary },

  /* KPI */
  kpiRow: { flexDirection: "row", gap: 12 },
  kpiCard: {
    flex: 1, backgroundColor: DARK.surface,
    borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: DARK.borderSoft, gap: 8,
  },
  kpiIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  kpiLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: DARK.textMuted, marginTop: 2 },
  kpiValue: { fontSize: 22, fontWeight: "800", color: DARK.text, letterSpacing: -0.5 },
  kpiSub: { fontSize: 12, color: DARK.textMuted },

  /* CTA */
  cta: {
    backgroundColor: ACCENT.base,
    borderRadius: 20, padding: 18,
    flexDirection: "row", alignItems: "center", gap: 14,
  },
  ctaIcon: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center", justifyContent: "center",
  },
  ctaTitle: { color: ACCENT.on, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  ctaSub: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 2, fontWeight: "500" },

  /* Section label */
  section: { fontSize: 12, fontWeight: "800", letterSpacing: 1.4, color: DARK.textMuted, marginTop: 6, marginBottom: -6 },

  /* Quick actions grid */
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    flexBasis: "22%", flexGrow: 1, minWidth: 76,
    backgroundColor: DARK.surface,
    borderRadius: 18, paddingVertical: 16,
    alignItems: "center", gap: 10,
    borderWidth: 1, borderColor: DARK.borderSoft,
  },
  tileIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: DARK.surfaceHigh,
    alignItems: "center", justifyContent: "center",
  },
  tileLabel: { fontSize: 12, fontWeight: "600", color: DARK.textSecondary },

  /* Alerts */
  alertsRow: { flexDirection: "row", gap: 12 },
  alertCard: {
    flex: 1, backgroundColor: DARK.surface,
    borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: DARK.borderSoft, gap: 4,
  },
  alertIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  alertCount: { fontSize: 30, fontWeight: "900", letterSpacing: -1 },
  alertLabel: { fontSize: 14, fontWeight: "700", color: DARK.text },
  alertSub: { fontSize: 12, color: DARK.textMuted },
});
