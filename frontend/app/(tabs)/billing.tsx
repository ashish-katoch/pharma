import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/src/api";
import { useCart, Medicine } from "@/src/cart";
import type { CartLine } from "@/src/cart";
import { useAuth } from "@/src/auth";
import { confirmDestructive } from "@/src/confirm";
import { alertMsg } from "@/src/dialog";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { DatePicker } from "@/src/components/DatePicker";
import { searchMedicines } from "@/src/catalog";
import { useSync } from "@/src/sync";
import { buildReceiptText, sendOnWhatsApp } from "@/src/whatsapp";
import { createBill } from "@/src/repositories/BillingRepository";
import type { RxDetails } from "@/src/repositories/types";

type DoctorResult = { id: string; name: string; speciality: string; clinic: string };

type HeldBill = {
  id: string;
  heldAt: string;
  customerName: string;
  customerPhone: string;
  paymentMode: "cash" | "upi" | "card" | "credit";
  billDiscountPct: number;
  lines: CartLine[];
};

const HELD_KEY = "pharma_held_bills";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function Billing() {
  const router = useRouter();
  const cart = useCart();
  const sync = useSync();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Medicine[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(null);
  const [linkedCustomerName, setLinkedCustomerName] = useState<string>("");
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [redeemLoyalty, setRedeemLoyalty] = useState(false);
  const [custSearch, setCustSearch] = useState("");
  const [custResults, setCustResults] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [custSearching, setCustSearching] = useState(false);

  // Doctor referral
  const [linkedDoctorId, setLinkedDoctorId] = useState<string | null>(null);
  const [linkedDoctorName, setLinkedDoctorName] = useState<string>("");
  const [showDoctorPicker, setShowDoctorPicker] = useState(false);
  const [doctorList, setDoctorList] = useState<DoctorResult[]>([]);
  const [doctorQ, setDoctorQ] = useState("");

  // Voice search
  const [listening, setListening] = useState(false);

  // Hold bill
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);
  const [showHeld, setShowHeld] = useState(false);

  const loadHeld = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(HELD_KEY);
      setHeldBills(raw ? JSON.parse(raw) : []);
    } catch { setHeldBills([]); }
  }, []);

  useEffect(() => { loadHeld(); }, [loadHeld]);

  const searchCustomers = useCallback(async (q: string) => {
    setCustSearch(q);
    if (!q.trim()) { setCustResults([]); return; }
    setCustSearching(true);
    try {
      const res = await api<{ id: string; name: string; phone: string }[]>(`/customers?q=${encodeURIComponent(q)}`);
      setCustResults(res.slice(0, 5));
    } catch { setCustResults([]); } finally { setCustSearching(false); }
  }, []);

  const linkCustomer = useCallback(async (c: { id: string; name: string; phone: string }) => {
    setLinkedCustomerId(c.id);
    setLinkedCustomerName(c.name);
    setCustSearch(""); setCustResults([]);
    setRedeemLoyalty(false);
    try {
      const res = await api<{ loyalty_points: number }>(`/customers/${c.id}/loyalty`);
      setLoyaltyBalance(res.loyalty_points);
    } catch { setLoyaltyBalance(0); }
    if (!cart.customerName) cart.setCustomer(c.name, c.phone ?? "");
  }, [cart]);

  const unlinkCustomer = useCallback(() => {
    setLinkedCustomerId(null); setLinkedCustomerName("");
    setLoyaltyBalance(0); setRedeemLoyalty(false);
    setCustSearch(""); setCustResults([]);
  }, []);

  const holdBill = useCallback(async () => {
    if (cart.lines.length === 0) return;
    const held: HeldBill = {
      id: Date.now().toString(),
      heldAt: new Date().toISOString(),
      customerName: cart.customerName,
      customerPhone: cart.customerPhone,
      paymentMode: cart.paymentMode,
      billDiscountPct: cart.billDiscountPct,
      lines: cart.lines,
    };
    const existing = heldBills;
    const updated = [held, ...existing];
    await AsyncStorage.setItem(HELD_KEY, JSON.stringify(updated));
    cart.clear();
    setHeldBills(updated);
  }, [cart, heldBills]);

  const restoreHeld = useCallback(async (held: HeldBill) => {
    cart.clear();
    for (const l of held.lines) {
      cart.add(l.medicine);
      cart.setQty(l.medicine.id, l.quantity);
      if (l.discount_pct) cart.setLineDiscount(l.medicine.id, l.discount_pct);
    }
    cart.setCustomer(held.customerName, held.customerPhone);
    cart.setPaymentMode(held.paymentMode);
    cart.setBillDiscount(held.billDiscountPct);
    const updated = heldBills.filter((h) => h.id !== held.id);
    await AsyncStorage.setItem(HELD_KEY, JSON.stringify(updated));
    setHeldBills(updated);
    setShowHeld(false);
  }, [cart, heldBills]);

  const deleteHeld = useCallback(async (id: string) => {
    const updated = heldBills.filter((h) => h.id !== id);
    await AsyncStorage.setItem(HELD_KEY, JSON.stringify(updated));
    setHeldBills(updated);
  }, [heldBills]);

  // Schedule H / H1 Rx capture
  const [rxModalOpen, setRxModalOpen] = useState(false);
  const [rxPhoto, setRxPhoto] = useState<string | null>(null);
  const [rxDetails, setRxDetails] = useState<RxDetails>({
    patient_name: "", patient_age: "", patient_addr: "", prescriber: "", rx_date: "",
  });

  // Split payment
  const [splitMode, setSplitMode] = useState(false);
  const [splitAmounts, setSplitAmounts] = useState<Record<string, string>>({});
  const activeSplitModes = Object.keys(splitAmounts);
  const splitTotal = Object.values(splitAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  const toggleSplitMode = (m: string) => {
    setSplitAmounts((prev) => {
      const next = { ...prev };
      if (next[m] !== undefined) { delete next[m]; } else { next[m] = ""; }
      return next;
    });
  };

  // Voice recognition events
  useSpeechRecognitionEvent("start", () => setListening(true));
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results[0]?.transcript;
    if (text) setQuery(text);
  });
  useSpeechRecognitionEvent("error", () => setListening(false));
  const pendingBillRef = useRef<(() => Promise<void>) | null>(null);

  const hasScheduleH = useMemo(
    () => cart.lines.some((l) => /^H/i.test(l.medicine.schedule ?? "")),
    [cart.lines]
  );

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

  const doSaveBill = async (rx?: RxDetails) => {
    if (cart.lines.length === 0) return;
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const rxWithPhoto: RxDetails | undefined = rx
        ? { ...rx, rx_photo: rxPhoto ?? undefined }
        : undefined;

      const splitPayment = splitMode && activeSplitModes.length > 1
        ? activeSplitModes.map((m) => ({ mode: m, amount: parseFloat(splitAmounts[m]) || 0 }))
        : undefined;
      const effectivePaymentMode = splitPayment ? splitPayment[0].mode as any : cart.paymentMode;

      const bill = Platform.OS === "web"
        ? await api<any>("/bills", {
            method: "POST",
            body: {
              lines: cart.lines.map((l) => ({
                medicine_id: l.medicine.id,
                quantity: l.quantity,
                discount_pct: l.discount_pct,
              })),
              customer_name: cart.customerName || undefined,
              payment_mode: effectivePaymentMode,
              split_payment: splitPayment,
            },
          })
        : await createBill({
            lines: cart.lines.map((l) => ({
              medicine_id: l.medicine.id,
              medicine_name: l.medicine.name,
              strength: l.medicine.strength ?? "",
              hsn: l.medicine.hsn ?? "",
              gst_rate: l.medicine.gst_rate ?? 12.0,
              quantity: l.quantity,
              discount_pct: l.discount_pct,
            })),
            customerName: cart.customerName,
            customerPhone: cart.customerPhone,
            customerId: linkedCustomerId ?? undefined,
            doctorId: linkedDoctorId ?? undefined,
            doctorName: linkedDoctorName || undefined,
            billDiscountPct: cart.billDiscountPct,
            paymentMode: effectivePaymentMode,
            splitPayment,
            createdBy: user?.email ?? "unknown",
            rxDetails: rxWithPhoto,
            loyaltyPointsUsed: redeemLoyalty && loyaltyBalance > 0 ? Math.min(loyaltyBalance, Math.floor(totals.total)) : 0,
          });

      await sync.refresh(); // update pending count badge

      // Non-blocking WhatsApp receipt (only if online; offline it's fine to skip)
      if (cart.customerPhone && sync.online) {
        const shopRes = await api<{ name: string }>("/shop").catch(() => ({ name: "Pharma Counter" }));
        const text = buildReceiptText(
          {
            bill_no: bill.bill_no,
            grand_total: bill.grand_total,
            created_at: bill.created_at,
            lines: bill.lines,
            payment_mode: bill.payment_mode,
          },
          shopRes,
        );
        sendOnWhatsApp(cart.customerPhone, text).catch(() => {});
      }

      cart.clear();
      setShowCheckout(false);
      setQuery("");
      unlinkCustomer();
      setLinkedDoctorId(null);
      setLinkedDoctorName("");
      setRxPhoto(null);

      if (!sync.online) {
        Alert.alert(
          "Saved offline",
          `Bill ${bill.bill_no} (${rupee(bill.grand_total)}) saved locally and will sync when you're back online.`,
          [{ text: "OK" }],
        );
      } else {
        // Trigger background sync immediately so UI shows synced bill_no fast.
        sync.syncNow().catch(() => {});
      }

      router.push(`/bill/${bill.id}`);
    } catch (e: any) {
      alertMsg("Bill failed", e?.message || "Unable to save bill");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // If cart has Schedule H items, show Rx capture modal before saving.
  const saveBill = () => {
    if (hasScheduleH) {
      setRxDetails({ patient_name: "", patient_age: "", patient_addr: "", prescriber: "", rx_date: "" });
      setRxModalOpen(true);
    } else {
      doSaveBill();
    }
  };

  const submitRxAndSave = () => {
    if (!rxDetails.patient_name.trim() || !rxDetails.prescriber.trim() || !rxDetails.rx_date.trim()) {
      alertMsg("Required fields", "Patient name, prescriber name, and Rx date are required for Schedule H medicines.");
      return;
    }
    setRxModalOpen(false);
    doSaveBill(rxDetails);
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
            {heldBills.length > 0 && (
              <TouchableOpacity testID="billing-held-bills" onPress={() => setShowHeld(true)} style={styles.heldBtn}>
                <Feather name="layers" size={16} color={COLORS.primary} />
                <Text style={styles.heldCount}>{heldBills.length}</Text>
              </TouchableOpacity>
            )}
            {cart.lines.length > 0 && (
              <TouchableOpacity
                testID="billing-hold-bill"
                onPress={holdBill}
                style={{ padding: 4 }}
              >
                <Feather name="pause-circle" size={20} color={COLORS.warning} />
              </TouchableOpacity>
            )}
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
            placeholder="Search medicine · brand · generic…"
            placeholderTextColor={COLORS.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoFocus
          />
          {query.length > 0 ? (
            <TouchableOpacity onPress={() => setQuery("")} testID="billing-search-clear">
              <Feather name="x" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              testID="billing-voice-btn"
              onPress={async () => {
                if (listening) {
                  ExpoSpeechRecognitionModule.stop();
                } else {
                  const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
                  if (!granted) { Alert.alert("Permission", "Microphone permission required for voice search"); return; }
                  ExpoSpeechRecognitionModule.start({ lang: "en-IN", interimResults: true });
                }
              }}
              style={[styles.voiceBtn, listening && styles.voiceBtnActive]}
            >
              <Feather name="mic" size={18} color={listening ? COLORS.white : COLORS.textMuted} />
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
                        alertMsg("Out of stock", `${item.name} has no stock.`);
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
              {cart.lines.map((l) => {
                const isDecimalUom = l.medicine.uom === "kg" || l.medicine.uom === "ltr";
                return (
                  <View key={l.medicine.id} style={styles.cartChip}>
                    <Text style={styles.cartChipName} numberOfLines={1}>
                      {l.medicine.name}
                      {l.medicine.uom && l.medicine.uom !== "pcs"
                        ? <Text style={{ fontSize: 10, color: COLORS.textMuted }}> {l.medicine.uom}</Text>
                        : null}
                    </Text>
                    {isDecimalUom ? (
                      <View style={styles.stepper}>
                        <TextInput
                          testID={`cart-qty-input-${l.medicine.id}`}
                          style={styles.qtyInput}
                          value={String(l.quantity)}
                          onChangeText={(v) => {
                            const n = parseFloat(v);
                            if (!isNaN(n) && n > 0) cart.setQty(l.medicine.id, n);
                          }}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                        />
                      </View>
                    ) : (
                      <View style={styles.stepper}>
                        <TouchableOpacity
                          testID={`cart-qty-dec-${l.medicine.id}`}
                          onPress={() =>
                            l.quantity <= 1
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
                    )}
                  </View>
                );
              })}
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
              {cart.lines.map((l) => {
                const isDecimalUom = l.medicine.uom === "kg" || l.medicine.uom === "ltr";
                return (
                  <View key={l.medicine.id} style={styles.checkoutLine}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.checkoutName} numberOfLines={1}>{l.medicine.name}</Text>
                      <Text style={styles.checkoutMeta}>
                        {rupee(l.medicine.mrp)} × {l.quantity}{l.medicine.uom && l.medicine.uom !== "pcs" ? ` ${l.medicine.uom}` : ""} · {l.discount_pct}% off
                      </Text>
                    </View>
                    {isDecimalUom ? (
                      <TextInput
                        style={[styles.qtyInput, { marginRight: 8 }]}
                        value={String(l.quantity)}
                        onChangeText={(v) => {
                          const n = parseFloat(v);
                          if (!isNaN(n) && n > 0) cart.setQty(l.medicine.id, n);
                        }}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                      />
                    ) : (
                      <View style={styles.stepperSmall}>
                        <TouchableOpacity
                          onPress={() => l.quantity <= 1 ? cart.remove(l.medicine.id) : cart.setQty(l.medicine.id, l.quantity - 1)}
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
                    )}
                    <Text style={styles.lineAmt}>{rupee(l.quantity * l.medicine.mrp * (1 - l.discount_pct / 100))}</Text>
                  </View>
                );
              })}

              <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 8 }} />

              <Text style={styles.fieldLabel}>Customer (optional)</Text>
              {linkedCustomerId ? (
                <View style={{ gap: 6 }}>
                  <View style={styles.linkedCustomer}>
                    <Feather name="user-check" size={16} color={COLORS.success} />
                    <Text style={styles.linkedCustomerName}>{linkedCustomerName}</Text>
                    {loyaltyBalance > 0 && (
                      <View style={styles.loyaltyBadge}>
                        <Feather name="star" size={10} color="#D97706" />
                        <Text style={styles.loyaltyBadgeText}>{loyaltyBalance} pts</Text>
                      </View>
                    )}
                    <TouchableOpacity onPress={unlinkCustomer}>
                      <Feather name="x" size={16} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  </View>
                  {loyaltyBalance > 0 && (
                    <TouchableOpacity
                      style={[styles.loyaltyToggle, redeemLoyalty && styles.loyaltyToggleActive]}
                      onPress={() => setRedeemLoyalty((p) => !p)}
                    >
                      <Feather name="star" size={13} color={redeemLoyalty ? COLORS.white : "#D97706"} />
                      <Text style={[styles.loyaltyToggleText, redeemLoyalty && { color: COLORS.white }]}>
                        {redeemLoyalty
                          ? `Redeeming ${Math.min(loyaltyBalance, Math.floor(totals.total))} pts (save ₹${Math.min(loyaltyBalance, Math.floor(totals.total))})`
                          : `Use ${loyaltyBalance} loyalty pts (save ₹${Math.min(loyaltyBalance, Math.floor(totals.total))})`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View style={{ gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, backgroundColor: COLORS.white }}>
                    <Feather name="search" size={14} color={COLORS.textMuted} style={{ marginLeft: 10 }} />
                    <TextInput
                      style={[styles.field, { flex: 1, borderWidth: 0, marginBottom: 0 }]}
                      placeholder="Search customer by name or phone…"
                      placeholderTextColor={COLORS.textMuted}
                      value={custSearch}
                      onChangeText={searchCustomers}
                    />
                    {custSearching && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 10 }} />}
                  </View>
                  {custResults.length > 0 && (
                    <View style={styles.custDropdown}>
                      {custResults.map((c) => (
                        <TouchableOpacity key={c.id} style={styles.custDropdownItem} onPress={() => linkCustomer(c)}>
                          <Feather name="user" size={13} color={COLORS.primary} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.custDropdownName}>{c.name}</Text>
                            {c.phone ? <Text style={styles.custDropdownPhone}>{c.phone}</Text> : null}
                          </View>
                          <Feather name="plus-circle" size={14} color={COLORS.primary} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}
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

              <Text style={styles.fieldLabel}>Doctor Referral (optional)</Text>
              {linkedDoctorId ? (
                <View style={styles.linkedCustomer}>
                  <Feather name="user" size={16} color={COLORS.success} />
                  <Text style={styles.linkedCustomerName}>Dr. {linkedDoctorName}</Text>
                  <TouchableOpacity onPress={() => { setLinkedDoctorId(null); setLinkedDoctorName(""); }}>
                    <Feather name="x" size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.linkCustomerBtn}
                  onPress={async () => {
                    try {
                      const docs = await api<DoctorResult[]>("/doctors");
                      setDoctorList(docs);
                    } catch { setDoctorList([]); }
                    setDoctorQ("");
                    setShowDoctorPicker(true);
                  }}
                >
                  <Feather name="user-plus" size={14} color={COLORS.primary} />
                  <Text style={styles.linkCustomerText}>Link referring doctor</Text>
                </TouchableOpacity>
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

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={styles.fieldLabel}>Payment mode</Text>
                <TouchableOpacity
                  onPress={() => { setSplitMode((p) => !p); setSplitAmounts({}); }}
                  style={[styles.splitToggle, splitMode && styles.splitToggleActive]}
                >
                  <Feather name="git-branch" size={12} color={splitMode ? COLORS.white : COLORS.textSecondary} />
                  <Text style={[styles.splitToggleText, splitMode && { color: COLORS.white }]}>Split</Text>
                </TouchableOpacity>
              </View>

              {!splitMode ? (
                <View style={styles.payRow}>
                  {(["cash", "upi", "card", "credit"] as const).map((m) => (
                    <TouchableOpacity
                      key={m}
                      testID={`payment-${m}`}
                      onPress={() => cart.setPaymentMode(m)}
                      style={[styles.payChip, cart.paymentMode === m && styles.payChipActive]}
                    >
                      <Text style={[styles.payChipText, cart.paymentMode === m && styles.payChipTextActive]}>
                        {m.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Select modes and enter amounts</Text>
                  {(["cash", "upi", "card"] as const).map((m) => {
                    const selected = splitAmounts[m] !== undefined;
                    return (
                      <View key={m} style={styles.splitRow}>
                        <TouchableOpacity
                          onPress={() => toggleSplitMode(m)}
                          style={[styles.payChip, selected && styles.payChipActive, { flex: 0, minWidth: 64 }]}
                        >
                          <Text style={[styles.payChipText, selected && styles.payChipTextActive]}>{m.toUpperCase()}</Text>
                        </TouchableOpacity>
                        {selected && (
                          <TextInput
                            style={styles.splitInput}
                            placeholder="₹ amount"
                            placeholderTextColor={COLORS.textMuted}
                            keyboardType="numeric"
                            value={splitAmounts[m]}
                            onChangeText={(v) => setSplitAmounts((p) => ({ ...p, [m]: v }))}
                          />
                        )}
                      </View>
                    );
                  })}
                  {activeSplitModes.length > 0 && (
                    <View style={[styles.splitSummary, Math.abs(splitTotal - totals.total) > 0.5 && { borderColor: COLORS.danger }]}>
                      <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Split total: {rupee(splitTotal)}</Text>
                      <Text style={{ fontSize: 12, color: Math.abs(splitTotal - totals.total) > 0.5 ? COLORS.danger : COLORS.success }}>
                        {Math.abs(splitTotal - totals.total) < 0.5 ? "✓ Balanced" : `Remaining: ${rupee(totals.total - splitTotal)}`}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              <View style={styles.totalsBox}>
                <Row label="Subtotal" value={rupee(totals.gross)} />
                <Row label="Discount" value={`- ${rupee(totals.discount)}`} tone="warning" />
                <Row label="GST (inclusive)" value="included" muted />
                {redeemLoyalty && loyaltyBalance > 0 && (
                  <Row label="Loyalty Discount" value={`- ₹${Math.min(loyaltyBalance, Math.floor(totals.total))}`} tone="warning" />
                )}
                <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 6 }} />
                <Row
                  label="GRAND TOTAL"
                  value={rupee(redeemLoyalty && loyaltyBalance > 0
                    ? Math.max(0, totals.total - Math.min(loyaltyBalance, Math.floor(totals.total)))
                    : totals.total)}
                  big
                />
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

            {hasScheduleH && (
              <View style={styles.scheduleHBanner}>
                <Feather name="alert-triangle" size={14} color="#92400E" />
                <Text style={styles.scheduleHText}>
                  Cart contains Schedule H medicine — Rx details required before saving.
                </Text>
              </View>
            )}

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
                    {hasScheduleH
                      ? `Enter Rx Details · ${rupee(totals.total)}`
                      : sync.online ? `Save Bill · ${rupee(totals.total)}` : `Save Offline · ${rupee(totals.total)}`}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Doctor Picker Modal ── */}
      <Modal
        visible={showDoctorPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDoctorPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: "70%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Doctor</Text>
              <TouchableOpacity onPress={() => setShowDoctorPicker(false)}>
                <Feather name="x" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.md }}>
              <TextInput
                style={styles.field}
                placeholder="Search by name or specialty…"
                placeholderTextColor={COLORS.textMuted}
                value={doctorQ}
                onChangeText={setDoctorQ}
                autoFocus
              />
            </View>
            <FlatList
              data={doctorList.filter((d) =>
                !doctorQ || d.name.toLowerCase().includes(doctorQ.toLowerCase()) || d.speciality?.toLowerCase().includes(doctorQ.toLowerCase())
              )}
              keyExtractor={(d) => d.id}
              contentContainerStyle={{ padding: SPACING.lg, gap: 8 }}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>No doctors found. Add them in Settings → Doctors.</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.resultCard}
                  onPress={() => {
                    setLinkedDoctorId(item.id);
                    setLinkedDoctorName(item.name);
                    setShowDoctorPicker(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resName}>Dr. {item.name}</Text>
                    {(item.speciality || item.clinic) ? (
                      <Text style={styles.resMeta}>
                        {[item.speciality, item.clinic].filter(Boolean).join(" · ")}
                      </Text>
                    ) : null}
                  </View>
                  <Feather name="chevron-right" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ── Schedule H Rx Details Modal ── */}
      <Modal
        visible={rxModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setRxModalOpen(false)}
      >
        <SafeAreaView style={styles.rxModalRoot} edges={["top", "bottom"]}>
          <View style={styles.rxModalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rxModalTitle}>Schedule H — Rx Details</Text>
              <Text style={styles.rxModalSub}>Required by Drug &amp; Cosmetics Act for Schedule H/H1 medicines</Text>
            </View>
            <TouchableOpacity onPress={() => setRxModalOpen(false)} testID="rx-modal-close">
              <Feather name="x" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md }} keyboardShouldPersistTaps="handled">
            <View style={styles.schHMeds}>
              <Text style={styles.fieldLabel}>SCHEDULE H MEDICINES IN CART</Text>
              {cart.lines
                .filter((l) => /^H/i.test(l.medicine.schedule ?? ""))
                .map((l) => (
                  <Text key={l.medicine.id} style={styles.schHMed}>
                    • {l.medicine.name} ({l.medicine.schedule?.toUpperCase()}) × {l.quantity}
                  </Text>
                ))}
            </View>

            {/* Prescription photo */}
            <View style={{ gap: 6 }}>
              <Text style={styles.fieldLabel}>PRESCRIPTION PHOTO (OPTIONAL — FOR AUDIT DEFENCE)</Text>
              {rxPhoto ? (
                <View style={styles.rxPhotoWrap}>
                  <Image source={{ uri: rxPhoto }} style={styles.rxPhotoThumb} resizeMode="cover" />
                  <TouchableOpacity style={styles.rxPhotoRemove} onPress={() => setRxPhoto(null)}>
                    <Feather name="x" size={16} color={COLORS.white} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.rxPhotoBtn}
                  onPress={async () => {
                    const { status } = await ImagePicker.requestCameraPermissionsAsync();
                    if (status !== "granted") { Alert.alert("Permission", "Camera permission required"); return; }
                    const result = await ImagePicker.launchCameraAsync({
                      mediaTypes: "images",
                      quality: 0.6,
                      base64: true,
                      allowsEditing: true,
                      aspect: [4, 3],
                    });
                    if (!result.canceled && result.assets[0].base64) {
                      setRxPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
                    }
                  }}
                >
                  <Feather name="camera" size={20} color={COLORS.primary} />
                  <Text style={styles.rxPhotoBtnText}>Take Photo of Prescription</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.fieldLabel}>Patient Name *</Text>
            <TextInput
              testID="rx-patient-name"
              style={styles.rxField}
              placeholder="Full name"
              placeholderTextColor={COLORS.textMuted}
              value={rxDetails.patient_name}
              onChangeText={(v) => setRxDetails((p) => ({ ...p, patient_name: v }))}
            />

            <Text style={styles.fieldLabel}>Patient Age</Text>
            <TextInput
              testID="rx-patient-age"
              style={styles.rxField}
              placeholder="e.g. 42"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="numeric"
              value={rxDetails.patient_age}
              onChangeText={(v) => setRxDetails((p) => ({ ...p, patient_age: v }))}
            />

            <Text style={styles.fieldLabel}>Patient Address</Text>
            <TextInput
              testID="rx-patient-addr"
              style={[styles.rxField, { minHeight: 64, textAlignVertical: "top" }]}
              placeholder="Address"
              placeholderTextColor={COLORS.textMuted}
              multiline
              value={rxDetails.patient_addr}
              onChangeText={(v) => setRxDetails((p) => ({ ...p, patient_addr: v }))}
            />

            <Text style={styles.fieldLabel}>Prescriber Name *</Text>
            <TextInput
              testID="rx-prescriber"
              style={styles.rxField}
              placeholder="Dr. ..."
              placeholderTextColor={COLORS.textMuted}
              value={rxDetails.prescriber}
              onChangeText={(v) => setRxDetails((p) => ({ ...p, prescriber: v }))}
            />

            <DatePicker
              label="Prescription Date *"
              value={rxDetails.rx_date}
              onChange={(v) => setRxDetails((p) => ({ ...p, rx_date: v }))}
              maximumDate={new Date().toISOString().slice(0, 10)}
            />
          </ScrollView>

          <View style={{ padding: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.white }}>
            <TouchableOpacity
              testID="rx-submit"
              style={styles.saveBillBtn}
              onPress={submitRxAndSave}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color={COLORS.white} /> : (
                <>
                  <Feather name="check" size={22} color={COLORS.white} />
                  <Text style={styles.saveBillBtnText}>Save Bill · {rupee(totals.total)}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Held Bills tray */}
      <Modal visible={showHeld} animationType="slide" transparent onRequestClose={() => setShowHeld(false)}>
        <View style={styles.heldOverlay}>
          <View style={styles.heldSheet}>
            <View style={styles.heldHeader}>
              <Text style={styles.heldTitle}>Held Bills ({heldBills.length})</Text>
              <TouchableOpacity onPress={() => setShowHeld(false)}>
                <Feather name="x" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: 10, paddingBottom: 32 }}>
              {heldBills.length === 0 ? (
                <Text style={{ textAlign: "center", color: COLORS.textMuted, marginTop: 20 }}>No held bills</Text>
              ) : heldBills.map((h) => (
                <View key={h.id} style={styles.heldCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heldCardName}>{h.customerName || "No customer"}</Text>
                    <Text style={styles.heldCardMeta}>
                      {h.lines.length} item{h.lines.length !== 1 ? "s" : ""} · {new Date(h.heldAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                    <Text style={styles.heldCardMeta} numberOfLines={1}>
                      {h.lines.map((l) => l.medicine.name).join(", ")}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.restoreBtn} onPress={() => restoreHeld(h)}>
                    <Feather name="play" size={14} color={COLORS.white} />
                    <Text style={styles.restoreBtnText}>Resume</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteHeld(h.id)} style={{ padding: 6 }}>
                    <Feather name="trash-2" size={15} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
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
  qtyInput: {
    width: 64,
    height: 36,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
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
  linkedCustomer: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.successBg, padding: 10, borderRadius: RADIUS.md },
  linkedCustomerName: { flex: 1, fontSize: 14, fontWeight: "700", color: COLORS.success },
  linkCustomerBtn: { flexDirection: "row", gap: 6, alignItems: "center", borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.md, padding: 10, marginBottom: 4 },
  linkCustomerText: { fontSize: 13, fontWeight: "600", color: COLORS.primary },
  loyaltyBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#FEF3C7", paddingHorizontal: 7, paddingVertical: 3, borderRadius: RADIUS.pill },
  loyaltyBadgeText: { fontSize: 10, fontWeight: "800", color: "#D97706" },
  loyaltyToggle: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: "#D97706", backgroundColor: "#FFFBEB" },
  loyaltyToggleActive: { backgroundColor: "#D97706", borderColor: "#D97706" },
  loyaltyToggleText: { fontSize: 12, fontWeight: "700", color: "#D97706", flex: 1 },
  custDropdown: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, backgroundColor: COLORS.white, overflow: "hidden" },
  custDropdownItem: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  custDropdownName: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  custDropdownPhone: { fontSize: 11, color: COLORS.textMuted },
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
  scheduleHBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FFFBEB",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "#FDE68A",
    padding: SPACING.md,
  },
  scheduleHText: { flex: 1, fontSize: 12, color: "#92400E", fontWeight: "600", lineHeight: 16 },
  rxModalRoot: { flex: 1, backgroundColor: COLORS.surface },
  rxModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  rxModalTitle: { fontSize: 17, fontWeight: "800", color: COLORS.text },
  rxModalSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2, lineHeight: 15 },
  splitToggle: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 10, paddingVertical: 5 },
  splitToggleActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  splitToggleText: { fontSize: 11, fontWeight: "700", color: COLORS.textSecondary },
  splitRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  splitInput: { flex: 1, height: 40, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.white },
  splitSummary: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.sm, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heldBtn: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 4 },
  heldCount: { fontSize: 12, fontWeight: "800", color: COLORS.primary },
  heldOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.55)", justifyContent: "flex-end" },
  heldSheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "75%" },
  heldHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  heldTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  heldCard: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md },
  heldCardName: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  heldCardMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  restoreBtn: { flexDirection: "row", gap: 4, alignItems: "center", backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: 10, paddingVertical: 7 },
  restoreBtnText: { color: COLORS.white, fontWeight: "700", fontSize: 12 },
  schHMeds: {
    backgroundColor: "#FEF2F2",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: SPACING.md,
    gap: 4,
  },
  schHMed: { fontSize: 13, color: COLORS.text, marginTop: 4 },
  voiceBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceBtnActive: {
    backgroundColor: COLORS.primary,
  },
  rxPhotoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: "dashed",
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  rxPhotoBtnText: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  rxPhotoWrap: { position: "relative", alignSelf: "flex-start" },
  rxPhotoThumb: { width: 120, height: 90, borderRadius: RADIUS.md },
  rxPhotoRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    padding: 2,
  },
  rxField: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    backgroundColor: COLORS.white,
    fontSize: 15,
    color: COLORS.text,
  },
});
