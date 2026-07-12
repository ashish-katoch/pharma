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
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

type Stats = {
  sales_total: number;
  bill_count: number;
  low_stock_count: number;
  expiring_30_count: number;
};

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

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
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.primary} />}
      >
        {/* header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.hello} testID="home-greeting">
              {`Hi, ${user?.name?.split(" ")[0] || "there"}`}
            </Text>
            <Text style={styles.shopName} numberOfLines={1}>{shopName || "Pharma Counter"}</Text>
          </View>
          <View style={styles.roleBadge}>
            <Feather name="shield" size={12} color={COLORS.primary} />
            <Text style={styles.roleText}>{user?.role?.toUpperCase()}</Text>
          </View>
        </View>

        {/* KPI card */}
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>TODAY'S SALES</Text>
          <Text style={styles.kpiAmount} testID="home-today-sales">
            {loading ? "…" : rupee(stats?.sales_total ?? 0)}
          </Text>
          <View style={styles.kpiSub}>
            <Feather name="file-text" size={13} color={COLORS.textSecondary} />
            <Text style={styles.kpiSubText}>{stats?.bill_count ?? 0} bills</Text>
          </View>
        </View>

        {/* Primary CTA */}
        <TouchableOpacity
          testID="home-new-bill-cta"
          style={styles.newBillBtn}
          activeOpacity={0.85}
          onPress={() => router.push("/(tabs)/billing")}
        >
          <View style={styles.newBillIcon}>
            <Feather name="plus" size={28} color={COLORS.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.newBillTitle}>New Bill</Text>
            <Text style={styles.newBillSub}>Search medicine · scan · voice</Text>
          </View>
          <Feather name="arrow-right" size={22} color={COLORS.white} />
        </TouchableOpacity>

        {/* Quick tiles */}
        <View style={styles.tileGrid}>
          <QuickTile
            testID="home-stock-in-tile"
            icon="download"
            label="Stock In"
            onPress={() => router.push("/stock-in")}
          />
          <QuickTile
            testID="home-history-tile"
            icon="clock"
            label="History"
            onPress={() => router.push("/history")}
          />
          <QuickTile
            testID="home-inventory-tile"
            icon="package"
            label="Inventory"
            onPress={() => router.push("/(tabs)/inventory")}
          />
          <QuickTile
            testID="home-reports-tile"
            icon="bar-chart-2"
            label="Reports"
            onPress={() => router.push("/(tabs)/reports")}
          />
        </View>

        {/* Alerts */}
        <Text style={styles.sectionLabel}>ATTENTION</Text>
        <View style={styles.alertsRow}>
          <AlertCard
            testID="home-low-stock-alert"
            tone="danger"
            icon="alert-triangle"
            count={stats?.low_stock_count ?? 0}
            label="Low stock items"
            onPress={() => router.push("/(tabs)/reports")}
          />
          <AlertCard
            testID="home-expiring-alert"
            tone="warning"
            icon="calendar"
            count={stats?.expiring_30_count ?? 0}
            label="Expiring in 30 days"
            onPress={() => router.push("/(tabs)/reports")}
          />
        </View>

        {loading && !stats ? (
          <ActivityIndicator style={{ marginTop: 20 }} color={COLORS.primary} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickTile({ icon, label, onPress, testID }: any) {
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress} activeOpacity={0.85} testID={testID}>
      <View style={styles.tileIcon}>
        <Feather name={icon} size={22} color={COLORS.primary} />
      </View>
      <Text style={styles.tileLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function AlertCard({ tone, icon, count, label, onPress, testID }: any) {
  const bg = tone === "danger" ? COLORS.dangerBg : COLORS.warningBg;
  const fg = tone === "danger" ? COLORS.danger : COLORS.warning;
  return (
    <TouchableOpacity
      style={[styles.alertCard, { backgroundColor: bg }]}
      onPress={onPress}
      activeOpacity={0.85}
      testID={testID}
    >
      <Feather name={icon} size={20} color={fg} />
      <Text style={[styles.alertCount, { color: fg }]}>{count}</Text>
      <Text style={styles.alertLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  scroll: { padding: SPACING.lg, paddingBottom: SPACING.xxl, gap: SPACING.lg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hello: { fontSize: 13, color: COLORS.textSecondary, fontWeight: "500" },
  shopName: { fontSize: 22, fontWeight: "800", color: COLORS.text, letterSpacing: -0.4 },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
  },
  roleText: { fontSize: 10, fontWeight: "800", color: COLORS.primary, letterSpacing: 1 },
  kpiCard: {
    backgroundColor: COLORS.text,
    padding: SPACING.xl,
    borderRadius: RADIUS.lg,
    gap: 6,
  },
  kpiLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.5, color: "#94A3B8" },
  kpiAmount: {
    fontSize: 40,
    fontWeight: "900",
    color: COLORS.white,
    letterSpacing: -1,
  },
  kpiSub: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  kpiSubText: { color: "#CBD5E1", fontSize: 13 },
  newBillBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  newBillIcon: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  newBillTitle: { color: COLORS.white, fontSize: 20, fontWeight: "800" },
  newBillSub: { color: "#DBEAFE", fontSize: 13, marginTop: 2 },
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.md,
  },
  tile: {
    width: "48%",
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },
  alertsRow: { flexDirection: "row", gap: SPACING.md },
  alertCard: {
    flex: 1,
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    gap: 4,
  },
  alertCount: { fontSize: 30, fontWeight: "900", letterSpacing: -0.5 },
  alertLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: "600" },
});
