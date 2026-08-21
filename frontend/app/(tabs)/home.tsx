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
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

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
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [shopName, setShopName] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, shop] = await Promise.all([
        api<Stats>("/stats/today"),
        api<{ name: string }>("/shop"),
      ]);
      setStats(s);
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
  const hasPending = (stats?.pending_credit_count ?? 0) > 0;

  return (
    <SafeAreaView style={[s.root, isDesktop && s.rootDesktop]} edges={["top"]}>
      <View style={isDesktop ? s.desktopCol : { flex: 1 }}>
      {/* Header — hidden on desktop; sidebar carries brand + identity */}
      <View style={[s.header, isDesktop && { display: "none" }]}>
        <View style={s.headerLeft}>
          <View style={s.logoMark}>
            <Feather name="activity" size={16} color={COLORS.primary} />
          </View>
          <Text style={s.headerTitle} numberOfLines={1}>{shopName || "Pharma Counter"}</Text>
        </View>
        <View style={s.roleBadge}>
          <Feather name="shield" size={11} color={COLORS.primary} />
          <Text style={s.roleText}>{user?.role?.toUpperCase() || "STAFF"}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Sales Card */}
        <View style={s.heroCard}>
          <View style={s.heroTop}>
            <View>
              <Text style={s.heroLabel}>TODAY'S SALES</Text>
              <Text style={s.heroAmount} testID="home-today-sales">
                {loading ? "…" : rupee(stats?.sales_total ?? 0)}
              </Text>
            </View>
            {!loading && wowPct !== 0 && (
              <View style={[s.wowBadge, { backgroundColor: wowPct >= 0 ? "rgba(16,185,129,0.15)" : "rgba(186,26,26,0.15)" }]}>
                <Feather name={wowPct >= 0 ? "trending-up" : "trending-down"} size={11} color={wowPct >= 0 ? "#86EFAC" : "#FCA5A5"} />
                <Text style={[s.wowText, { color: wowPct >= 0 ? "#86EFAC" : "#FCA5A5" }]}>
                  {wowPct >= 0 ? "+" : ""}{wowPct}% WoW
                </Text>
              </View>
            )}
          </View>
          <View style={s.heroBillRow}>
            <Feather name="file-text" size={14} color={COLORS.inversePrimary} />
            <Text style={s.heroBillText}>{stats?.bill_count ?? 0} bills generated today</Text>
          </View>
        </View>

        {/* Secondary KPI Row */}
        <View style={s.kpiRow}>
          <View style={[s.kpiCard, profitPositive ? s.kpiCardSuccess : s.kpiCardDanger]}>
            <View style={s.kpiCardTop}>
              <Text style={s.kpiCardLabel}>PROFIT TODAY</Text>
              <View style={[s.kpiIcon, { backgroundColor: profitPositive ? COLORS.successBg : COLORS.dangerBg }]}>
                <Feather name="trending-up" size={14} color={profitPositive ? COLORS.successDark : COLORS.dangerDark} />
              </View>
            </View>
            <Text style={[s.kpiCardValue, { color: profitPositive ? COLORS.successDark : COLORS.dangerDark }]}>
              {loading ? "…" : rupee(stats?.profit_today ?? 0)}
            </Text>
          </View>

          <TouchableOpacity
            style={[s.kpiCard, hasPending ? s.kpiCardWarning : {}]}
            onPress={() => router.push("/history" as any)}
            activeOpacity={0.85}
          >
            <View style={s.kpiCardTop}>
              <Text style={s.kpiCardLabel}>PENDING</Text>
              <View style={[s.kpiIcon, { backgroundColor: COLORS.warningBg }]}>
                <Feather name="clock" size={14} color={COLORS.warningDark} />
              </View>
            </View>
            <Text style={[s.kpiCardValue, { color: hasPending ? COLORS.warningDark : COLORS.text }]}>
              {loading ? "…" : rupee(stats?.pending_credit_amount ?? 0)}
            </Text>
            <Text style={s.kpiCardSub}>{stats?.pending_credit_count ?? 0} credit bills</Text>
          </TouchableOpacity>
        </View>

        {/* New Bill CTA */}
        <TouchableOpacity
          testID="home-new-bill-cta"
          style={s.newBillBtn}
          activeOpacity={0.85}
          onPress={() => router.push("/(tabs)/billing")}
        >
          <View style={s.newBillIconWrap}>
            <Feather name="plus" size={24} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.newBillTitle}>New Bill</Text>
            <Text style={s.newBillSub}>Search · Scan · Voice</Text>
          </View>
          <Feather name="arrow-right" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Quick Actions */}
        <Text style={s.sectionLabel}>QUICK ACTIONS</Text>
        <View style={s.tileGrid}>
          {QUICK_TILES.map((t) => (
            <TouchableOpacity
              key={t.label}
              style={s.tile}
              onPress={() => router.push(t.route as any)}
              activeOpacity={0.85}
              testID={t.testID}
            >
              <View style={s.tileIcon}>
                <Feather name={t.icon as any} size={22} color={COLORS.primary} />
              </View>
              <Text style={s.tileLabel}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Alerts */}
        <Text style={s.sectionLabel}>ATTENTION NEEDED</Text>
        <View style={s.alertsRow}>
          <TouchableOpacity
            testID="home-low-stock-alert"
            style={s.alertCard}
            onPress={() => router.push("/(tabs)/reports")}
            activeOpacity={0.85}
          >
            <View style={[s.alertIcon, { backgroundColor: COLORS.dangerBg }]}>
              <Feather name="alert-triangle" size={18} color={COLORS.dangerDark} />
            </View>
            <Text style={[s.alertCount, { color: COLORS.danger }]}>
              {loading ? "–" : stats?.low_stock_count ?? 0}
            </Text>
            <Text style={s.alertLabel}>Low Stock</Text>
            <Text style={s.alertSub}>items need restock</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="home-expiring-alert"
            style={s.alertCard}
            onPress={() => router.push("/(tabs)/reports")}
            activeOpacity={0.85}
          >
            <View style={[s.alertIcon, { backgroundColor: COLORS.warningBg }]}>
              <Feather name="calendar" size={18} color={COLORS.warningDark} />
            </View>
            <Text style={[s.alertCount, { color: COLORS.warning }]}>
              {loading ? "–" : stats?.expiring_30_count ?? 0}
            </Text>
            <Text style={s.alertLabel}>Expiring Soon</Text>
            <Text style={s.alertSub}>within 30 days</Text>
          </TouchableOpacity>
        </View>

        {loading && !stats && <ActivityIndicator style={{ marginTop: 24 }} color={COLORS.primary} />}
      </ScrollView>
      </View>
    </SafeAreaView>
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
  root: { flex: 1, backgroundColor: COLORS.surface },
  rootDesktop: { backgroundColor: "#F0F2F8" },
  desktopCol: {
    flex: 1,
    width: "100%",
    maxWidth: 920,
    alignSelf: "center",
    backgroundColor: COLORS.surface,
  },

  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  logoMark: {
    width: 30, height: 30, borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryFixed,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: COLORS.primary, letterSpacing: -0.2, maxWidth: 220 },
  roleBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: COLORS.primaryFixed,
    paddingHorizontal: SPACING.sm, paddingVertical: 5,
    borderRadius: RADIUS.pill,
  },
  roleText: { fontSize: 10, fontWeight: "800", color: COLORS.primary, letterSpacing: 0.8 },

  scroll: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl * 2 },

  heroCard: {
    backgroundColor: COLORS.inverseSurface,
    borderRadius: RADIUS.xl, padding: SPACING.xl, gap: SPACING.md, overflow: "hidden",
  },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  heroLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.5, color: COLORS.inversePrimary, marginBottom: 4 },
  heroAmount: { fontSize: 40, fontWeight: "900", color: COLORS.textInverse, letterSpacing: -1 },
  wowBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.pill,
  },
  wowText: { fontSize: 11, fontWeight: "700" },
  heroBillRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)", paddingTop: SPACING.md,
  },
  heroBillText: { fontSize: 13, color: COLORS.inversePrimary },

  kpiRow: { flexDirection: "row", gap: SPACING.md },
  kpiCard: {
    flex: 1, backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.border,
    padding: SPACING.md, gap: 4,
  },
  kpiCardSuccess: { borderColor: COLORS.success },
  kpiCardDanger:  { borderColor: COLORS.danger },
  kpiCardWarning: { borderColor: COLORS.warning },
  kpiCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kpiCardLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1.2, color: COLORS.textMuted },
  kpiIcon: { width: 28, height: 28, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  kpiCardValue: { fontSize: 20, fontWeight: "800", color: COLORS.text, marginTop: 2 },
  kpiCardSub: { fontSize: 11, color: COLORS.textMuted },

  newBillBtn: {
    backgroundColor: COLORS.primaryContainer,
    borderRadius: RADIUS.lg, padding: SPACING.lg,
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
  },
  newBillIconWrap: {
    width: 44, height: 44, borderRadius: RADIUS.md,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  newBillTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  newBillSub: { color: COLORS.primaryFixed, fontSize: 12, marginTop: 1 },

  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: SPACING.xs },

  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  tile: {
    flexBasis: "23%", flexGrow: 1, minWidth: 130,
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, padding: SPACING.lg, gap: SPACING.sm,
  },
  tileIcon: {
    width: 40, height: 40, borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryFixed,
    alignItems: "center", justifyContent: "center",
  },
  tileLabel: { fontSize: 14, fontWeight: "700", color: COLORS.text },

  alertsRow: { flexDirection: "row", gap: SPACING.md },
  alertCard: {
    flex: 1, backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.lg, gap: 3,
  },
  alertIcon: { width: 36, height: 36, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  alertCount: { fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  alertLabel: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  alertSub: { fontSize: 11, color: COLORS.textSecondary },
});
