import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { listBills } from "@/src/repositories/BillingRepository";
import { api } from "@/src/api";
import { useSync } from "@/src/sync";
import { DatePicker } from "@/src/components/DatePicker";

const rupee = (n: number) =>
  `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const PAYMENT_MODES = ["cash", "upi", "card", "credit"] as const;

type Filters = {
  q: string;
  invoice_no: string;
  date_from: string;
  date_to: string;
  payment_mode: string;
  status_filter: string;
};

const EMPTY_FILTERS: Filters = {
  q: "",
  invoice_no: "",
  date_from: "",
  date_to: "",
  payment_mode: "",
  status_filter: "",
};

function hasActiveFilters(f: Filters) {
  return Object.values(f).some(Boolean);
}

export default function History() {
  const router = useRouter();
  const sync = useSync();
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);

  const load = useCallback(async (f: Filters = EMPTY_FILTERS) => {
    setLoading(true);
    try {
      if (Platform.OS === "web") {
        const params = new URLSearchParams();
        if (f.q) params.set("customer_q", f.q);
        if (f.invoice_no) params.set("invoice_no", f.invoice_no);
        if (f.date_from) params.set("date_from", f.date_from);
        if (f.date_to) params.set("date_to", f.date_to);
        if (f.payment_mode) params.set("payment_mode", f.payment_mode);
        if (f.status_filter) params.set("status_filter", f.status_filter);
        const qs = params.toString();
        const rows = await api<any[]>(`/bills${qs ? "?" + qs : ""}`);
        setBills(rows.map((b) => ({ ...b, synced: true, line_count: b.lines?.length ?? 0 })));
      } else {
        let rows = await listBills();
        // Local filtering for native
        if (f.q) {
          const lq = f.q.toLowerCase();
          rows = rows.filter((b: any) =>
            (b.customer_name || "").toLowerCase().includes(lq) ||
            (b.customer_phone || "").includes(lq)
          );
        }
        if (f.invoice_no) {
          rows = rows.filter((b: any) => (b.bill_no || "").toLowerCase().includes(f.invoice_no.toLowerCase()));
        }
        if (f.date_from) {
          rows = rows.filter((b: any) => b.created_at >= f.date_from);
        }
        if (f.date_to) {
          const end = f.date_to + "T23:59:59";
          rows = rows.filter((b: any) => b.created_at <= end);
        }
        if (f.payment_mode) {
          rows = rows.filter((b: any) => b.payment_mode === f.payment_mode);
        }
        if (f.status_filter) {
          rows = rows.filter((b: any) => b.status === f.status_filter);
        }
        setBills(rows);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(applied); }, [load, applied]));

  const applyFilters = () => {
    setApplied(filters);
    setFiltersOpen(false);
    load(filters);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setFiltersOpen(false);
    load(EMPTY_FILTERS);
  };

  const exportCSV = async () => {
    if (bills.length === 0) { Alert.alert("No data", "Apply filters to select bills to export"); return; }
    const header = "Bill No,Date,Customer,Phone,Payment Mode,Grand Total,Status";
    const rows = bills.map((b) => [
      b.bill_no ?? "",
      (b.created_at ?? "").slice(0, 10),
      (b.customer_name ?? "").replace(/,/g, " "),
      b.customer_phone ?? "",
      b.payment_mode ?? "",
      b.grand_total ?? 0,
      b.status ?? "",
    ].join(","));
    const csv = [header, ...rows].join("\n");
    await Share.share({ message: csv, title: "Bill History Export" });
  };

  const active = hasActiveFilters(applied);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="history-back">
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bill History</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {sync.pendingCount > 0 && (
            <View style={styles.syncBadge}>
              <Feather name="upload-cloud" size={14} color={COLORS.warning} />
              <Text style={styles.syncBadgeText}>{sync.pendingCount}</Text>
            </View>
          )}
          <TouchableOpacity onPress={exportCSV} style={styles.exportBtn} testID="history-export-btn">
            <Feather name="download" size={16} color={COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterBtn, active && styles.filterBtnActive]}
            onPress={() => setFiltersOpen((v) => !v)}
            testID="history-filter-btn"
          >
            <Feather name="sliders" size={16} color={active ? COLORS.white : COLORS.textSecondary} />
            {active && <Text style={styles.filterBtnText}>Filtered</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter panel */}
      {filtersOpen && (
        <View style={styles.filterPanel}>
          <TextInput
            style={styles.filterInput}
            value={filters.q}
            onChangeText={(v) => setFilters((p) => ({ ...p, q: v }))}
            placeholder="Customer name or phone"
            placeholderTextColor={COLORS.textMuted}
            testID="filter-customer"
          />
          <TextInput
            style={styles.filterInput}
            value={filters.invoice_no}
            onChangeText={(v) => setFilters((p) => ({ ...p, invoice_no: v }))}
            placeholder="Invoice number"
            placeholderTextColor={COLORS.textMuted}
            testID="filter-invoice"
          />
          <View style={styles.filterRow}>
            <DatePicker
              label="FROM"
              value={filters.date_from}
              onChange={(v) => setFilters((p) => ({ ...p, date_from: v }))}
              half
              testID="filter-date-from"
            />
            <DatePicker
              label="TO"
              value={filters.date_to}
              onChange={(v) => setFilters((p) => ({ ...p, date_to: v }))}
              half
              testID="filter-date-to"
            />
          </View>

          {/* Payment mode chips */}
          <Text style={styles.filterChipLabel}>PAYMENT</Text>
          <View style={styles.chipRow}>
            {PAYMENT_MODES.map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.chip, filters.payment_mode === m && styles.chipActive]}
                onPress={() => setFilters((p) => ({ ...p, payment_mode: p.payment_mode === m ? "" : m }))}
              >
                <Text style={[styles.chipText, filters.payment_mode === m && styles.chipTextActive]}>
                  {m.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Status chips */}
          <Text style={styles.filterChipLabel}>STATUS</Text>
          <View style={styles.chipRow}>
            {["active", "cancelled"].map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, filters.status_filter === s && styles.chipActive]}
                onPress={() => setFilters((p) => ({ ...p, status_filter: p.status_filter === s ? "" : s }))}
              >
                <Text style={[styles.chipText, filters.status_filter === s && styles.chipTextActive]}>
                  {s.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.filterActions}>
            <TouchableOpacity style={styles.clearBtn} onPress={clearFilters}>
              <Text style={styles.clearBtnText}>Clear All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyBtn} onPress={applyFilters} testID="filter-apply">
              <Text style={styles.applyBtnText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {loading && bills.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={bills}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: SPACING.lg, gap: 8, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => load(applied)} tintColor={COLORS.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="clock" size={36} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>{active ? "No results for these filters" : "No bills yet"}</Text>
              {active && (
                <TouchableOpacity onPress={clearFilters} style={styles.clearLink}>
                  <Text style={styles.clearLinkText}>Clear filters</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item }) => {
            const lineCount = item.line_count ?? 0;
            const isPending = !item.synced;
            return (
              <TouchableOpacity
                testID={`history-item-${item.id}`}
                style={[styles.card, item.status === "cancelled" && styles.cardCancelled]}
                onPress={() => router.push(`/bill/${item.id}`)}
                activeOpacity={0.85}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.billNo}>{item.bill_no}</Text>
                    {item.status === "cancelled" && (
                      <View style={styles.cancelBadge}>
                        <Text style={styles.cancelBadgeText}>CANCELLED</Text>
                      </View>
                    )}
                    {isPending && (
                      <View style={styles.pendingBadge}>
                        <Feather name="upload-cloud" size={10} color={COLORS.warning} />
                        <Text style={styles.pendingBadgeText}>PENDING</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.meta}>
                    {new Date(item.created_at).toLocaleString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "short",
                    })}
                    {" · "}
                    {item.customer_name || "Walk-in"}
                    {" · "}
                    {lineCount} item{lineCount !== 1 ? "s" : ""}
                  </Text>
                </View>
                <Text style={styles.amt}>{rupee(item.grand_total)}</Text>
              </TouchableOpacity>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  headerTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  syncBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: COLORS.warningBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  syncBadgeText: { fontSize: 11, fontWeight: "800", color: COLORS.warning },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  filterBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterBtnText: { fontSize: 12, fontWeight: "700", color: COLORS.white },
  exportBtn: {
    padding: 7,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  filterPanel: {
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  filterInput: {
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  filterRow: { flexDirection: "row", gap: SPACING.md },
  filterChipLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  chipRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  chipText: { fontSize: 11, fontWeight: "700", color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.white },
  filterActions: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.sm },
  clearBtn: {
    flex: 1,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  clearBtnText: { fontSize: 13, fontWeight: "700", color: COLORS.textSecondary },
  applyBtn: {
    flex: 2,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  applyBtnText: { fontSize: 13, fontWeight: "800", color: COLORS.white },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
  },
  cardCancelled: { opacity: 0.6 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  billNo: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  amt: { fontSize: 15, fontWeight: "900", color: COLORS.text },
  cancelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: COLORS.dangerBg,
    borderRadius: 4,
  },
  cancelBadgeText: { color: COLORS.danger, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  pendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: COLORS.warningBg,
    borderRadius: 4,
  },
  pendingBadgeText: { color: COLORS.warning, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  empty: { alignItems: "center", padding: SPACING.xxl, gap: 8 },
  emptyText: { color: COLORS.textMuted, fontSize: 14 },
  clearLink: { marginTop: 4 },
  clearLinkText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },
});
