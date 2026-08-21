import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, TextInput,
  KeyboardAvoidingView, Platform, RefreshControl,
} from "react-native";
import { PageShell } from "@/src/components/PageShell";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { alertMsg } from "@/src/dialog";
import { DatePicker } from "@/src/components/DatePicker";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) => iso ? iso.slice(0, 10) : "—";

type LedgerEntry = {
  id: string;
  type: string;
  amount: number;
  notes: string;
  bill_id?: string;
  created_at: string;
  created_by?: string;
};

type Bill = { id: string; bill_no: string; grand_total: number; payment_mode: string; created_at: string };

type Customer = {
  id: string;
  name: string;
  phone: string;
  address: string;
  credit_limit: number;
  outstanding: number;
  loyalty_points?: number;
  ledger: LedgerEntry[];
  recent_bills: Bill[];
};

export default function CustomerDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [payModal, setPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [paying, setPaying] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [billSearch, setBillSearch] = useState("");

  const load = useCallback(async (from = dateFrom, to = dateTo) => {
    setLoading(true);
    try {
      let url = `/customers/${id}`;
      const params: string[] = [];
      if (from) params.push(`date_from=${from}`);
      if (to) params.push(`date_to=${to}`);
      if (params.length) url += "?" + params.join("&");
      const data = await api<Customer>(url);
      setCustomer(data);
    } catch (e: any) {
      alertMsg("Error", e?.message || "Failed to load");
      router.back();
    } finally { setLoading(false); }
  }, [id, router, dateFrom, dateTo]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function recordPayment() {
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) { alertMsg("Invalid", "Enter a valid payment amount"); return; }
    setPaying(true);
    try {
      await api(`/customers/${id}/ledger`, {
        method: "POST",
        body: { type: "payment", amount: amt, notes: payNotes || "Payment received" },
      });
      setPayModal(false);
      setPayAmount("");
      setPayNotes("");
      load();
    } catch (e: any) {
      alertMsg("Error", e?.message || "Payment failed");
    } finally { setPaying(false); }
  }

  function applyFilter() {
    setFilterOpen(false);
    load(dateFrom, dateTo);
  }

  function clearFilter() {
    setDateFrom("");
    setDateTo("");
    setFilterOpen(false);
    load("", "");
  }

  if (loading && !customer) {
    return (
      <PageShell title="Customer" showBack scrollable={false}>
        <ActivityIndicator style={{ marginTop: 80 }} color={COLORS.primary} />
      </PageShell>
    );
  }

  if (!customer) return null;

  const typeLabel = (t: string) => {
    if (t === "payment") return "Payment received";
    if (t === "sale_credit") return "Credit sale";
    return "Adjustment";
  };
  const typeColor = (t: string) => (t === "payment" ? COLORS.success : t === "sale_credit" ? COLORS.danger : COLORS.warning);

  const filteredBills = billSearch
    ? customer.recent_bills.filter((b) =>
        b.bill_no.toLowerCase().includes(billSearch.toLowerCase()) ||
        b.payment_mode.includes(billSearch.toLowerCase())
      )
    : customer.recent_bills;

  const hasFilter = !!dateFrom || !!dateTo;

  const FilterBtn = (
    <TouchableOpacity
      onPress={() => setFilterOpen(true)}
      style={[styles.filterBtn, hasFilter && { backgroundColor: COLORS.primary }]}
    >
      <Feather name="filter" size={16} color={hasFilter ? COLORS.white : COLORS.text} />
      {hasFilter && <View style={styles.filterDot} />}
    </TouchableOpacity>
  );

  return (
    <PageShell title={customer.name} showBack scrollable={false} noPadding rightAction={FilterBtn}>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} tintColor={COLORS.primary} />}
      >
        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(customer.name?.[0] ?? "?").toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{customer.name}</Text>
            {customer.phone ? <Text style={styles.profileMeta}><Feather name="phone" size={12} /> {customer.phone}</Text> : null}
            {customer.address ? <Text style={styles.profileMeta}><Feather name="map-pin" size={12} /> {customer.address}</Text> : null}
          </View>
        </View>

        {/* Credit summary */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>OUTSTANDING</Text>
            <Text style={[styles.statValue, { color: customer.outstanding > 0 ? COLORS.danger : COLORS.success }]}>
              {rupee(customer.outstanding)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>CREDIT LIMIT</Text>
            <Text style={styles.statValue}>{rupee(customer.credit_limit)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>TOTAL BILLS</Text>
            <Text style={styles.statValue}>{customer.recent_bills.length}</Text>
          </View>
        </View>
        {(customer.loyalty_points ?? 0) > 0 && (
          <View style={styles.loyaltyCard}>
            <Feather name="star" size={16} color="#D97706" />
            <Text style={styles.loyaltyText}>
              {customer.loyalty_points} loyalty points available (worth ₹{customer.loyalty_points})
            </Text>
          </View>
        )}

        {customer.outstanding > 0 && (
          <TouchableOpacity style={styles.payBtn} onPress={() => setPayModal(true)}>
            <Feather name="check-circle" size={18} color={COLORS.white} />
            <Text style={styles.payBtnText}>Record Payment</Text>
          </TouchableOpacity>
        )}

        {/* Ledger */}
        {customer.ledger.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>LEDGER</Text>
            {customer.ledger.map((e) => (
              <View key={e.id} style={styles.ledgerRow}>
                <View style={[styles.ledgerDot, { backgroundColor: typeColor(e.type) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.ledgerType}>{typeLabel(e.type)}</Text>
                  {e.notes ? <Text style={styles.ledgerNotes}>{e.notes}</Text> : null}
                  <Text style={styles.ledgerDate}>{fmtDate(e.created_at)}</Text>
                </View>
                <Text style={[styles.ledgerAmt, { color: typeColor(e.type) }]}>
                  {e.type === "payment" ? "-" : "+"}{rupee(e.amount)}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* Bill history */}
        <View style={styles.billsHeader}>
          <Text style={styles.sectionLabel}>
            BILLS {hasFilter ? `(${filteredBills.length} filtered)` : `(${customer.recent_bills.length})`}
          </Text>
        </View>

        {/* Bill search box */}
        <View style={styles.searchBox}>
          <Feather name="search" size={15} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by bill no, payment mode…"
            placeholderTextColor={COLORS.textMuted}
            value={billSearch}
            onChangeText={setBillSearch}
          />
          {billSearch ? (
            <TouchableOpacity onPress={() => setBillSearch("")}>
              <Feather name="x" size={15} color={COLORS.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {filteredBills.length === 0 ? (
          <View style={styles.emptyBills}>
            <Feather name="file-text" size={28} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>No bills {hasFilter ? "for this date range" : "yet"}</Text>
            {hasFilter && (
              <TouchableOpacity onPress={clearFilter}>
                <Text style={{ color: COLORS.primary, fontWeight: "700", fontSize: 13 }}>Clear filter</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredBills.map((b) => (
            <TouchableOpacity
              key={b.id}
              style={styles.billRow}
              onPress={() => router.push({ pathname: "/bill/[id]", params: { id: b.id } })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.billNo}>{b.bill_no}</Text>
                <Text style={styles.billDate}>{fmtDate(b.created_at)}</Text>
              </View>
              <Text style={styles.billTotal}>{rupee(b.grand_total)}</Text>
              <View style={[styles.modeBadge, b.payment_mode === "credit" && { backgroundColor: COLORS.dangerBg }]}>
                <Text style={[styles.modeText, b.payment_mode === "credit" && { color: COLORS.danger }]}>
                  {b.payment_mode.toUpperCase()}
                </Text>
              </View>
              <Feather name="chevron-right" size={14} color={COLORS.textMuted} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Date filter modal */}
      <Modal visible={filterOpen} animationType="slide" transparent onRequestClose={() => setFilterOpen(false)}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Filter Bills</Text>
              <TouchableOpacity onPress={() => setFilterOpen(false)}>
                <Feather name="x" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: SPACING.lg, gap: SPACING.md }}>
              <DatePicker
                label="From Date"
                value={dateFrom}
                onChange={setDateFrom}
                maximumDate={dateTo || new Date().toISOString().slice(0, 10)}
              />
              <DatePicker
                label="To Date"
                value={dateTo}
                onChange={setDateTo}
                minimumDate={dateFrom}
                maximumDate={new Date().toISOString().slice(0, 10)}
              />
              <TouchableOpacity style={styles.applyBtn} onPress={applyFilter}>
                <Text style={styles.applyBtnText}>Apply Filter</Text>
              </TouchableOpacity>
              {hasFilter && (
                <TouchableOpacity style={styles.clearBtn} onPress={clearFilter}>
                  <Text style={styles.clearBtnText}>Clear Filter</Text>
                </TouchableOpacity>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Payment modal */}
      <Modal visible={payModal} animationType="slide" transparent onRequestClose={() => setPayModal(false)}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Record Payment</Text>
              <TouchableOpacity onPress={() => setPayModal(false)}>
                <Feather name="x" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: SPACING.lg, gap: SPACING.md }}>
              <Text style={styles.outstanding}>Outstanding: {rupee(customer.outstanding)}</Text>
              <TextInput
                style={styles.field}
                placeholder="Amount received (₹)"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="numeric"
                value={payAmount}
                onChangeText={setPayAmount}
              />
              <TextInput
                style={styles.field}
                placeholder="Notes (optional)"
                placeholderTextColor={COLORS.textMuted}
                value={payNotes}
                onChangeText={setPayNotes}
              />
              <TouchableOpacity
                style={[styles.payBtn, paying && { opacity: 0.6 }]}
                onPress={recordPayment}
                disabled={paying}
              >
                {paying ? <ActivityIndicator color={COLORS.white} /> : (
                  <Text style={styles.payBtnText}>Confirm Payment</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  filterBtn: { width: 34, height: 34, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  filterDot: { position: "absolute", top: 4, right: 4, width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.danger },
  scroll: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 60 },
  profileCard: { flexDirection: "row", alignItems: "center", gap: SPACING.md, backgroundColor: COLORS.white, padding: SPACING.lg, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 22, fontWeight: "800", color: COLORS.primary },
  profileName: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  profileMeta: { fontSize: 13, color: COLORS.textSecondary, marginTop: 3 },
  statsRow: { flexDirection: "row", gap: SPACING.sm },
  statCard: { flex: 1, backgroundColor: COLORS.white, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  statLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1, color: COLORS.textMuted },
  statValue: { fontSize: 16, fontWeight: "800", color: COLORS.text, marginTop: 4, textAlign: "center" },
  loyaltyCard: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF3C7", padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: "#FDE68A" },
  loyaltyText: { flex: 1, fontSize: 13, fontWeight: "700", color: "#92400E" },
  payBtn: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.success, borderRadius: RADIUS.md, paddingVertical: 14 },
  payBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 15 },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted },
  billsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, minHeight: 42 },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text },
  ledgerRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.white, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  ledgerDot: { width: 10, height: 10, borderRadius: 5 },
  ledgerType: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  ledgerNotes: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  ledgerDate: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  ledgerAmt: { fontSize: 15, fontWeight: "800" },
  billRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.white, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  billNo: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  billDate: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  billTotal: { fontSize: 15, fontWeight: "800", color: COLORS.text },
  modeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.sm, backgroundColor: COLORS.infoBg },
  modeText: { fontSize: 10, fontWeight: "800", color: COLORS.info },
  emptyBills: { alignItems: "center", padding: SPACING.xl, gap: 8 },
  emptyText: { color: COLORS.textMuted, fontSize: 14 },
  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  outstanding: { fontSize: 14, fontWeight: "600", color: COLORS.danger, textAlign: "center" },
  field: { minHeight: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, backgroundColor: COLORS.surface, fontSize: 15, color: COLORS.text },
  applyBtn: { minHeight: 52, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  applyBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 15 },
  clearBtn: { minHeight: 44, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  clearBtnText: { color: COLORS.textSecondary, fontWeight: "700", fontSize: 14 },
});
