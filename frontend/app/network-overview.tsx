import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";

type TodayStats = { total_sales?: number };

export default function NetworkOverview() {
  const [sales, setSales] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const stats = await api<TodayStats>("/stats/today");
      setSales(typeof stats?.total_sales === "number" ? stats.total_sales : 0);
    } catch {
      setSales(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const salesLabel =
    loading ? "…" : sales === null ? "—" : `₹${sales.toLocaleString("en-IN")}`;

  return (
    <PageShell title="Network Overview">
      <Text style={s.sectionLabel}>FLEET</Text>
      <View style={s.kpiRow}>
        <View style={s.kpiCard}>
          <Feather name="home" size={18} color={COLORS.primary} />
          <Text style={s.kpiValue}>1</Text>
          <Text style={s.kpiLabel}>STORES</Text>
        </View>
        <View style={s.kpiCard}>
          <Feather name="wifi" size={18} color={COLORS.success} />
          <Text style={s.kpiValue}>1</Text>
          <Text style={s.kpiLabel}>ONLINE</Text>
        </View>
      </View>
      <View style={s.kpiRow}>
        <View style={s.kpiCard}>
          <Feather name="trending-up" size={18} color={COLORS.primary} />
          {loading ? (
            <ActivityIndicator color={COLORS.primary} style={{ height: 24 }} />
          ) : (
            <Text style={s.kpiValue}>{salesLabel}</Text>
          )}
          <Text style={s.kpiLabel}>SALES TODAY</Text>
        </View>
        <View style={s.kpiCard}>
          <Feather name="check-circle" size={18} color={COLORS.success} />
          <Text style={[s.kpiValue, { fontSize: 15 }]}>Up to date</Text>
          <Text style={s.kpiLabel}>SYNC STATUS</Text>
        </View>
      </View>

      <Text style={s.sectionLabel}>STORES</Text>
      <View style={s.row}>
        <View style={s.iconWrap}>
          <Feather name="home" size={18} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle}>Main Store</Text>
          <Text style={s.rowSub}>Primary location</Text>
        </View>
        <View style={s.onlineBadge}>
          <View style={s.dot} />
          <Text style={s.onlineText}>Online</Text>
        </View>
      </View>

      <View style={s.note}>
        <Feather name="info" size={14} color={COLORS.textMuted} />
        <Text style={s.noteText}>
          Multi-store sync keeps inventory and sales consolidated across all your
          locations. Add a branch to see it here.
        </Text>
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
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },
  iconWrap: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  onlineBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.pill, backgroundColor: COLORS.successBg },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.success },
  onlineText: { fontSize: 12, fontWeight: "700", color: COLORS.successDark },
  note: { flexDirection: "row", gap: 8, padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, marginTop: SPACING.sm },
  noteText: { flex: 1, fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
});
