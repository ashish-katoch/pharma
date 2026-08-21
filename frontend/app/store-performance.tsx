import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";

type Today = {
  sales_total: number;
  bill_count: number;
  profit_today: number;
  low_stock_count: number;
};

type MonthSales = {
  total_revenue: number;
  bill_count: number;
};

const rupee = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function StorePerformance() {
  const [today, setToday] = useState<Today | null>(null);
  const [month, setMonth] = useState<MonthSales | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, m] = await Promise.all([
        api<Today>("/stats/today"),
        api<MonthSales>(`/analytics/sales?month=${currentMonth()}`),
      ]);
      setToday(t);
      setMonth(m);
    } catch {
      /* ignore — show empty state */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <PageShell title="Store Performance">
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      </PageShell>
    );
  }

  if (!today && !month) {
    return (
      <PageShell title="Store Performance">
        <View style={s.empty}>
          <Feather name="bar-chart-2" size={40} color={COLORS.textMuted} />
          <Text style={s.emptyText}>Performance data unavailable.{"\n"}Pull back in once you record sales.</Text>
        </View>
      </PageShell>
    );
  }

  return (
    <PageShell title="Store Performance">
      <Text style={s.sectionLabel}>TODAY</Text>
      <View style={s.kpiRow}>
        <View style={s.kpiCard}>
          <Feather name="trending-up" size={18} color={COLORS.success} />
          <Text style={s.kpiValue}>{rupee(today?.sales_total ?? 0)}</Text>
          <Text style={s.kpiLabel}>SALES</Text>
        </View>
        <View style={s.kpiCard}>
          <Feather name="file-text" size={18} color={COLORS.primary} />
          <Text style={s.kpiValue}>{(today?.bill_count ?? 0).toLocaleString("en-IN")}</Text>
          <Text style={s.kpiLabel}>BILLS</Text>
        </View>
      </View>
      <View style={s.kpiRow}>
        <View style={s.kpiCard}>
          <Feather name="dollar-sign" size={18} color={COLORS.successDark} />
          <Text style={s.kpiValue}>{rupee(today?.profit_today ?? 0)}</Text>
          <Text style={s.kpiLabel}>PROFIT</Text>
        </View>
        <View style={s.kpiCard}>
          <Feather name="alert-triangle" size={18} color={COLORS.warning} />
          <Text style={s.kpiValue}>{(today?.low_stock_count ?? 0).toLocaleString("en-IN")}</Text>
          <Text style={s.kpiLabel}>LOW STOCK</Text>
        </View>
      </View>

      <Text style={s.sectionLabel}>THIS MONTH</Text>
      <View style={s.monthCard}>
        <View style={s.monthRow}>
          <View style={s.monthIcon}>
            <Feather name="calendar" size={18} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.monthLabel}>Revenue</Text>
            <Text style={s.monthValue}>{rupee(month?.total_revenue ?? 0)}</Text>
          </View>
        </View>
        <View style={s.divider} />
        <View style={s.monthRow}>
          <View style={s.monthIcon}>
            <Feather name="shopping-bag" size={18} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.monthLabel}>Bills This Month</Text>
            <Text style={s.monthValue}>{(month?.bill_count ?? 0).toLocaleString("en-IN")}</Text>
          </View>
        </View>
      </View>
    </PageShell>
  );
}

const s = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: SPACING.sm, marginBottom: SPACING.xs },
  kpiRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.sm },
  kpiCard: { flex: 1, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, alignItems: "center", gap: 4 },
  kpiValue: { fontSize: 20, fontWeight: "900", color: COLORS.text, letterSpacing: -0.5 },
  kpiLabel: { fontSize: 10, fontWeight: "700", color: COLORS.textMuted, letterSpacing: 0.5, textAlign: "center" },
  monthCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, gap: SPACING.md },
  monthRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  monthIcon: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  monthLabel: { fontSize: 12, fontWeight: "600", color: COLORS.textMuted },
  monthValue: { fontSize: 20, fontWeight: "900", color: COLORS.text, letterSpacing: -0.5, marginTop: 2 },
  divider: { height: 1, backgroundColor: COLORS.border },
  empty: { alignItems: "center", justifyContent: "center", padding: 48, gap: 10 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontWeight: "600", textAlign: "center" },
});
