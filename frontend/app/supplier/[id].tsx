import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { alertMsg } from "@/src/dialog";
import { useAuth } from "@/src/auth";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

type Purchase = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  total_amount: number;
  paid_amount: number;
  payment_mode: string;
  created_at: string;
  status?: string;
};

type Payment = {
  id: string;
  amount: number;
  notes: string;
  payment_mode: string;
  created_at: string;
};

type Supplier = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  dl_no: string;
  credit_limit: number;
  purchases: Purchase[];
  payments: Payment[];
  total_purchases: number;
  total_paid: number;
  outstanding: number;
};

const PAY_MODES = ["cash", "upi", "neft", "card"];

const MODE_COLOR: Record<string, { bg: string; fg: string }> = {
  cash: { bg: "#DCFCE7", fg: "#16A34A" },
  upi: { bg: "#EDE9FE", fg: "#7C3AED" },
  neft: { bg: "#DBEAFE", fg: "#2563EB" },
  card: { bg: "#DBEAFE", fg: "#2563EB" },
  credit: { bg: "#FEF3C7", fg: "#D97706" },
};

type LedgerRow =
  | { kind: "purchase"; date: string; data: Purchase }
  | { kind: "payment"; date: string; data: Payment };

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  received:  { label: "Received",  bg: "#DCFCE7", fg: "#16A34A" },
  pending:   { label: "Pending",   bg: "#FEF3C7", fg: "#D97706" },
  cancelled: { label: "Cancelled", bg: "#FEE2E2", fg: "#DC2626" },
};

export default function SupplierDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [payModal, setPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [payMode, setPayMode] = useState("cash");
  const [paying, setPaying] = useState(false);
  const [tab, setTab] = useState<"ledger" | "purchases">("ledger");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Supplier>(`/suppliers/${id}`);
      setSupplier(data);
    } catch (e: any) {
      alertMsg("Error", e?.message || "Failed to load");
      router.back();
    } finally { setLoading(false); }
  }, [id, router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function recordPayment() {
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) { alertMsg("Invalid", "Enter a valid amount"); return; }
    setPaying(true);
    try {
      await api(`/suppliers/${id}/payments`, {
        method: "POST",
        body: { amount: amt, notes: payNotes || "Payment to supplier", payment_mode: payMode },
      });
      setPayModal(false);
      setPayAmount("");
      setPayNotes("");
      load();
    } catch (e: any) {
      alertMsg("Error", e?.message || "Payment failed");
    } finally { setPaying(false); }
  }

  if (loading && !supplier) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <Feather name="arrow-left" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Supplier</Text>
          <View style={{ width: 30 }} />
        </View>
        <ActivityIndicator style={{ marginTop: 60 }} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!supplier) return null;

  const ledgerRows: LedgerRow[] = [
    ...supplier.purchases.map((p) => ({ kind: "purchase" as const, date: p.invoice_date || p.created_at, data: p })),
    ...supplier.payments.map((p) => ({ kind: "payment" as const, date: p.created_at, data: p })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  let running = supplier.outstanding;
  const ledgerWithBalance = ledgerRows.map((row) => {
    const prev = running;
    if (row.kind === "purchase") {
      running = Math.round((running - (row.data as Purchase).total_amount) * 100) / 100;
    } else {
      running = Math.round((running + (row.data as Payment).amount) * 100) / 100;
    }
    return { ...row, balance: prev };
  });

  return (
    <SafeAreaView style={[styles.root, isDesktop && styles.rootDesktop]} edges={["top"]}>
      <View style={isDesktop ? styles.desktopCol : { flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{supplier.name}</Text>
        <TouchableOpacity onPress={() => router.push("/purchase-new")} style={styles.addBtn}>
          <Feather name="plus" size={16} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.primary} />}
      >
        {/* Info card */}
        <View style={styles.infoCard}>
          <View style={styles.avatarLg}>
            <Feather name="truck" size={28} color={COLORS.primary} />
          </View>
          <Text style={styles.supplierName}>{supplier.name}</Text>
          {supplier.phone ? (
            <View style={styles.infoRow}><Feather name="phone" size={14} color={COLORS.textMuted} /><Text style={styles.infoText}>{supplier.phone}</Text></View>
          ) : null}
          {supplier.email ? (
            <View style={styles.infoRow}><Feather name="mail" size={14} color={COLORS.textMuted} /><Text style={styles.infoText}>{supplier.email}</Text></View>
          ) : null}
          {supplier.address ? (
            <View style={styles.infoRow}><Feather name="map-pin" size={14} color={COLORS.textMuted} /><Text style={styles.infoText}>{supplier.address}</Text></View>
          ) : null}
          <View style={styles.tagRow}>
            {supplier.gstin ? <View style={styles.tag}><Text style={styles.tagText}>GSTIN {supplier.gstin}</Text></View> : null}
            {supplier.dl_no ? <View style={styles.tag}><Text style={styles.tagText}>DL {supplier.dl_no}</Text></View> : null}
            {supplier.credit_limit > 0 ? <View style={[styles.tag, { borderColor: COLORS.primary }]}><Text style={[styles.tagText, { color: COLORS.primary }]}>Limit {rupee(supplier.credit_limit)}</Text></View> : null}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>TOTAL PURCHASE</Text>
            <Text style={styles.statValue}>{rupee(supplier.total_purchases)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>PAID</Text>
            <Text style={[styles.statValue, { color: COLORS.success }]}>{rupee(supplier.total_paid)}</Text>
          </View>
          <View style={[styles.statCard, supplier.outstanding > 0 && { borderColor: COLORS.warning }]}>
            <Text style={[styles.statLabel, supplier.outstanding > 0 && { color: COLORS.warning }]}>OUTSTANDING</Text>
            <Text style={[styles.statValue, supplier.outstanding > 0 && { color: COLORS.warning }]}>{rupee(supplier.outstanding)}</Text>
          </View>
        </View>

        {supplier.outstanding > 0 && (
          <TouchableOpacity style={styles.payBtn} onPress={() => setPayModal(true)}>
            <Feather name="send" size={16} color={COLORS.white} />
            <Text style={styles.payBtnText}>Record Payment to Supplier</Text>
          </TouchableOpacity>
        )}

        {/* Tab switcher */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === "ledger" && styles.tabBtnActive]}
            onPress={() => setTab("ledger")}
          >
            <Text style={[styles.tabText, tab === "ledger" && styles.tabTextActive]}>Ledger</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === "purchases" && styles.tabBtnActive]}
            onPress={() => setTab("purchases")}
          >
            <Text style={[styles.tabText, tab === "purchases" && styles.tabTextActive]}>Purchases ({supplier.purchases.length})</Text>
          </TouchableOpacity>
        </View>

        {tab === "ledger" && (
          ledgerWithBalance.length === 0 ? (
            <View style={styles.empty}><Feather name="book-open" size={32} color={COLORS.textMuted} /><Text style={styles.emptyText}>No transactions yet</Text></View>
          ) : (
            ledgerWithBalance.map((row, i) => {
              const isPurchase = row.kind === "purchase";
              const p = row.data as Purchase;
              const pay = row.data as Payment;
              return (
                <View key={isPurchase ? p.id : pay.id} style={styles.ledgerRow}>
                  <View style={[styles.ledgerIcon, { backgroundColor: isPurchase ? COLORS.dangerBg : COLORS.successBg }]}>
                    <Feather name={isPurchase ? "shopping-bag" : "check"} size={14} color={isPurchase ? COLORS.danger : COLORS.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ledgerTitle}>
                      {isPurchase ? (p.invoice_no || "Purchase") : (pay.notes || "Payment made")}
                    </Text>
                    <Text style={styles.ledgerDate}>{fmtDate(row.date)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.ledgerAmt, { color: isPurchase ? COLORS.danger : COLORS.success }]}>
                      {isPurchase ? "+" : "-"}{rupee(isPurchase ? p.total_amount : pay.amount)}
                    </Text>
                    <Text style={styles.ledgerBalance}>Bal {rupee(row.balance)}</Text>
                  </View>
                </View>
              );
            })
          )
        )}

        {tab === "purchases" && (() => {
          const filtered = supplier.purchases.filter((p) =>
            statusFilter === "all" ? true : (p.status ?? "received") === statusFilter
          );
          const markReceived = async (purchaseId: string) => {
            try {
              await api(`/purchases/${purchaseId}/status?status=received`, { method: "PUT" });
              setSupplier((prev) => prev ? {
                ...prev,
                purchases: prev.purchases.map((p) => p.id === purchaseId ? { ...p, status: "received" } : p),
              } : prev);
            } catch (e: any) { alertMsg("Error", e?.message || "Failed to update"); }
          };
          return (
            <>
              {/* Status filter chips */}
              <View style={styles.statusFilterRow}>
                {["all", "pending", "received", "cancelled"].map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
                    onPress={() => setStatusFilter(s)}
                  >
                    <Text style={[styles.filterChipText, statusFilter === s && styles.filterChipTextActive]}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {filtered.length === 0 ? (
                <View style={styles.empty}><Feather name="shopping-bag" size={32} color={COLORS.textMuted} /><Text style={styles.emptyText}>No purchases</Text></View>
              ) : (
                filtered.map((p) => {
                  const modeStyle = MODE_COLOR[p.payment_mode] ?? { bg: COLORS.surface, fg: COLORS.textSecondary };
                  const unpaid = Math.max(0, (p.total_amount || 0) - (p.paid_amount || 0));
                  const pStatus = p.status ?? "received";
                  const statusMeta = STATUS_META[pStatus] ?? STATUS_META.received;
                  return (
                    <View key={p.id} style={styles.purchaseCard}>
                      <View style={styles.purchaseTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.invoiceNo}>{p.invoice_no || "No invoice no."}</Text>
                          <Text style={styles.purchaseDate}>{fmtDate(p.invoice_date || p.created_at)}</Text>
                        </View>
                        <View style={{ alignItems: "flex-end", gap: 4 }}>
                          <Text style={styles.purchaseTotal}>{rupee(p.total_amount)}</Text>
                          <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
                            <Text style={[styles.statusBadgeText, { color: statusMeta.fg }]}>{statusMeta.label}</Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.purchaseMeta}>
                        <View style={[styles.modeBadge, { backgroundColor: modeStyle.bg }]}>
                          <Text style={[styles.modeBadgeText, { color: modeStyle.fg }]}>{(p.payment_mode || "").toUpperCase()}</Text>
                        </View>
                        {unpaid > 0 ? (
                          <Text style={styles.unpaidText}>Unpaid {rupee(unpaid)}</Text>
                        ) : (
                          <View style={styles.paidBadge}>
                            <Feather name="check" size={10} color={COLORS.success} />
                            <Text style={styles.paidText}>Paid</Text>
                          </View>
                        )}
                        {isOwner && pStatus === "pending" && (
                          <TouchableOpacity style={styles.markReceivedBtn} onPress={() => markReceived(p.id)}>
                            <Feather name="check-circle" size={12} color={COLORS.white} />
                            <Text style={styles.markReceivedText}>Mark Received</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </>
          );
        })()}
      </ScrollView>

      {/* Record payment modal */}
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
              <Text style={styles.outstandingText}>Outstanding: {rupee(supplier.outstanding)}</Text>
              <TextInput
                style={styles.field}
                placeholder="Amount paid (₹)"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="numeric"
                value={payAmount}
                onChangeText={setPayAmount}
              />
              <Text style={styles.modeLabel}>Payment Mode</Text>
              <View style={styles.modeRow}>
                {PAY_MODES.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.modeChip, payMode === m && styles.modeChipActive]}
                    onPress={() => setPayMode(m)}
                  >
                    <Text style={[styles.modeChipText, payMode === m && styles.modeChipTextActive]}>
                      {m.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
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
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.lg, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: COLORS.text },
  addBtn: { width: 32, height: 32, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  scroll: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 60 },
  infoCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, alignItems: "center", gap: 6 },
  avatarLg: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  supplierName: { fontSize: 20, fontWeight: "800", color: COLORS.text, letterSpacing: -0.3, textAlign: "center" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  infoText: { fontSize: 13, color: COLORS.textSecondary },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 4 },
  tag: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontSize: 11, fontWeight: "700", color: COLORS.textSecondary },
  statsRow: { flexDirection: "row", gap: SPACING.sm },
  statCard: { flex: 1, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, alignItems: "center" },
  statLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1, color: COLORS.textMuted },
  statValue: { fontSize: 13, fontWeight: "800", color: COLORS.text, marginTop: 4, textAlign: "center" },
  payBtn: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 14 },
  payBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 14 },
  tabRow: { flexDirection: "row", gap: 0, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: 3 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: RADIUS.sm },
  tabBtnActive: { backgroundColor: COLORS.white },
  tabText: { fontSize: 13, fontWeight: "600", color: COLORS.textMuted },
  tabTextActive: { color: COLORS.text, fontWeight: "800" },
  ledgerRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.white, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  ledgerIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  ledgerTitle: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  ledgerDate: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  ledgerAmt: { fontSize: 14, fontWeight: "800" },
  ledgerBalance: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  purchaseCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, gap: 8 },
  purchaseTop: { flexDirection: "row", alignItems: "flex-start" },
  invoiceNo: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  purchaseDate: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  purchaseTotal: { fontSize: 16, fontWeight: "900", color: COLORS.primary },
  purchaseMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  modeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill },
  modeBadgeText: { fontSize: 10, fontWeight: "800" },
  unpaidText: { fontSize: 12, fontWeight: "700", color: COLORS.warning },
  paidBadge: { flexDirection: "row", alignItems: "center", gap: 3 },
  paidText: { fontSize: 12, fontWeight: "700", color: COLORS.success },
  empty: { alignItems: "center", padding: SPACING.xxl, gap: 8 },
  emptyText: { color: COLORS.textMuted, fontSize: 14 },
  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  outstandingText: { fontSize: 14, fontWeight: "600", color: COLORS.danger, textAlign: "center" },
  field: { minHeight: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, backgroundColor: COLORS.surface, fontSize: 15, color: COLORS.text },
  modeLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.textSecondary },
  modeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  modeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  modeChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  modeChipText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
  modeChipTextActive: { color: COLORS.white },
  statusFilterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  filterChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
  filterChipTextActive: { color: COLORS.white },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.pill },
  statusBadgeText: { fontSize: 10, fontWeight: "800" },
  markReceivedBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: COLORS.success, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.md, marginLeft: "auto" },
  markReceivedText: { fontSize: 11, fontWeight: "700", color: COLORS.white },
});
