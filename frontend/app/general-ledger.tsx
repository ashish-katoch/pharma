import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { DatePicker } from "@/src/components/DatePicker";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

const rupee = (n: number) => `₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type LedgerEntry = {
  date: string;
  type: string;
  direction: "in" | "out";
  description: string;
  amount: number;
  ref_id: string;
  payment_mode: string;
};

type LedgerResponse = {
  entries: LedgerEntry[];
  total_in: number;
  total_out: number;
  net: number;
};

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  sale:               { label: "Sale",              color: "#16A34A", icon: "shopping-cart" },
  purchase:           { label: "Purchase",          color: "#DC2626", icon: "package" },
  expense:            { label: "Expense",           color: "#D97706", icon: "coffee" },
  supplier_payment:   { label: "Supplier Payment",  color: "#7C3AED", icon: "send" },
  credit_collection:  { label: "Credit Collection", color: "#0284C7", icon: "user-check" },
};

const FILTER_CHIPS = [
  { id: "all", label: "All" },
  { id: "sale", label: "Sales" },
  { id: "purchase", label: "Purchases" },
  { id: "expense", label: "Expenses" },
  { id: "supplier_payment", label: "Supplier Payments" },
  { id: "credit_collection", label: "Collections" },
];

const PRESETS = [
  { label: "Today", days: 0 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "Custom", days: -1 },
];

function isoOffset(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export default function GeneralLedger() {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [preset, setPreset] = useState(30);
  const [dateFrom, setDateFrom] = useState(isoOffset(30));
  const [dateTo, setDateTo] = useState(today);
  const [typeFilter, setTypeFilter] = useState("all");
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      if (typeFilter !== "all") params.set("types", typeFilter);
      setData(await api<LedgerResponse>(`/ledger?${params}`));
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [dateFrom, dateTo, typeFilter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const applyPreset = (days: number) => {
    setPreset(days);
    if (days >= 0) {
      setDateFrom(isoOffset(days));
      setDateTo(today);
    }
  };

  const entries = data?.entries ?? [];

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>General Ledger</Text>
        <TouchableOpacity onPress={load} style={{ padding: 4 }}>
          <Feather name="refresh-cw" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
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

      {/* Type filter */}
      <View style={styles.typeRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTER_CHIPS}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 6 }}
          renderItem={({ item: c }) => (
            <TouchableOpacity
              style={[styles.typeChip, typeFilter === c.id && styles.typeChipActive]}
              onPress={() => setTypeFilter(c.id)}
            >
              <Text style={[styles.typeChipText, typeFilter === c.id && styles.typeChipTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e, i) => `${e.ref_id}-${i}`}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Feather name="book-open" size={40} color={COLORS.border} />
              <Text style={styles.empty}>No transactions for this period.</Text>
            </View>
          }
          ListHeaderComponent={
            data ? (
              <View style={styles.summaryGrid}>
                <View style={[styles.summaryCard, styles.summaryIn]}>
                  <Feather name="arrow-down-circle" size={16} color="#16A34A" />
                  <Text style={styles.summaryInValue}>{rupee(data.total_in)}</Text>
                  <Text style={styles.summaryLabel}>Money In</Text>
                </View>
                <View style={[styles.summaryCard, styles.summaryOut]}>
                  <Feather name="arrow-up-circle" size={16} color="#DC2626" />
                  <Text style={styles.summaryOutValue}>{rupee(data.total_out)}</Text>
                  <Text style={styles.summaryLabel}>Money Out</Text>
                </View>
                <View style={[styles.summaryCard, data.net >= 0 ? styles.summaryPos : styles.summaryNeg]}>
                  <Feather name="trending-up" size={16} color={data.net >= 0 ? "#16A34A" : "#DC2626"} />
                  <Text style={[styles.summaryNetValue, data.net < 0 && { color: "#DC2626" }]}>
                    {data.net < 0 ? "–" : ""}{rupee(data.net)}
                  </Text>
                  <Text style={styles.summaryLabel}>Net</Text>
                </View>
              </View>
            ) : null
          }
          renderItem={({ item: e }) => {
            const cfg = TYPE_CONFIG[e.type] ?? { label: e.type, color: COLORS.textMuted, icon: "circle" };
            return (
              <View style={styles.entry}>
                <View style={[styles.entryIcon, { backgroundColor: cfg.color + "20" }]}>
                  <Feather name={cfg.icon as any} size={16} color={cfg.color} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.entryDesc} numberOfLines={2}>{e.description}</Text>
                  <View style={styles.entryMeta}>
                    <Text style={styles.entryType}>{cfg.label}</Text>
                    {e.payment_mode ? <Text style={styles.entryMode}>{e.payment_mode.toUpperCase()}</Text> : null}
                    <Text style={styles.entryDate}>{fmtDate(e.date)} {fmtTime(e.date)}</Text>
                  </View>
                </View>
                <Text style={[styles.entryAmt, { color: e.direction === "in" ? "#16A34A" : "#DC2626" }]}>
                  {e.direction === "in" ? "+" : "–"}{rupee(e.amount)}
                </Text>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
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
  chip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: RADIUS.pill,
    borderWidth: 1, borderColor: COLORS.border,
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
  typeRow: {
    height: 48, justifyContent: "center",
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  typeChip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: RADIUS.pill,
    borderWidth: 1, borderColor: COLORS.border,
  },
  typeChipActive: { borderColor: COLORS.text, backgroundColor: COLORS.text },
  typeChipText: { fontSize: 11, fontWeight: "700", color: COLORS.textSecondary },
  typeChipTextActive: { color: COLORS.white },
  list: { padding: SPACING.lg, gap: 8, paddingBottom: 40 },
  emptyWrap: { alignItems: "center", marginTop: 60, gap: 12 },
  empty: { color: COLORS.textMuted, fontSize: 14 },
  summaryGrid: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.md },
  summaryCard: {
    flex: 1, borderRadius: RADIUS.md, borderWidth: 1,
    padding: SPACING.md, alignItems: "center", gap: 4,
  },
  summaryIn:  { backgroundColor: "#F0FFF4", borderColor: "#86EFAC" },
  summaryOut: { backgroundColor: "#FFF1F2", borderColor: "#FCA5A5" },
  summaryPos: { backgroundColor: "#EFF6FF", borderColor: "#93C5FD" },
  summaryNeg: { backgroundColor: "#FFF1F2", borderColor: "#FCA5A5" },
  summaryInValue:  { fontSize: 14, fontWeight: "900", color: "#16A34A" },
  summaryOutValue: { fontSize: 14, fontWeight: "900", color: "#DC2626" },
  summaryNetValue: { fontSize: 14, fontWeight: "900", color: "#1D4ED8" },
  summaryLabel: { fontSize: 9, fontWeight: "800", color: COLORS.textMuted, letterSpacing: 0.5 },
  entry: {
    flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm,
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
  },
  entryIcon: { width: 36, height: 36, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  entryDesc: { fontSize: 13, fontWeight: "700", color: COLORS.text, lineHeight: 18 },
  entryMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  entryType: { fontSize: 10, fontWeight: "800", color: COLORS.textMuted },
  entryMode: {
    fontSize: 9, fontWeight: "800", color: COLORS.primary,
    backgroundColor: COLORS.primaryLight, paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: 4,
  },
  entryDate: { fontSize: 10, color: COLORS.textMuted },
  entryAmt: { fontSize: 14, fontWeight: "900", minWidth: 72, textAlign: "right" },
});
