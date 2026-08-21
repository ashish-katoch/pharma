import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, TextInput, Alert, Share,
  Platform,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { listBills } from "@/src/repositories/BillingRepository";
import { api } from "@/src/api";
import { useSync } from "@/src/sync";
import { DatePicker } from "@/src/components/DatePicker";
import { PageShell } from "@/src/components/PageShell";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { Badge } from "@/src/components/ui/Badge";

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

const EMPTY_FILTERS: Filters = { q: "", invoice_no: "", date_from: "", date_to: "", payment_mode: "", status_filter: "" };

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
        if (f.q) {
          const lq = f.q.toLowerCase();
          rows = rows.filter((b: any) => (b.customer_name || "").toLowerCase().includes(lq) || (b.customer_phone || "").includes(lq));
        }
        if (f.invoice_no) rows = rows.filter((b: any) => (b.bill_no || "").toLowerCase().includes(f.invoice_no.toLowerCase()));
        if (f.date_from) rows = rows.filter((b: any) => b.created_at >= f.date_from);
        if (f.date_to) rows = rows.filter((b: any) => b.created_at <= f.date_to + "T23:59:59");
        if (f.payment_mode) rows = rows.filter((b: any) => b.payment_mode === f.payment_mode);
        if (f.status_filter) rows = rows.filter((b: any) => b.status === f.status_filter);
        setBills(rows);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(applied); }, [load, applied]));

  const applyFilters = () => { setApplied(filters); setFiltersOpen(false); load(filters); };
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); setFiltersOpen(false); load(EMPTY_FILTERS); };

  const exportCSV = async () => {
    if (bills.length === 0) { Alert.alert("No data", "Apply filters to select bills to export"); return; }
    const header = "Bill No,Date,Customer,Phone,Payment Mode,Grand Total,Status";
    const rows = bills.map((b) => [b.bill_no ?? "", (b.created_at ?? "").slice(0, 10), (b.customer_name ?? "").replace(/,/g, " "), b.customer_phone ?? "", b.payment_mode ?? "", b.grand_total ?? 0, b.status ?? ""].join(","));
    await Share.share({ message: [header, ...rows].join("\n"), title: "Bill History Export" });
  };

  const active = hasActiveFilters(applied);

  const RightActions = (
    <View style={s.headerActions}>
      {sync.pendingCount > 0 && (
        <Badge label={String(sync.pendingCount)} tone="warning" dot />
      )}
      <TouchableOpacity onPress={exportCSV} style={s.iconAction} testID="history-export-btn">
        <Feather name="download" size={16} color={COLORS.textSecondary} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.filterBtn, active && s.filterBtnActive]}
        onPress={() => setFiltersOpen((v) => !v)}
        testID="history-filter-btn"
      >
        <Feather name="sliders" size={15} color={active ? COLORS.white : COLORS.textSecondary} />
        {active && <Text style={s.filterBtnText}>On</Text>}
      </TouchableOpacity>
    </View>
  );

  return (
    <PageShell title="Bill History" rightAction={RightActions} scrollable={false} noPadding>
      {/* Filter panel */}
      {filtersOpen && (
        <View style={s.filterPanel}>
          <TextInput style={s.filterInput} value={filters.q} onChangeText={(v) => setFilters((p) => ({ ...p, q: v }))} placeholder="Customer name or phone" placeholderTextColor={COLORS.textMuted} testID="filter-customer" />
          <TextInput style={s.filterInput} value={filters.invoice_no} onChangeText={(v) => setFilters((p) => ({ ...p, invoice_no: v }))} placeholder="Invoice number" placeholderTextColor={COLORS.textMuted} testID="filter-invoice" />
          <View style={s.filterRow}>
            <DatePicker label="FROM" value={filters.date_from} onChange={(v) => setFilters((p) => ({ ...p, date_from: v }))} half testID="filter-date-from" />
            <DatePicker label="TO" value={filters.date_to} onChange={(v) => setFilters((p) => ({ ...p, date_to: v }))} half testID="filter-date-to" />
          </View>
          <Text style={s.filterChipLabel}>PAYMENT</Text>
          <View style={s.chipRow}>
            {PAYMENT_MODES.map((m) => (
              <TouchableOpacity key={m} style={[s.chip, filters.payment_mode === m && s.chipActive]} onPress={() => setFilters((p) => ({ ...p, payment_mode: p.payment_mode === m ? "" : m }))}>
                <Text style={[s.chipText, filters.payment_mode === m && s.chipTextActive]}>{m.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.filterChipLabel}>STATUS</Text>
          <View style={s.chipRow}>
            {["active", "cancelled"].map((st) => (
              <TouchableOpacity key={st} style={[s.chip, filters.status_filter === st && s.chipActive]} onPress={() => setFilters((p) => ({ ...p, status_filter: p.status_filter === st ? "" : st }))}>
                <Text style={[s.chipText, filters.status_filter === st && s.chipTextActive]}>{st.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={s.filterActions}>
            <TouchableOpacity style={s.clearBtn} onPress={clearFilters}>
              <Text style={s.clearBtnText}>Clear All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.applyBtn} onPress={applyFilters} testID="filter-apply">
              <Text style={s.applyBtnText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {loading && bills.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={bills}
          keyExtractor={(b) => b.id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(applied)} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            active ? (
              <EmptyState
                icon="search"
                title="No results"
                subtitle="No bills match the current filters."
                action={
                  <TouchableOpacity onPress={clearFilters} style={s.clearLink}>
                    <Text style={s.clearLinkText}>Clear filters</Text>
                  </TouchableOpacity>
                }
              />
            ) : (
              <EmptyState icon="clock" title="No bills yet" subtitle="Bills you create will appear here." />
            )
          }
          renderItem={({ item }) => {
            const lineCount = item.line_count ?? 0;
            const isPending = !item.synced;
            const isCancelled = item.status === "cancelled";
            return (
              <TouchableOpacity
                testID={`history-item-${item.id}`}
                style={[s.card, isCancelled && s.cardCancelled]}
                onPress={() => router.push(`/bill/${item.id}`)}
                activeOpacity={0.85}
              >
                <View style={{ flex: 1 }}>
                  <View style={s.rowTop}>
                    <Text style={s.billNo}>{item.bill_no}</Text>
                    <View style={s.badges}>
                      {isCancelled && <Badge label="CANCELLED" tone="danger" />}
                      {isPending && <Badge label="PENDING SYNC" tone="warning" dot />}
                    </View>
                  </View>
                  <Text style={s.meta}>
                    {new Date(item.created_at).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                    {"  ·  "}{item.customer_name || "Walk-in"}
                    {"  ·  "}{lineCount} item{lineCount !== 1 ? "s" : ""}
                  </Text>
                </View>
                <Text style={[s.amt, isCancelled && { color: COLORS.textMuted }]}>
                  {rupee(item.grand_total)}
                </Text>
                <Feather name="chevron-right" size={16} color={COLORS.border} />
              </TouchableOpacity>
            );
          }}
        />
      )}
    </PageShell>
  );
}

const s = StyleSheet.create({
  headerActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  iconAction: { width: 34, height: 34, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  filterBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  filterBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterBtnText: { fontSize: 11, fontWeight: "700", color: COLORS.white },
  // Filter panel
  filterPanel: { backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border, padding: SPACING.lg, gap: SPACING.sm },
  filterInput: { height: 44, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.surface },
  filterRow: { flexDirection: "row", gap: SPACING.md },
  filterChipLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1, color: COLORS.textMuted, marginTop: 4 },
  chipRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  chipText: { fontSize: 11, fontWeight: "600", color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.white },
  filterActions: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.sm },
  clearBtn: { flex: 1, height: 42, alignItems: "center", justifyContent: "center", borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  clearBtnText: { fontSize: 13, fontWeight: "600", color: COLORS.textSecondary },
  applyBtn: { flex: 2, height: 42, alignItems: "center", justifyContent: "center", borderRadius: RADIUS.md, backgroundColor: COLORS.primary },
  applyBtnText: { fontSize: 13, fontWeight: "700", color: COLORS.white },
  // List
  list: { padding: SPACING.lg, gap: 8, paddingBottom: 100 },
  card: { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, gap: 12 },
  cardCancelled: { opacity: 0.55 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  badges: { flexDirection: "row", gap: 4 },
  billNo: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  amt: { fontSize: 15, fontWeight: "800", color: COLORS.text },
  clearLink: { marginTop: 8 },
  clearLinkText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },
});
