import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { useCart, Medicine } from "@/src/cart";
import { confirmDestructive } from "@/src/confirm";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { searchMedicines } from "@/src/catalog";
import { useSync } from "@/src/sync";
import { buildReceiptText, sendOnWhatsApp } from "@/src/whatsapp";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function Billing() {
  const router = useRouter();
  const cart = useCart();
  const sync = useSync();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Medicine[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [saving, setSaving] = useState(false);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const { items, source } = await searchMedicines(q);
      setResults(items);
      setOffline(source === "cache");
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 250);
    return () => clearTimeout(t);
  }, [query, search]);

  const totals = useMemo(() => {
    let gross = 0;
    let discount = 0;
    for (const l of cart.lines) {
      const g = l.quantity * l.medicine.mrp;
      const d = g * (l.discount_pct / 100);
      gross += g;
      discount += d;
    }
    const afterLine = gross - discount;
    const billDisc = afterLine * (cart.billDiscountPct / 100);
    const total = afterLine - billDisc;
    return {
      gross,
      discount: discount + billDisc,
      total,
      items: cart.lines.reduce((a, l) => a + l.quantity, 0),
    };
  }, [cart.lines, cart.billDiscountPct]);

  const saveBill = async () => {
    if (cart.lines.length === 0) return;
    setSaving(true);
    try {
      const payload = {
        lines: cart.lines.map((l) => ({
          medicine_id: l.medicine.id,
          quantity: l.quantity,
          discount_pct: l.discount_pct,
        })),
        customer_name: cart.customerName,
        customer_phone: cart.customerPhone,
        bill_discount_pct: cart.billDiscountPct,
        payment_mode: cart.paymentMode,
      };

      if (!sync.online) {
        // Offline path: queue and show the outbox confirmation.
        const entry = await sync.queueBill(payload, {
          itemsCount: totals.items,
          total: totals.total,
        });
        cart.clear();
        setShowCheckout(false);
        setQuery("");
        Alert.alert(
          "Saved offline",
          `Bill ${entry.localBillNo} (${rupee(totals.total)}) is queued and will be sent when you're back online.`,
          [{ text: "OK" }],
        );
        return;
      }

      // Online path: send now.
      const bill = await api<{ id: string; bill_no: string } & Record<string, any>>(
        "/bills",
        { method: "POST", body: payload },
      );

      // WhatsApp share if customer phone was entered.
      if (cart.customerPhone) {
        const shopRes = await api<{ name: string; phone?: string }>("/shop").catch(() => ({ name: "Pharma Counter" }));
        const text = buildReceiptText(
          {
            bill_no: bill.bill_no,
            grand_total: bill.grand_total ?? totals.total,
            created_at: bill.created_at ?? new Date().toISOString(),
            lines: bill.lines ?? cart.lines.map((l) => ({
              medicine_name: l.medicine.name,
              quantity: l.quantity,
              line_total: l.quantity * l.medicine.mrp * (1 - l.discount_pct / 100),
            })),
            payment_mode: bill.payment_mode ?? cart.paymentMode,
          },
          shopRes,
        );
        // Non-blocking — don't await so the bill screens loads immediately.
        sendOnWhatsApp(cart.customerPhone, text).catch(() => {});
      }

      cart.clear();
      setShowCheckout(false);
      setQuery("");
      router.push(`/bill/${bill.id}`);
    } catch (e: any) {
      Alert.alert("Bill failed", e?.message || "Unable to save bill");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        {/* header */}
        <View style={styles.header}>
          <Text style={styles.title}>New Bill</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.md }}>
            {/* Offline outbox badge */}
            {(sync.pendingCount > 0 || !sync.online) && (
              <TouchableOpacity
                onPress={() => router.push("/outbox")}
                style={[styles.offlinePill, !sync.online && { backgroundColor: COLORS.dangerBg }]}
                testID="billing-outbox-badge"
              >
                <Feather
                  name={sync.online ? "upload-cloud" : "wifi-off"}
                  size={14}
                  color={sync.online ? COLORS.warning : COLORS.danger}
                />
                {sync.pendingCount > 0 && (
                  <Text style={[styles.offlinePillText, !sync.online && { color: COLORS.danger }]}>
                    {sync.pendingCount}
                  </Text>
                )}
              </TouchableOpacity>
            )}
            {/* Scan button */}
            <TouchableOpacity
              testID="billing-scan-button"
              onPress={() => router.push("/scan")}
              style={styles.scanBtn}
            >
              <Feather name="camera" size={20} color={COLORS.white} />
            </TouchableOpacity>
            {cart.lines.length > 0 && (
              <TouchableOpacity
                testID="billing-clear-cart"
                onPress={() =>
                  confirmDestructive("Clear cart?", "This will remove all items.", "Clear", () => cart.clear())
                }
              >
                <Feather name="trash-2" size={20} color={COLORS.danger} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* offline search notice */}
        {offline && (
          <View style={styles.offlineBanner}>
            <Feather name="wifi-off" size={13} color={COLORS.warning} />
            <Text style={styles.offlineBannerText}>Showing cached results (offline)</Text>
          </View>
        )}

        {/* search */}
        <View style={styles.searchBox}>
          <Feather name="search" size={20} color={COLORS.textMuted} />
          <TextInput
            testID="billing-search-input"
            style={styles.searchInput}
            placeholder="Search medicine, brand or generic…"
            placeholderTextColor={COLORS.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")} testID="billing-search-clear">
              <Feather name="x" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={{ flex: 1, flexDirection: "row" }}>
          {/* results */}
          <View style={styles.resultsPane}>
            {loading ? (
              <ActivityIndicator style={{ marginTop: 20 }} color={COLORS.primary} />
            ) : (
              <FlatList
                data={results}
                keyExtractor={(m) => m.id}
                contentContainerStyle={{ paddingBottom: 12 }}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Feather name="search" size={32} color={COLORS.textMuted} />
                    <Text style={styles.emptyText}>No matches</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    testID={`billing-result-${item.id}`}
                    style={styles.resultCard}
                    onPress={() => {
                      if (item.total_stock <= 0) {
                        Alert.alert("Out of stock", `${item.name} has no stock.`);
                        return;
                      }
                      cart.add(item);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.resMeta} numberOfLines={1}>
                        {item.brand ? `${item.brand} · ` : ""}
                        {item.pack || ""}
                      </Text>
                      <View style={styles.resTagRow}>
                        <Text style={[styles.stockTag, item.total_stock <= item.reorder_level && styles.stockTagLow]}>
                          Stock: {item.total_stock}
                        </Text>
                        <Text style={styles.mrpTag}>{rupee(item.mrp)}</Text>
                      </View>
                    </View>
                    <View style={styles.addBtn}>
                      <Feather name="plus" size={20} color={COLORS.white} />
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>

        {/* cart list */}
        {cart.lines.length > 0 && (
          <View style={styles.cartWrap}>
            <View style={styles.cartHeaderRow}>
              <Text style={styles.cartHeader}>Cart · {cart.lines.length} items</Text>
              <TouchableOpacity onPress={() => setShowCheckout(true)} testID="billing-open-checkout">
                <Text style={styles.cartExpand}>Review →</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cartChipsRow}>
              {cart.lines.map((l) => (
                <View key={l.medicine.id} style={styles.cartChip}>
                  <Text style={styles.cartChipName} numberOfLines={1}>{l.medicine.name}</Text>
                  <View style={styles.stepper}>
                    <TouchableOpacity
                      testID={`cart-qty-dec-${l.medicine.id}`}
                      onPress={() =>
                        l.quantity === 1
                          ? cart.remove(l.medicine.id)
                          : cart.setQty(l.medicine.id, l.quantity - 1)
                      }
                      style={styles.stepBtn}
                    >
                      <Feather name="minus" size={16} color={COLORS.text} />
                    </TouchableOpacity>
                    <Text style={styles.stepQty}>{l.quantity}</Text>
                    <TouchableOpacity
                      testID={`cart-qty-inc-${l.medicine.id}`}
                      onPress={() => cart.setQty(l.medicine.id, l.quantity + 1)}
                      style={styles.stepBtn}
                    >
                      <Feather name="plus" size={16} color={COLORS.text} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* bottom bar */}
        <View style={styles.bottomBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.totalLabel}>TOTAL · {totals.items} items</Text>
            <Text style={styles.totalAmount} testID="billing-total-amount">{rupee(totals.total)}</Text>
          </View>
          <TouchableOpacity
            testID="billing-checkout-button"
            style={[
              styles.payBtn,
              cart.lines.length === 0 && { backgroundColor: COLORS.borderDark },
            ]}
            disabled={cart.lines.length === 0}
            onPress={() => setShowCheckout(true)}
            activeOpacity={0.85}
          >
            <Feather name="check-circle" size={20} color={COLORS.white} />
            <Text style={styles.payBtnText}>Checkout</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Checkout modal */}
      <Modal
        visible={showCheckout}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCheckout(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="checkout-modal">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Review & Pay</Text>
              <TouchableOpacity onPress={() => setShowCheckout(false)} testID="checkout-close">
                <Feather name="x" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md }}>
              {cart.lines.map((l) => (
                <View key={l.medicine.id} style={styles.checkoutLine}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkoutName} numberOfLines={1}>{l.medicine.name}</Text>
                    <Text style={styles.checkoutMeta}>
                      {rupee(l.medicine.mrp)} × {l.quantity} · {l.discount_pct}% off
                    </Text>
                  </View>
                  <View style={styles.stepperSmall}>
                    <TouchableOpacity
                      onPress={() => l.quantity === 1 ? cart.remove(l.medicine.id) : cart.setQty(l.medicine.id, l.quantity - 1)}
                      style={styles.stepBtn}
                    >
                      <Feather name="minus" size={14} color={COLORS.text} />
                    </TouchableOpacity>
                    <Text style={styles.stepQty}>{l.quantity}</Text>
                    <TouchableOpacity
                      onPress={() => cart.setQty(l.medicine.id, l.quantity + 1)}
                      style={styles.stepBtn}
                    >
                      <Feather name="plus" size={14} color={COLORS.text} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.lineAmt}>{rupee(l.quantity * l.medicine.mrp * (1 - l.discount_pct / 100))}</Text>
                </View>
              ))}

              <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 8 }} />

              <Text style={styles.fieldLabel}>Customer (optional)</Text>
              <TextInput
                testID="checkout-customer-name"
                style={styles.field}
                placeholder="Name"
                placeholderTextColor={COLORS.textMuted}
                value={cart.customerName}
                onChangeText={(v) => cart.setCustomer(v, cart.customerPhone)}
              />
              <TextInput
                testID="checkout-customer-phone"
                style={styles.field}
                placeholder="Phone (for WhatsApp receipt)"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="phone-pad"
                value={cart.customerPhone}
                onChangeText={(v) => cart.setCustomer(cart.customerName, v)}
              />
              {cart.customerPhone.length >= 10 && (
                <View style={styles.waHint}>
                  <Feather name="message-circle" size={13} color={COLORS.success} />
                  <Text style={styles.waHintText}>Receipt will be sent on WhatsApp</Text>
                </View>
              )}

              <Text style={styles.fieldLabel}>Bill discount %</Text>
              <TextInput
                testID="checkout-bill-discount"
                style={styles.field}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={COLORS.textMuted}
                value={String(cart.billDiscountPct)}
                onChangeText={(v) => cart.setBillDiscount(parseFloat(v) || 0)}
              />

              <Text style={styles.fieldLabel}>Payment mode</Text>
              <View style={styles.payRow}>
                {(["cash", "upi", "card", "credit"] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    testID={`payment-${m}`}
                    onPress={() => cart.setPaymentMode(m)}
                    style={[
                      styles.payChip,
                      cart.paymentMode === m && styles.payChipActive,
                    ]}
                  >
                    <Text style={[styles.payChipText, cart.paymentMode === m && styles.payChipTextActive]}>
                      {m.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.totalsBox}>
                <Row label="Subtotal" value={rupee(totals.gross)} />
                <Row label="Discount" value={`- ${rupee(totals.discount)}`} tone="warning" />
                <Row label="GST (inclusive)" value="included" muted />
                <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 6 }} />
                <Row label="GRAND TOTAL" value={rupee(totals.total)} big />
              </View>

              {/* offline notice inside modal */}
              {!sync.online && (
                <View style={styles.offlineNotice}>
                  <Feather name="wifi-off" size={15} color={COLORS.warning} />
                  <Text style={styles.offlineNoticeText}>
                    You're offline. Bill will be queued and sent when connection returns.
                  </Text>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              testID="checkout-save-bill"
              style={styles.saveBillBtn}
              onPress={saveBill}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Feather name={sync.online ? "check" : "upload-cloud"} size={22} color={COLORS.white} />
                  <Text style={styles.saveBillBtnText}>
                    {sync.online ? `Save Bill · ${rupee(totals.total)}` : `Queue Offline · ${rupee(totals.total)}`}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Row({ label, value, tone, big, muted }: any) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ fontSize: big ? 15 : 13, fontWeight: big ? "800" : "500", color: muted ? COLORS.textMuted : COLORS.text, letterSpacing: big ? 0.5 : 0 }}>
        {label}
      </Text>
      <Text style={{
        fontSize: big ? 22 : 14,
        fontWeight: big ? "900" : "600",
        color: tone === "warning" ? COLORS.warning : muted ? COLORS.textMuted : COLORS.text,
      }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  title: { fontSize: 26, fontWeight: "800", color: COLORS.text, letterSpacing: -0.5 },
  scanBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.text,
    alignItems: "center",
    justifyContent: "center",
  },
  offlinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.warningBg,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
  },
  offlinePillText: { fontSize: 12, fontWeight: "800", color: COLORS.warning },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.warningBg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 7,
  },
  offlineBannerText: { fontSize: 12, color: COLORS.warning, fontWeight: "600" },
  searchBox: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    minHeight: 56,
    gap: SPACING.sm,
  },
  searchInput: { flex: 1, fontSize: 16, color: COLORS.text },
  resultsPane: { flex: 1, paddingHorizontal: SPACING.lg },
  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
    gap: SPACING.md,
  },
  resName: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  resMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  resTagRow: { flexDirection: "row", gap: 8, marginTop: 6, alignItems: "center" },
  stockTag: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.success,
    backgroundColor: COLORS.successBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stockTagLow: { color: COLORS.danger, backgroundColor: COLORS.dangerBg },
  mrpTag: { fontSize: 13, fontWeight: "800", color: COLORS.text },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { alignItems: "center", padding: SPACING.xxl, gap: 8 },
  emptyText: { color: COLORS.textMuted, fontSize: 14 },
  cartWrap: {
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
  },
  cartHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
  },
  cartHeader: { fontSize: 12, fontWeight: "800", color: COLORS.textSecondary, letterSpacing: 1 },
  cartExpand: { fontSize: 13, fontWeight: "700", color: COLORS.primary },
  cartChipsRow: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: 8 },
  cartChip: {
    flexShrink: 0,
    minWidth: 200,
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 8,
  },
  cartChipName: { fontSize: 13, fontWeight: "700", color: COLORS.text, marginBottom: 6 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 12,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  stepperSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 8,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  stepQty: { fontSize: 15, fontWeight: "800", color: COLORS.text, minWidth: 20, textAlign: "center" },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.md,
  },
  totalLabel: { fontSize: 10, fontWeight: "800", color: COLORS.textMuted, letterSpacing: 1 },
  totalAmount: { fontSize: 26, fontWeight: "900", color: COLORS.text, letterSpacing: -0.5 },
  payBtn: {
    minHeight: 56,
    minWidth: 160,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  payBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "92%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text },
  checkoutLine: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 8,
  },
  checkoutName: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  checkoutMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  lineAmt: { fontSize: 14, fontWeight: "800", color: COLORS.text, minWidth: 70, textAlign: "right" },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    fontSize: 15,
    color: COLORS.text,
  },
  waHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: -4,
  },
  waHintText: { fontSize: 12, color: COLORS.success, fontWeight: "600" },
  payRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  payChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  payChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  payChipText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, letterSpacing: 0.5 },
  payChipTextActive: { color: COLORS.white },
  totalsBox: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
  },
  offlineNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: COLORS.warningBg,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  offlineNoticeText: { flex: 1, fontSize: 13, color: COLORS.warning, fontWeight: "600" },
  saveBillBtn: {
    margin: SPACING.lg,
    minHeight: 60,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  saveBillBtnText: { color: COLORS.white, fontSize: 17, fontWeight: "800" },
});
