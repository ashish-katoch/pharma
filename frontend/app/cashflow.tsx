import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, ScrollView, Platform, useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { DatePicker } from "@/src/components/DatePicker";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

const rupee = (n: number) => `₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

type DayRow = {
  date: string;
  cash_in: number;
  cash_out: number;
  net: number;
};

type CashflowResponse = {
  days: DayRow[];
  total_in: number;
  total_out: number;
  net: number;
};

const PRESETS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "Custom", days: -1 },
];

function isoOffset(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days + 1);
  return d.toISOString().slice(0, 10);
}

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

type BookMode = "all" | "cash" | "bank";
const BOOK_MODES: { id: BookMode; label: string }[] = [
  { id: "all", label: "All" },
  { id: "cash", label: "Cash Book" },
  { id: "bank", label: "Bank Book" },
];

export default function Cashflow() {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [preset, setPreset] = useState(30);
  const [dateFrom, setDateFrom] = useState(isoOffset(30));
  const [dateTo, setDateTo] = useState(today);
  const [bookMode, setBookMode] = useState<BookMode>("all");
  const [data, setData] = useState<CashflowResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      if (bookMode !== "all") params.set("mode", bookMode);
      setData(await api<CashflowResponse>(`/analytics/cashflow?${params}`));
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [dateFrom, dateTo, bookMode]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const applyPreset = (days: number) => {
    setPreset(days);
    if (days > 0) {
      setDateFrom(isoOffset(days));
      setDateTo(today);
    }
  };

  const days = data?.days ?? [];
  const maxVal = Math.max(...days.map((d) => Math.max(d.cash_in, d.cash_out)), 1);
  const activeDays = days.filter((d) => d.cash_in > 0 || d.cash_out > 0);

  return (
    <SafeAreaView style={[styles.root, isDesktop && styles.rootDesktop]} edges={["top"]}>
      <View style={isDesktop ? styles.desktopCol : { flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>
          {bookMode === "cash" ? "Cash Book" : bookMode === "bank" ? "Bank Book" : "Cash Flow"}
        </Text>
        <TouchableOpacity onPress={load} style={{ padding: 4 }}>
          <Feather name="refresh-cw" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Presets */}
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

      {/* Book mode toggle */}
      <View style={styles.bookModeRow}>
        {BOOK_MODES.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.bookChip, bookMode === m.id && styles.bookChipActive]}
            onPress={() => setBookMode(m.id)}
          >
            <Text style={[styles.bookChipText, bookMode === m.id && styles.bookChipTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {preset === -1 && (
        <View style={styles.dateRow}>
          <View style={{ flex: 1 }}>
            <DatePicker label="FROM" value={dateFrom} onChange={setDateFrom} maximumDate={dateTo} />
          </View>
          <View style={{ flex: 1 }}>
            <DatePicker label="TO" value={dateTo} onChange={setDateTo} minimumDate={dateFrom} maximumDate={today} />
          </View>
          <TouchableOpacity style={styles.applyBtn} onPress={load}>
            <Text style={styles.applyBtnText}>Apply</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Summary cards */}
          {data && (
            <View style={styles.summaryGrid}>
              <View style={[styles.summaryCard, { borderColor: "#86EFAC" }]}>
                <Feather name="arrow-down-circle" size={18} color="#16A34A" />
                <Text style={[styles.summaryVal, { color: "#16A34A" }]}>{rupee(data.total_in)}</Text>
                <Text style={styles.summaryLbl}>Cash In</Text>
              </View>
              <View style={[styles.summaryCard, { borderColor: "#FCA5A5" }]}>
                <Feather name="arrow-up-circle" size={18} color="#DC2626" />
                <Text style={[styles.summaryVal, { color: "#DC2626" }]}>{rupee(data.total_out)}</Text>
                <Text style={styles.summaryLbl}>Cash Out</Text>
              </View>
              <View style={[styles.summaryCard, { borderColor: data.net >= 0 ? "#93C5FD" : "#FCA5A5" }]}>
                <Feather name="trending-up" size={18} color={data.net >= 0 ? "#1D4ED8" : "#DC2626"} />
                <Text style={[styles.summaryVal, { color: data.net >= 0 ? "#1D4ED8" : "#DC2626" }]}>
                  {data.net < 0 ? "–" : ""}{rupee(data.net)}
                </Text>
                <Text style={styles.summaryLbl}>Net</Text>
              </View>
            </View>
          )}

          {/* Bar chart */}
          {activeDays.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>DAILY FLOW</Text>
              <View style={styles.chartCard}>
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: "#16A34A" }]} />
                    <Text style={styles.legendText}>Cash In</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: "#DC2626" }]} />
                    <Text style={styles.legendText}>Cash Out</Text>
                  </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.barChart}>
                    {days.slice(-30).map((d) => {
                      const inH = maxVal > 0 ? (d.cash_in / maxVal) * 100 : 0;
                      const outH = maxVal > 0 ? (d.cash_out / maxVal) * 100 : 0;
                      return (
                        <View key={d.date} style={styles.barGroup}>
                          <View style={styles.bars}>
                            <View style={[styles.barIn, { height: Math.max(inH, 2) }]} />
                            <View style={[styles.barOut, { height: Math.max(outH, 2) }]} />
                          </View>
                          <Text style={styles.barLabel}>{fmtDay(d.date).split(" ")[0]}</Text>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            </>
          )}

          {/* Day-by-day list */}
          <Text style={styles.sectionLabel}>BREAKDOWN</Text>
          {activeDays.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="activity" size={36} color={COLORS.border} />
              <Text style={styles.empty}>No cash movements in this period.</Text>
            </View>
          ) : (
            [...activeDays].reverse().map((d) => (
              <View key={d.date} style={styles.dayRow}>
                <View style={styles.dayDate}>
                  <Text style={styles.dayDateText}>{fmtDay(d.date)}</Text>
                </View>
                <View style={styles.dayBars}>
                  {d.cash_in > 0 && (
                    <View style={[styles.dayBar, { width: `${(d.cash_in / maxVal) * 100}%`, backgroundColor: "#DCFCE7" }]}>
                      <Text style={[styles.dayBarText, { color: "#16A34A" }]}>+{rupee(d.cash_in)}</Text>
                    </View>
                  )}
                  {d.cash_out > 0 && (
                    <View style={[styles.dayBar, { width: `${(d.cash_out / maxVal) * 100}%`, backgroundColor: "#FEE2E2" }]}>
                      <Text style={[styles.dayBarText, { color: "#DC2626" }]}>–{rupee(d.cash_out)}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.dayNet, { color: d.net >= 0 ? "#16A34A" : "#DC2626" }]}>
                  {d.net >= 0 ? "+" : "–"}{rupee(d.net)}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  rootDesktop: { backgroundColor: "#F0F2F8" },
  desktopCol: {
    flex: 1,
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    backgroundColor: COLORS.surface,
  },
  header: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    padding: SPACING.lg, backgroundColor: COLORS.white,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: COLORS.text },
  presetRow: {
    flexDirection: "row", gap: SPACING.sm, padding: SPACING.md, paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  chipText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.white },
  bookModeRow: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    padding: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.xs,
  },
  bookChip: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  bookChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  bookChipText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
  bookChipTextActive: { color: COLORS.white },
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
  scroll: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 },
  summaryGrid: { flexDirection: "row", gap: SPACING.sm },
  summaryCard: {
    flex: 1, borderRadius: RADIUS.md, borderWidth: 1,
    backgroundColor: COLORS.white, padding: SPACING.md, alignItems: "center", gap: 4,
  },
  summaryVal: { fontSize: 13, fontWeight: "900" },
  summaryLbl: { fontSize: 9, fontWeight: "800", color: COLORS.textMuted, letterSpacing: 0.5 },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: SPACING.sm },
  chartCard: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
  },
  legendRow: { flexDirection: "row", gap: SPACING.md, marginBottom: SPACING.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, fontWeight: "700", color: COLORS.textMuted },
  barChart: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 110, paddingBottom: 18 },
  barGroup: { alignItems: "center", width: 28 },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 90 },
  barIn:  { width: 10, borderRadius: 3, backgroundColor: "#86EFAC" },
  barOut: { width: 10, borderRadius: 3, backgroundColor: "#FCA5A5" },
  barLabel: { fontSize: 8, color: COLORS.textMuted, marginTop: 3 },
  emptyWrap: { alignItems: "center", marginTop: 40, gap: 12 },
  empty: { color: COLORS.textMuted, fontSize: 14 },
  dayRow: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.sm,
  },
  dayDate: { width: 52, alignItems: "center" },
  dayDateText: { fontSize: 11, fontWeight: "800", color: COLORS.text, textAlign: "center" },
  dayBars: { flex: 1, gap: 3 },
  dayBar: {
    minWidth: 4, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
    justifyContent: "center",
  },
  dayBarText: { fontSize: 10, fontWeight: "800" },
  dayNet: { fontSize: 12, fontWeight: "900", minWidth: 60, textAlign: "right" },
});
