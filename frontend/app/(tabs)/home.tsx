import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { COLORS, SPACING, RADIUS, SHADOWS, TYPE } from "@/src/theme";

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

const QUICK_TILES = [
  { label: "Stock In",  icon: "download",    route: "/stock-in",         testID: "home-stock-in-tile" },
  { label: "History",   icon: "clock",        route: "/history",          testID: "home-history-tile" },
  { label: "Inventory", icon: "package",      route: "/(tabs)/inventory", testID: "home-inventory-tile" },
  { label: "Customers", icon: "users",        route: "/customers",        testID: "home-customers-tile" },
  { label: "Suppliers", icon: "truck",        route: "/suppliers",        testID: "home-suppliers-tile" },
  { label: "Reorder",   icon: "refresh-cw",   route: "/reorder",          testID: "home-reorder-tile" },
  { label: "Expenses",  icon: "credit-card",  route: "/expenses",         testID: "home-expenses-tile" },
  { label: "Close Day", icon: "moon",         route: "/eod-close",        testID: "home-eod-tile" },
] as const;

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
      <StatusBar style="dark" />
      <SafeAreaView style={s.safe} edges={["top"]}>
        <ScrollView
          contentContainerStyle={s.scroll}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.primary} />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={s.container}>

            {/* ── Header ─────────────────────────────────────────────── */}
            <View style={s.header}>
              <View style={{ flex: 1 }}>
                <Text style={s.greeting}>{greeting},</Text>
                <Text style={s.name} numberOfLines={1}>{firstName} 👋</Text>
              </View>
              <TouchableOpacity
                style={s.bellBtn}
                activeOpacity={0.75}
                onPress={() => router.push("/notification-settings" as any)}
                accessibilityRole="button"
                accessibilityLabel="Notifications"
              >
                <Feather name="bell" size={19} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {/* ── Hero — Today's Sales ────────────────────────────────── */}
            <View style={s.hero}>
              <View style={s.heroTopRow}>
                <Text style={s.heroLabel}>{"TODAY'S SALES"}</Text>
                {!loading && wowPct !== 0 && (
                  <View style={[s.wowPill, {
                    backgroundColor: wowPct >= 0
                      ? "rgba(21,154,112,0.14)"
                      : "rgba(214,69,69,0.14)",
                  }]}>
                    <Feather
                      name={wowPct >= 0 ? "trending-up" : "trending-down"}
                      size={12}
                      color={wowPct >= 0 ? COLORS.success : COLORS.danger}
                    />
                    <Text style={[s.wowText, {
                      color: wowPct >= 0 ? COLORS.success : COLORS.danger,
                    }]}>
                      {wowPct >= 0 ? "+" : ""}{wowPct}%
                    </Text>
                  </View>
                )}
              </View>

              <Text style={s.heroAmount} testID="home-today-sales" numberOfLines={1} adjustsFontSizeToFit>
                {loading ? "—" : rupee(stats?.sales_total ?? 0)}
              </Text>

              <View style={s.heroFootRow}>
                <View style={s.heroPill}>
                  <Feather name="file-text" size={12} color={COLORS.textSecondary} />
                  <Text style={s.heroPillText}>{stats?.bill_count ?? 0} bills today</Text>
                </View>
                {(stats?.wow_sales ?? 0) !== 0 && (
                  <View style={s.heroPill}>
                    <Feather name="activity" size={12} color={COLORS.textSecondary} />
                    <Text style={s.heroPillText}>
                      {rupee(Math.abs(stats?.wow_sales ?? 0))} vs yesterday
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* ── KPI cards — Profit + Pending ───────────────────────── */}
            <View style={s.kpiRow}>
              <View style={[s.kpiCard, SHADOWS.sm]}>
                <View style={[s.kpiIconBox, {
                  backgroundColor: profitPositive ? COLORS.successBg : COLORS.dangerBg,
                }]}>
                  <Feather
                    name="trending-up"
                    size={16}
                    color={profitPositive ? COLORS.success : COLORS.danger}
                  />
                </View>
                <Text style={s.kpiOverline}>PROFIT TODAY</Text>
                <Text style={[s.kpiValue, {
                  color: profitPositive ? COLORS.success : COLORS.danger,
                }]}>
                  {loading ? "—" : rupee(stats?.profit_today ?? 0)}
                </Text>
                {!loading && wowPct !== 0 && (
                  <Text style={s.kpiSub}>
                    {wowPct >= 0 ? "▲" : "▼"} {Math.abs(wowPct)}% vs yesterday
                  </Text>
                )}
              </View>

              <TouchableOpacity
                style={[s.kpiCard, SHADOWS.sm]}
                activeOpacity={0.85}
                onPress={() => router.push("/history" as any)}
              >
                <View style={[s.kpiIconBox, { backgroundColor: COLORS.warningBg }]}>
                  <Feather name="clock" size={16} color={COLORS.warning} />
                </View>
                <Text style={s.kpiOverline}>PENDING</Text>
                <Text style={[s.kpiValue, { color: COLORS.warning }]}>
                  {loading ? "—" : rupee(stats?.pending_credit_amount ?? 0)}
                </Text>
                <Text style={s.kpiSub}>
                  {stats?.pending_credit_count ?? 0} credit bill{(stats?.pending_credit_count ?? 0) !== 1 ? "s" : ""}
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── New Bill CTA ────────────────────────────────────────── */}
            <TouchableOpacity
              testID="home-new-bill-cta"
              style={[s.cta, SHADOWS.md]}
              activeOpacity={0.88}
              onPress={() => router.push("/(tabs)/billing")}
            >
              <View style={s.ctaIconBox}>
                <Feather name="plus" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.ctaTitle}>New Bill</Text>
                <Text style={s.ctaSub}>Search · Scan · Barcode</Text>
              </View>
              <Feather name="arrow-right" size={20} color="#fff" />
            </TouchableOpacity>

            {/* ── Quick actions ───────────────────────────────────────── */}
            <Text style={s.sectionLabel}>QUICK ACTIONS</Text>
            <View style={s.grid}>
              {QUICK_TILES.map((t) => (
                <TouchableOpacity
                  key={t.label}
                  style={[s.tile, SHADOWS.sm]}
                  activeOpacity={0.8}
                  onPress={() => router.push(t.route as any)}
                  testID={t.testID}
                >
                  <View style={s.tileIconBox}>
                    <Feather name={t.icon as any} size={19} color={COLORS.primary} />
                  </View>
                  <Text style={s.tileLabel} numberOfLines={1}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Attention needed ────────────────────────────────────── */}
            {(loading || (stats?.low_stock_count ?? 0) > 0 || (stats?.expiring_30_count ?? 0) > 0) && (
              <>
                <Text style={s.sectionLabel}>ATTENTION NEEDED</Text>
                <View style={s.alertRow}>
                  <TouchableOpacity
                    testID="home-low-stock-alert"
                    style={[s.alertCard, SHADOWS.sm]}
                    activeOpacity={0.85}
                    onPress={() => router.push("/(tabs)/inventory" as any)}
                  >
                    <View style={s.alertLeft}>
                      <View style={[s.alertIconBox, { backgroundColor: COLORS.dangerBg }]}>
                        <Feather name="alert-triangle" size={16} color={COLORS.danger} />
                      </View>
                      <View>
                        <Text style={s.alertTitle}>Low Stock</Text>
                        <Text style={s.alertSub}>items need restock</Text>
                      </View>
                    </View>
                    <Text style={[s.alertCount, { color: COLORS.danger }]}>
                      {loading ? "–" : stats?.low_stock_count ?? 0}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="home-expiring-alert"
                    style={[s.alertCard, SHADOWS.sm]}
                    activeOpacity={0.85}
                    onPress={() => router.push("/(tabs)/reports" as any)}
                  >
                    <View style={s.alertLeft}>
                      <View style={[s.alertIconBox, { backgroundColor: COLORS.warningBg }]}>
                        <Feather name="calendar" size={16} color={COLORS.warning} />
                      </View>
                      <View>
                        <Text style={s.alertTitle}>Expiring Soon</Text>
                        <Text style={s.alertSub}>within 30 days</Text>
                      </View>
                    </View>
                    <Text style={[s.alertCount, { color: COLORS.warning }]}>
                      {loading ? "–" : stats?.expiring_30_count ?? 0}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {loading && !stats && (
              <ActivityIndicator style={{ marginTop: 24 }} color={COLORS.primary} />
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: COLORS.bg },
  safe:    { flex: 1 },
  scroll:  { paddingBottom: 120 },
  container: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: SPACING.sm,
    gap: 16,
  },

  // Header
  header:  { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  greeting:{ ...TYPE.label, color: COLORS.textSecondary },
  name:    { ...TYPE.h2, color: COLORS.text, marginTop: 2 },
  bellBtn: {
    width: 44, height: 44, borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center",
    ...SHADOWS.sm as object,
  },

  // Hero
  hero: {
    backgroundColor: COLORS.dark,
    borderRadius: RADIUS.xl,
    padding: 22,
  },
  heroTopRow:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroLabel:   { ...TYPE.overline, color: "rgba(255,255,255,0.55)" },
  wowPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.pill,
  },
  wowText:     { fontSize: 12, fontWeight: "800" },
  heroAmount: {
    fontSize: 50, fontWeight: "900", color: "#FFFFFF",
    letterSpacing: -1.8, marginTop: 10, marginBottom: 18,
  },
  heroFootRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  heroPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: RADIUS.pill,
  },
  heroPillText:{ fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.75)" },

  // KPI
  kpiRow:    { flexDirection: "row", gap: 12 },
  kpiCard: {
    flex: 1, backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg, padding: 16,
    borderWidth: 1, borderColor: COLORS.border, gap: 6,
  },
  kpiIconBox: { width: 38, height: 38, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  kpiOverline: { ...TYPE.overline, color: COLORS.textMuted, marginTop: 4 },
  kpiValue:    { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  kpiSub:      { ...TYPE.caption, color: COLORS.textSecondary },

  // CTA
  cta: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg, padding: 18,
    flexDirection: "row", alignItems: "center", gap: 14,
  },
  ctaIconBox: {
    width: 46, height: 46, borderRadius: RADIUS.sm,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  ctaTitle: { color: "#fff", fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  ctaSub:   { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 2, fontWeight: "500" },

  // Section
  sectionLabel: { ...TYPE.overline, color: COLORS.textMuted, marginTop: 4, marginBottom: -4 },

  // Quick action grid
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    flexBasis: "22%", flexGrow: 1, minWidth: 76,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md, paddingVertical: 16,
    alignItems: "center", gap: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  tileIconBox: {
    width: 42, height: 42, borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center", justifyContent: "center",
  },
  tileLabel: { ...TYPE.caption, color: COLORS.textSecondary, fontWeight: "600" },

  // Alerts
  alertRow:  { gap: 10 },
  alertCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  alertLeft:    { flexDirection: "row", alignItems: "center", gap: 12 },
  alertIconBox: { width: 38, height: 38, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  alertTitle:   { ...TYPE.label, color: COLORS.text },
  alertSub:     { ...TYPE.caption, color: COLORS.textSecondary, marginTop: 2 },
  alertCount:   { fontSize: 26, fontWeight: "900", letterSpacing: -0.8 },
});
