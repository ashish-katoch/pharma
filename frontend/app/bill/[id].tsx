import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PageShell } from "@/src/components/PageShell";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { api } from "@/src/api";
import { useIsOwner } from "@/src/auth";
import { confirmDestructive } from "@/src/confirm";
import { alertMsg } from "@/src/dialog";
import { getBillById } from "@/src/repositories/BillingRepository";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { buildReceiptText, sendOnWhatsApp } from "@/src/whatsapp";
import { buildTaxInvoiceHtml, gstSlabs } from "@/src/invoice";
import { buildThermalReceipt } from "@/src/thermal/receipt";
import { getSavedPrinter, printBytes } from "@/src/thermal/PrinterService";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type BillLine = {
  medicine_id: string;
  medicine_name: string;
  batch_id: string;
  batch_no: string;
  expiry: string;
  hsn: string;
  strength?: string;
  quantity: number;
  mrp: number;
  discount_pct: number;
  gst_rate: number;
  line_total: number;
  taxable_amount: number;
  cgst: number;
  sgst: number;
};

type Bill = {
  id: string;
  bill_no: string;
  customer_name: string;
  customer_phone: string;
  lines: BillLine[];
  subtotal: number;
  total_discount: number;
  taxable_total: number;
  cgst_total: number;
  sgst_total: number;
  grand_total: number;
  payment_mode: string;
  status: string;
  created_at: string;
  created_by: string;
  sold_by_name?: string;
  edit_count?: number;
  edited_at?: string;
  edit_reason?: string;
};

type BillVersion = {
  version: number;
  snapped_at: string;
  edited_by: string;
  reason: string;
  grand_total: number;
};

type Shop = {
  name: string;
  address: string;
  phone: string;
  gstin: string;
  dl_no: string;
};

type ReturnState = {
  [key: string]: string; // "medicine_id::batch_id" -> qty string
};

export default function BillDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isOwner = useIsOwner();
  const [bill, setBill] = useState<Bill | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  // Return modal state
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnQtys, setReturnQtys] = useState<ReturnState>({});
  const [returnReason, setReturnReason] = useState("");
  const [returning, setReturning] = useState(false);
  const [pastReturns, setPastReturns] = useState<any[]>([]);
  const [versions, setVersions] = useState<BillVersion[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalPwd, setApprovalPwd] = useState("");
  const [approvalLoading, setApprovalLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      let local = null;
      try { local = await getBillById(id!); } catch {}
      const shopRes = await api<Shop>("/shop").catch(() => null);
      if (shopRes) setShop(shopRes);

      if (local) {
        setBill(local as unknown as Bill);
      } else {
        const remote = await api<Bill>(`/bills/${id}`);
        setBill(remote);
      }

      // Returns and versions are server-side only.
      try {
        const [rets, vers] = await Promise.all([
          api<any[]>(`/bills/${id}/returns`),
          api<BillVersion[]>(`/bills/${id}/versions`),
        ]);
        setPastReturns(rets);
        setVersions(vers);
      } catch {
        // Non-fatal: offline or bill not yet synced.
      }
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  const [printing, setPrinting] = useState(false);

  const buildHtml = (): string => {
    if (!bill || !shop) return "";
    return buildTaxInvoiceHtml(bill as any, shop, "original");
  };

  const sharePdf = async () => {
    try {
      const html = buildHtml();
      if (Platform.OS === "web") {
        await Print.printAsync({ html });
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { UTI: ".pdf", mimeType: "application/pdf" });
        } else {
          Alert.alert("Ready", "PDF saved: " + uri);
        }
      }
    } catch (e: any) {
      Alert.alert("Share failed", e?.message || "");
    }
  };

  const printReceipt = async () => {
    if (!bill || !shop) return;
    if (Platform.OS === "web") {
      Alert.alert("Not available", "Bluetooth thermal printing requires the mobile app.");
      return;
    }
    const printer = await getSavedPrinter();
    if (!printer) {
      Alert.alert(
        "No printer paired",
        "Go to Settings → Printer to pair a Bluetooth thermal printer.",
        [{ text: "OK" }],
      );
      return;
    }
    setPrinting(true);
    try {
      const bytes = buildThermalReceipt(bill as any, shop, 32);
      await printBytes(printer.id, bytes);
    } catch (e: any) {
      Alert.alert("Print failed", e?.message || "Could not reach printer");
    } finally {
      setPrinting(false);
    }
  };

  const shareWhatsApp = async () => {
    if (!bill) return;
    const phone = bill.customer_phone || "";
    const text = buildReceiptText(bill, shop ?? { name: "Pharma Counter" });
    const ok = await sendOnWhatsApp(phone, text);
    if (!ok) {
      Alert.alert("WhatsApp not found", "Install WhatsApp to use this feature.");
    }
  };

  const shareEmail = async () => {
    if (!bill) return;
    if (Platform.OS === "web") {
      const subject = encodeURIComponent(`Invoice ${bill.bill_no}`);
      const body = encodeURIComponent(buildReceiptText(bill, shop ?? { name: "Pharma Counter" }));
      window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
    } else {
      await sharePdf();
    }
  };

  const openEdit = () => {
    if (!bill) return;
    const today = new Date().toISOString().slice(0, 10);
    const billDate = bill.created_at.slice(0, 10);
    if (billDate === today) {
      router.push(`/bill-edit/${id!}` as any);
    } else {
      setApprovalPwd("");
      setApprovalOpen(true);
    }
  };

  const confirmEdit = async () => {
    if (!approvalPwd.trim()) {
      alertMsg("Password required", "Enter your password to edit this bill");
      return;
    }
    setApprovalLoading(true);
    try {
      // Verify password first, then grant backend edit approval for this bill.
      await api("/auth/verify-password", { method: "POST", body: { password: approvalPwd } });
      await api(`/bills/${id}/approve-edit`, { method: "POST" });
      setApprovalOpen(false);
      router.push(`/bill-edit/${id!}` as any);
    } catch (e: any) {
      alertMsg("Incorrect password", e?.message || "Password does not match. Edit not allowed.");
    } finally {
      setApprovalLoading(false);
    }
  };

  const cancelBill = async () => {
    confirmDestructive("Cancel bill?", "Stock will be returned to batches.", "Cancel bill", async () => {
      setCancelling(true);
      try {
        await api(`/bills/${id}/cancel`, { method: "POST" });
        await load();
      } catch (e: any) {
        Alert.alert("Failed", e?.message || "");
      } finally {
        setCancelling(false);
      }
    });
  };

  // ---------- Return helpers ----------
  const openReturn = () => {
    setReturnQtys({});
    setReturnReason("");
    setReturnOpen(true);
  };

  const returnKey = (l: BillLine) => `${l.medicine_id}::${l.batch_id}`;

  // Calculate already-returned quantities per line.
  const alreadyReturned = (l: BillLine): number => {
    let total = 0;
    for (const r of pastReturns) {
      for (const rl of r.lines ?? []) {
        if (rl.medicine_id === l.medicine_id && rl.batch_id === l.batch_id) {
          total += Number(rl.quantity);
        }
      }
    }
    return total;
  };

  const returnRefundPreview = (): number => {
    if (!bill) return 0;
    let total = 0;
    for (const l of bill.lines) {
      const qty = parseInt(returnQtys[returnKey(l)] || "0", 10);
      if (qty > 0) {
        const unitPrice = l.line_total / l.quantity;
        total += unitPrice * qty;
      }
    }
    return Math.round(total * 100) / 100;
  };

  const submitReturn = async () => {
    if (!bill) return;
    const lines: { medicine_id: string; batch_id: string; quantity: number }[] = [];
    for (const l of bill.lines) {
      const qty = parseInt(returnQtys[returnKey(l)] || "0", 10);
      if (qty > 0) {
        const maxReturnable = l.quantity - alreadyReturned(l);
        if (qty > maxReturnable) {
          alertMsg("Too many", `${l.medicine_name}: max returnable is ${maxReturnable}`);
          return;
        }
        lines.push({ medicine_id: l.medicine_id, batch_id: l.batch_id, quantity: qty });
      }
    }
    if (lines.length === 0) {
      alertMsg("Select items", "Enter a quantity for at least one item.");
      return;
    }
    setReturning(true);
    try {
      await api(`/bills/${id}/return`, {
        method: "POST",
        body: { lines, reason: returnReason.trim() },
      });
      setReturnOpen(false);
      alertMsg("Return processed", `Refund: ${rupee(returnRefundPreview())}\nStock restored.`);
      await load();
    } catch (e: any) {
      alertMsg("Return failed", e?.message || "");
    } finally {
      setReturning(false);
    }
  };

  if (loading || !bill) {
    return (
      <PageShell title="Bill" showBack scrollable={false}>
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      </PageShell>
    );
  }

  const ShareBtn = (
    <TouchableOpacity onPress={sharePdf} testID="bill-share">
      <Feather name="share" size={22} color={COLORS.primary} />
    </TouchableOpacity>
  );

  return (
    <PageShell title={bill.bill_no} showBack scrollable={false} noPadding rightAction={ShareBtn}>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 120 }}>
        {bill.status === "cancelled" && (
          <View style={styles.cancelBanner} testID="bill-cancelled-banner">
            <Feather name="x-octagon" size={18} color={COLORS.danger} />
            <Text style={styles.cancelBannerText}>This bill has been CANCELLED</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.metaLabel}>DATE</Text>
          <Text style={styles.metaValue}>{new Date(bill.created_at).toLocaleString("en-IN")}</Text>
          <Text style={[styles.metaLabel, { marginTop: 8 }]}>CUSTOMER</Text>
          <Text style={styles.metaValue}>{bill.customer_name || "Walk-in"}{bill.customer_phone ? " · " + bill.customer_phone : ""}</Text>
          <Text style={[styles.metaLabel, { marginTop: 8 }]}>PAYMENT</Text>
          <Text style={styles.metaValue}>{bill.payment_mode.toUpperCase()}</Text>
          <Text style={[styles.metaLabel, { marginTop: 8 }]}>CASHIER</Text>
          <Text style={styles.metaValue}>{bill.sold_by_name || bill.created_by}</Text>
          {(bill.edit_count ?? 0) > 0 && (
            <>
              <Text style={[styles.metaLabel, { marginTop: 8 }]}>LAST EDITED</Text>
              <Text style={styles.metaValue}>
                {bill.edited_at ? new Date(bill.edited_at).toLocaleString("en-IN") : "—"}
                {bill.edit_reason ? ` · ${bill.edit_reason}` : ""}
              </Text>
            </>
          )}
        </View>

        <Text style={styles.sectionTitle}>Items ({bill.lines.length})</Text>
        {bill.lines.map((l: BillLine, i: number) => {
          const returned = alreadyReturned(l);
          return (
            <View key={i} style={styles.lineCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName}>{l.medicine_name} {l.strength ? `· ${l.strength}` : ""}</Text>
                <Text style={styles.lineMeta}>B: {l.batch_no} · Exp {l.expiry} · HSN {l.hsn}</Text>
                <Text style={styles.lineMeta}>{rupee(l.mrp)} × {l.quantity} {l.discount_pct ? `· ${l.discount_pct}% off` : ""}</Text>
                {returned > 0 && (
                  <Text style={styles.returnedTag}>{returned} returned</Text>
                )}
              </View>
              <Text style={styles.lineAmt}>{rupee(l.line_total)}</Text>
            </View>
          );
        })}

        {pastReturns.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Returns ({pastReturns.length})</Text>
            {pastReturns.map((r: any, i: number) => (
              <View key={i} style={styles.returnCard}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={styles.returnTitle}>Return #{i + 1}</Text>
                  <Text style={styles.returnRefund}>− {rupee(r.total_refund)}</Text>
                </View>
                <Text style={styles.returnMeta}>{new Date(r.created_at).toLocaleDateString("en-IN")} · {r.created_by}</Text>
                {r.reason ? <Text style={styles.returnMeta}>Reason: {r.reason}</Text> : null}
                {(r.lines ?? []).map((rl: any, j: number) => (
                  <Text key={j} style={styles.returnLine}>
                    {rl.medicine_name} × {rl.quantity} ({rupee(rl.refund_amount)})
                  </Text>
                ))}
              </View>
            ))}
          </>
        )}

        {versions.length > 0 && (
          <>
            <TouchableOpacity
              style={styles.versionHeader}
              onPress={() => setVersionsOpen((v) => !v)}
            >
              <Text style={styles.sectionTitle}>Edit History ({versions.length})</Text>
              <Feather name={versionsOpen ? "chevron-up" : "chevron-down"} size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
            {versionsOpen && versions.map((v) => (
              <View key={v.version} style={styles.versionCard}>
                <View style={styles.versionRow}>
                  <View style={styles.versionBadge}>
                    <Text style={styles.versionBadgeText}>v{v.version}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.versionDate}>{new Date(v.snapped_at).toLocaleString("en-IN")}</Text>
                    <Text style={styles.versionMeta}>{v.edited_by} · was {rupee(v.grand_total)}</Text>
                    {v.reason ? <Text style={styles.versionReason}>"{v.reason}"</Text> : null}
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        <View style={styles.totalsCard}>
          <Row label="Subtotal" value={rupee(bill.subtotal)} />
          <Row label="Discount" value={`- ${rupee(bill.total_discount)}`} tone="warning" />
          <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 6 }} />
          {/* GST slab-wise breakdown — required on valid tax invoice */}
          {gstSlabs(bill.lines).map((s) => (
            <View key={s.rate}>
              <Row label={`Taxable @${s.rate}%`} value={rupee(s.taxable)} muted />
              <Row label={`  CGST @${s.rate / 2}%`} value={rupee(s.cgst)} muted />
              <Row label={`  SGST @${s.rate / 2}%`} value={rupee(s.sgst)} muted />
            </View>
          ))}
          <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 6 }} />
          <Row label="GRAND TOTAL" value={rupee(bill.grand_total)} big />
          {bill.customer_name ? (
            <View style={styles.loyaltyEarned}>
              <Feather name="star" size={13} color="#D97706" />
              <Text style={styles.loyaltyEarnedText}>
                {Math.floor(bill.grand_total)} loyalty points earned
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity testID="bill-print-btn" style={styles.printBtn} onPress={printReceipt} disabled={printing}>
          {printing
            ? <ActivityIndicator color={COLORS.text} size="small" />
            : <Feather name="printer" size={18} color={COLORS.text} />}
          <Text style={styles.printBtnText}>Print</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="bill-share-btn" style={styles.secBtn} onPress={sharePdf}>
          <Feather name="share-2" size={18} color={COLORS.primary} />
          <Text style={styles.secBtnText}>PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="bill-whatsapp-btn" style={styles.waBtn} onPress={shareWhatsApp}>
          <Feather name="message-circle" size={18} color="#25D366" />
          <Text style={styles.waBtnText}>WhatsApp</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="bill-email-btn" style={styles.emailBtn} onPress={shareEmail}>
          <Feather name="mail" size={18} color={COLORS.primary} />
          <Text style={styles.emailBtnText}>Email</Text>
        </TouchableOpacity>
        {bill.status === "active" && (
          <>
            {isOwner && (
              <TouchableOpacity
                testID="bill-edit-btn"
                style={styles.editBtn}
                onPress={openEdit}
              >
                <Feather name="edit-2" size={18} color={COLORS.primary} />
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              testID="bill-return-btn"
              style={styles.returnBtn}
              onPress={openReturn}
            >
              <Feather name="rotate-ccw" size={18} color={COLORS.warning} />
              <Text style={styles.returnBtnText}>Return</Text>
            </TouchableOpacity>
            {isOwner && (
              <TouchableOpacity
                testID="bill-cancel-btn"
                style={styles.cancelBtn}
                onPress={cancelBill}
                disabled={cancelling}
              >
                {cancelling ? <ActivityIndicator color={COLORS.white} /> : (
                  <>
                    <Feather name="x-circle" size={18} color={COLORS.white} />
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* ── Return Modal ── */}
      <Modal visible={returnOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setReturnOpen(false)}>
        <SafeAreaView style={styles.modalRoot} edges={["top", "bottom"]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Return Items</Text>
            <TouchableOpacity onPress={() => setReturnOpen(false)} testID="return-modal-close">
              <Feather name="x" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalHint}>Enter the quantity to return for each item. Leave blank or 0 to skip.</Text>

              {bill.lines.map((l: BillLine, i: number) => {
                const returned = alreadyReturned(l);
                const maxReturnable = l.quantity - returned;
                const key = returnKey(l);
                return (
                  <View key={i} style={styles.returnLineRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lineName}>{l.medicine_name}</Text>
                      <Text style={styles.lineMeta}>
                        Billed: {l.quantity}
                        {returned > 0 ? ` · Returned: ${returned}` : ""}
                        {" · "}Max: {maxReturnable}
                      </Text>
                    </View>
                    <TextInput
                      testID={`return-qty-${i}`}
                      style={[styles.returnQtyInput, maxReturnable <= 0 && styles.returnQtyDisabled]}
                      value={returnQtys[key] || ""}
                      onChangeText={(v) => setReturnQtys((prev) => ({ ...prev, [key]: v }))}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={COLORS.textMuted}
                      editable={maxReturnable > 0}
                    />
                  </View>
                );
              })}

              <View style={{ gap: 6 }}>
                <Text style={styles.fieldLabel}>Reason (optional)</Text>
                <TextInput
                  testID="return-reason"
                  style={[styles.field, { minHeight: 72, textAlignVertical: "top" }]}
                  value={returnReason}
                  onChangeText={setReturnReason}
                  placeholder="e.g. damaged, wrong product…"
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                />
              </View>

              {returnRefundPreview() > 0 && (
                <View style={styles.refundPreview}>
                  <Text style={styles.refundLabel}>Estimated refund</Text>
                  <Text style={styles.refundAmt}>{rupee(returnRefundPreview())}</Text>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              testID="return-submit"
              style={[styles.primaryBtn, returning && { opacity: 0.6 }]}
              onPress={submitReturn}
              disabled={returning}
            >
              {returning ? <ActivityIndicator color={COLORS.white} /> : (
                <>
                  <Feather name="rotate-ccw" size={20} color={COLORS.white} />
                  <Text style={styles.primaryBtnText}>Process Return</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Owner approval modal for editing old bills */}
      <Modal visible={approvalOpen} animationType="fade" transparent onRequestClose={() => setApprovalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.approvalOverlay}>
          <View style={styles.approvalSheet}>
            <View style={styles.approvalIcon}>
              <Feather name="lock" size={24} color={COLORS.warning} />
            </View>
            <Text style={styles.approvalTitle}>Owner Approval Required</Text>
            <Text style={styles.approvalSub}>
              This bill is from a previous day. Enter your password to allow editing.
            </Text>
            <TextInput
              style={styles.approvalInput}
              value={approvalPwd}
              onChangeText={setApprovalPwd}
              placeholder="Your password"
              placeholderTextColor={COLORS.textMuted}
              secureTextEntry
              autoFocus
              onSubmitEditing={confirmEdit}
              returnKeyType="done"
              testID="approval-pwd-input"
            />
            <View style={styles.approvalRow}>
              <TouchableOpacity style={styles.approvalCancel} onPress={() => setApprovalOpen(false)}>
                <Text style={styles.approvalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.approvalConfirm, approvalLoading && { opacity: 0.6 }]}
                onPress={confirmEdit}
                disabled={approvalLoading}
                testID="approval-confirm-btn"
              >
                {approvalLoading
                  ? <ActivityIndicator color={COLORS.white} size="small" />
                  : <Text style={styles.approvalConfirmText}>Confirm</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </PageShell>
  );
}

function Row({ label, value, tone, big, muted }: any) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ fontSize: big ? 14 : 13, fontWeight: big ? "800" : "500", color: muted ? COLORS.textMuted : COLORS.text, letterSpacing: big ? 1 : 0 }}>
        {label}
      </Text>
      <Text style={{ fontSize: big ? 22 : 14, fontWeight: big ? "900" : "600", color: tone === "warning" ? COLORS.warning : muted ? COLORS.textMuted : COLORS.text }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  cancelBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: SPACING.md,
    backgroundColor: COLORS.dangerBg,
    borderRadius: RADIUS.md,
  },
  cancelBannerText: { color: COLORS.danger, fontWeight: "800" },
  card: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metaLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2, color: COLORS.textMuted },
  metaValue: { fontSize: 14, fontWeight: "600", color: COLORS.text, marginTop: 2 },
  sectionTitle: { fontSize: 12, fontWeight: "800", letterSpacing: 1.2, color: COLORS.textMuted, marginTop: 6 },
  lineCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  lineName: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  lineMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  lineAmt: { fontSize: 15, fontWeight: "800", color: COLORS.text },
  returnedTag: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.warning,
    backgroundColor: "#FFF7ED",
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  returnCard: {
    padding: SPACING.md,
    backgroundColor: "#FFF7ED",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "#FED7AA",
    gap: 4,
  },
  returnTitle: { fontSize: 13, fontWeight: "800", color: COLORS.text },
  returnRefund: { fontSize: 13, fontWeight: "800", color: COLORS.warning },
  returnMeta: { fontSize: 11, color: COLORS.textSecondary },
  returnLine: { fontSize: 12, color: COLORS.text, marginTop: 2 },
  versionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  versionCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: 6,
  },
  versionRow: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm },
  versionBadge: {
    backgroundColor: "#EFF6FF",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  versionBadgeText: { fontSize: 11, fontWeight: "800", color: COLORS.primary },
  versionDate: { fontSize: 12, fontWeight: "700", color: COLORS.text },
  versionMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  versionReason: { fontSize: 11, color: COLORS.textMuted, fontStyle: "italic", marginTop: 2 },
  totalsCard: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  loyaltyEarned: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  loyaltyEarnedText: { fontSize: 13, fontWeight: "700", color: "#92400E" },
  bottomBar: {
    flexDirection: "row",
    gap: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  printBtn: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.textMuted,
    backgroundColor: COLORS.surface,
  },
  printBtnText: { color: COLORS.text, fontWeight: "800", fontSize: 13 },
  secBtn: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  secBtnText: { color: COLORS.primary, fontWeight: "800", fontSize: 13 },
  waBtn: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "#25D366",
    backgroundColor: "#F0FFF4",
  },
  waBtnText: { color: "#128C4B", fontWeight: "800", fontSize: 13 },
  emailBtn: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  emailBtnText: { color: COLORS.primary, fontWeight: "800", fontSize: 13 },
  editBtn: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: "#EFF6FF",
  },
  editBtnText: { color: COLORS.primary, fontWeight: "800", fontSize: 13 },
  returnBtn: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.warning,
    backgroundColor: "#FFF7ED",
  },
  returnBtnText: { color: COLORS.warning, fontWeight: "800", fontSize: 13 },
  cancelBtn: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.danger,
  },
  cancelBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 13 },

  // Modal
  modalRoot: { flex: 1, backgroundColor: COLORS.surface },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  modalHint: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  returnLineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  returnQtyInput: {
    width: 72,
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
    backgroundColor: COLORS.primaryLight,
  },
  returnQtyDisabled: {
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    color: COLORS.textMuted,
  },
  fieldLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.textSecondary },
  field: {
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
  refundPreview: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: SPACING.md,
    backgroundColor: COLORS.successBg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  refundLabel: { fontSize: 13, fontWeight: "700", color: COLORS.success },
  refundAmt: { fontSize: 20, fontWeight: "900", color: COLORS.success },
  modalFooter: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  primaryBtn: {
    minHeight: 56,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
  approvalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  approvalSheet: {
    width: "100%",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    alignItems: "center",
    gap: SPACING.md,
  },
  approvalIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FFFBEB",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  approvalTitle: { fontSize: 17, fontWeight: "800", color: COLORS.text, textAlign: "center" },
  approvalSub: { fontSize: 13, color: COLORS.textMuted, textAlign: "center", lineHeight: 19 },
  approvalInput: {
    width: "100%",
    height: 48,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  approvalRow: { flexDirection: "row", gap: SPACING.sm, width: "100%", marginTop: 4 },
  approvalCancel: {
    flex: 1,
    height: 46,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  approvalCancelText: { fontSize: 15, fontWeight: "700", color: COLORS.textSecondary },
  approvalConfirm: {
    flex: 1,
    height: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  approvalConfirmText: { fontSize: 15, fontWeight: "800", color: COLORS.white },
});
