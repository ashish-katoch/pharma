import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator,
  TouchableOpacity, Platform, useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { DatePicker } from "@/src/components/DatePicker";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type StaffRow = {
  email: string;
  name: string;
  role: string;
  bill_count: number;
  total_sales: number;
  avg_bill: number;
};

const PRESETS = [
  { label: "Today", days: 0 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "Custom", days: -1 },
] as const;

function isoOffset(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function StaffReport() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const today = new Date().toISOString().slice(0, 10);
  const [preset, setPreset] = useState<0 | 7 | 30 | -1>(0);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      setRows(await api<StaffRow[]>(`/stats/staff-sales?${params}`));
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const applyPreset = (days: number) => {
    setPreset(days as any);
    if (days === 0) {
      setDateFrom(today);
      setDateTo(today);
    } else if (days > 0) {
      setDateFrom(isoOffset(days));
      setDateTo(today);
    }
  };

  const grandTotal = rows.reduce((s, r) => s + r.total_sales, 0);
  const grandBills = rows.reduce((s, r) => s + r.bill_count, 0);

  return (
    <SafeAreaView style={[styles.root, isDesktop && styles.rootDesktop]} edges={["top"]}>
      <View style={isDesktop ? styles.desktopCol : { flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Staff Sales Report</Text>
      </View>

      {/* Preset chips */}
      <View style={styles.presetRow}>
        {PRESETS.map((p) => (
          <TouchableOpacity
            key={p.label}
            style={[styles.chip, preset === p.days && styles.chipActive]}
            onPress={() => applyPreset(p.days)}
          >
            <Text style={[styles.chipText, preset === p.days && styles.chipTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Custom date range */}
      {preset === -1 && (
        <View style={styles.dateRow}>
          <View style={{ flex: 1 }}>
            <DatePicker label="FROM" value={dateFrom} onChange={(v) => { setDateFrom(v); }} maximumDate={dateTo} />
          </View>
          <View style={{ flex: 1 }}>
            <DatePicker label="TO" value={dateTo} onChange={(v) => { setDateTo(v); }} minimumDate={dateFrom} maximumDate={today} />
          </View>
          <TouchableOpacity style={styles.applyBtn} onPress={load}>
            <Text style={styles.applyBtnText}>Apply</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.email}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Feather name="bar-chart-2" size={40} color={COLORS.border} />
              <Text style={styles.empty}>No sales data for this period.</Text>
            </View>
          }
          ListHeaderComponent={
            rows.length > 0 ? (
              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{rupee(grandTotal)}</Text>
                  <Text style={styles.summaryLabel}>Total Sales</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{grandBills}</Text>
                  <Text style={styles.summaryLabel}>Total Bills</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{rows.length}</Text>
                  <Text style={styles.summaryLabel}>Staff Active</Text>
                </View>
              </View>
            ) : null
          }
          renderItem={({ item: r, index }) => {
            const pct = grandTotal > 0 ? (r.total_sales / grandTotal) * 100 : 0;
            return (
              <View style={styles.card}>
                <View style={styles.rank}>
                  <Text style={styles.rankNum}>#{index + 1}</Text>
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.staffName}>{r.name}</Text>
                      <Text style={styles.staffEmail}>{r.email}</Text>
                    </View>
                    <View style={[styles.roleBadge, r.role === "owner" && styles.roleBadgeOwner]}>
                      <Text style={[styles.roleText, r.role === "owner" && styles.roleTextOwner]}>{r.role.toUpperCase()}</Text>
                    </View>
                  </View>
                  <View style={styles.statsRow}>
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{rupee(r.total_sales)}</Text>
                      <Text style={styles.statLabel}>Sales</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{r.bill_count}</Text>
                      <Text style={styles.statLabel}>Bills</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{rupee(r.avg_bill)}</Text>
                      <Text style={styles.statLabel}>Avg Bill</Text>
                    </View>
                  </View>
                  {/* Share bar */}
                  <View style={styles.barBg}>
                    <View style={[styles.barFill, { width: `${pct}%` }]} />
                  </View>
                  <Text style={styles.pctText}>{pct.toFixed(1)}% of total</Text>
                </View>
              </View>
            );
          }}
        />
      )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  rootDesktop: { backgroundColor: "#F0F2F8" },
  desktopCol: {
    flex: 1,
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    backgroundColor: COLORS.surface,
  },
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    padding: SPACING.lg, backgroundColor: COLORS.white,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: COLORS.text },
  presetRow: {
    flexDirection: "row", gap: SPACING.sm, flexWrap: "wrap",
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: RADIUS.pill,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  chipText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.white },
  dateRow: {
    flexDirection: "row", alignItems: "flex-end", gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  applyBtn: {
    height: 46, paddingHorizontal: SPACING.md, borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center",
  },
  applyBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 13 },
  list: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 },
  emptyWrap: { alignItems: "center", marginTop: 60, gap: 12 },
  empty: { color: COLORS.textMuted, fontSize: 14 },
  summaryRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.md },
  summaryCard: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, alignItems: "center",
  },
  summaryValue: { fontSize: 15, fontWeight: "900", color: COLORS.text },
  summaryLabel: { fontSize: 10, fontWeight: "700", color: COLORS.textMuted, marginTop: 2 },
  card: {
    flexDirection: "row", gap: SPACING.md, backgroundColor: COLORS.white,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
  },
  rank: {
    width: 36, height: 36, borderRadius: RADIUS.sm, backgroundColor: COLORS.primaryLight,
    alignItems: "center", justifyContent: "center",
  },
  rankNum: { fontSize: 13, fontWeight: "900", color: COLORS.primary },
  cardTop: { flexDirection: "row", alignItems: "flex-start" },
  staffName: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  staffEmail: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  roleBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primaryLight,
  },
  roleBadgeOwner: { backgroundColor: "#FEF3C7" },
  roleText: { fontSize: 9, fontWeight: "800", color: COLORS.primary, letterSpacing: 1 },
  roleTextOwner: { color: "#92400E" },
  statsRow: { flexDirection: "row", gap: SPACING.sm },
  stat: { flex: 1, alignItems: "center", backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, padding: 6 },
  statValue: { fontSize: 13, fontWeight: "800", color: COLORS.text },
  statLabel: { fontSize: 9, fontWeight: "700", color: COLORS.textMuted, letterSpacing: 0.5, marginTop: 1 },
  barBg: { height: 5, borderRadius: 3, backgroundColor: COLORS.border, overflow: "hidden" },
  barFill: { height: 5, borderRadius: 3, backgroundColor: COLORS.primary },
  pctText: { fontSize: 10, color: COLORS.textMuted, fontWeight: "600" },
});
