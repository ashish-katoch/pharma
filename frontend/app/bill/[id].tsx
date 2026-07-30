import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { api } from "@/src/api";
import { confirmDestructive } from "@/src/confirm";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { buildReceiptText, sendOnWhatsApp } from "@/src/whatsapp";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type Bill = {
  id: string;
  bill_no: string;
  customer_name: string;
  customer_phone: string;
  lines: any[];
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
};

type Shop = {
  name: string;
  address: string;
  phone: string;
  gstin: string;
  dl_no: string;
};

export default function BillDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [bill, setBill] = useState<Bill | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([api<Bill>(`/bills/${id}`), api<Shop>("/shop")]);
      setBill(b);
      setShop(s);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  const buildHtml = (): string => {
    if (!bill || !shop) return "";
    const rows = bill.lines
      .map((l, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>
            <strong>${l.medicine_name}</strong> ${l.strength ? "· " + l.strength : ""}
            <div class="muted">B:${l.batch_no} · Exp ${l.expiry}</div>
          </td>
          <td>${l.hsn || ""}</td>
          <td class="right">${l.quantity}</td>
          <td class="right">₹${l.mrp.toFixed(2)}</td>
          <td class="right">${l.discount_pct || 0}%</td>
          <td class="right">${l.gst_rate}%</td>
          <td class="right">₹${l.line_total.toFixed(2)}</td>
        </tr>`)
      .join("");
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>${bill.bill_no}</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial; color: #0F172A; padding: 24px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .row { display: flex; justify-content: space-between; align-items: flex-start; }
  .muted { color: #64748B; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th { text-align: left; padding: 8px 6px; border-bottom: 2px solid #0F172A; font-size: 11px; }
  td { padding: 8px 6px; border-bottom: 1px solid #E2E8F0; font-size: 11px; vertical-align: top; }
  .right { text-align: right; }
  .totals { margin-top: 16px; width: 260px; margin-left: auto; }
  .totals div { display: flex; justify-content: space-between; padding: 3px 0; }
  .grand { border-top: 2px solid #0F172A; padding-top: 6px !important; font-size: 15px; font-weight: 800; }
  .cancelled { color: #EF4444; font-weight: 800; font-size: 24px; text-align: center; margin: 20px 0; }
</style></head><body>
  <div class="row">
    <div>
      <h1>${shop.name}</h1>
      <div>${shop.address}</div>
      <div class="muted">GSTIN: ${shop.gstin} · DL: ${shop.dl_no} · ${shop.phone}</div>
    </div>
    <div style="text-align: right">
      <h1>TAX INVOICE</h1>
      <div><strong>${bill.bill_no}</strong></div>
      <div class="muted">${new Date(bill.created_at).toLocaleString("en-IN")}</div>
    </div>
  </div>
  ${bill.status === "cancelled" ? '<div class="cancelled">— CANCELLED —</div>' : ""}
  <div class="row" style="margin-top:16px">
    <div><strong>Customer:</strong> ${bill.customer_name || "Walk-in"} ${bill.customer_phone ? "· " + bill.customer_phone : ""}</div>
    <div><strong>Payment:</strong> ${bill.payment_mode.toUpperCase()}</div>
  </div>
  <table>
    <thead><tr>
      <th>#</th><th>Medicine</th><th>HSN</th>
      <th class="right">Qty</th><th class="right">MRP</th>
      <th class="right">Disc</th><th class="right">GST</th><th class="right">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>₹${bill.subtotal.toFixed(2)}</span></div>
    <div><span>Discount</span><span>- ₹${bill.total_discount.toFixed(2)}</span></div>
    <div><span>Taxable</span><span>₹${bill.taxable_total.toFixed(2)}</span></div>
    <div><span>CGST</span><span>₹${bill.cgst_total.toFixed(2)}</span></div>
    <div><span>SGST</span><span>₹${bill.sgst_total.toFixed(2)}</span></div>
    <div class="grand"><span>Grand Total</span><span>₹${bill.grand_total.toFixed(2)}</span></div>
  </div>
  <div class="muted" style="margin-top: 40px; text-align: center">Generated by Pharma Counter · Thank you for your visit</div>
</body></html>`;
  };

  const sharePdf = async () => {
    try {
      const html = buildHtml();
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { UTI: ".pdf", mimeType: "application/pdf" });
      } else {
        Alert.alert("Ready", "PDF generated: " + uri);
      }
    } catch (e: any) {
      Alert.alert("Share failed", e?.message || "");
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

  if (loading || !bill) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="bill-back">
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{bill.bill_no}</Text>
        <TouchableOpacity onPress={sharePdf} testID="bill-share">
          <Feather name="share" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

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
          <Text style={styles.metaValue}>{bill.created_by}</Text>
        </View>

        <Text style={styles.sectionTitle}>Items ({bill.lines.length})</Text>
        {bill.lines.map((l: any, i: number) => (
          <View key={i} style={styles.lineCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineName}>{l.medicine_name} {l.strength ? `· ${l.strength}` : ""}</Text>
              <Text style={styles.lineMeta}>B: {l.batch_no} · Exp {l.expiry} · HSN {l.hsn}</Text>
              <Text style={styles.lineMeta}>{rupee(l.mrp)} × {l.quantity} {l.discount_pct ? `· ${l.discount_pct}% off` : ""}</Text>
            </View>
            <Text style={styles.lineAmt}>{rupee(l.line_total)}</Text>
          </View>
        ))}

        <View style={styles.totalsCard}>
          <Row label="Subtotal" value={rupee(bill.subtotal)} />
          <Row label="Discount" value={`- ${rupee(bill.total_discount)}`} tone="warning" />
          <Row label="Taxable value" value={rupee(bill.taxable_total)} muted />
          <Row label="CGST" value={rupee(bill.cgst_total)} muted />
          <Row label="SGST" value={rupee(bill.sgst_total)} muted />
          <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 8 }} />
          <Row label="GRAND TOTAL" value={rupee(bill.grand_total)} big />
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          testID="bill-share-btn"
          style={styles.secBtn}
          onPress={sharePdf}
        >
          <Feather name="share-2" size={18} color={COLORS.primary} />
          <Text style={styles.secBtnText}>PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="bill-whatsapp-btn"
          style={styles.waBtn}
          onPress={shareWhatsApp}
        >
          <Feather name="message-circle" size={18} color="#25D366" />
          <Text style={styles.waBtnText}>WhatsApp</Text>
        </TouchableOpacity>
        {bill.status === "active" && (
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
      </View>
    </SafeAreaView>
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
  totalsCard: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bottomBar: {
    flexDirection: "row",
    gap: SPACING.md,
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  secBtn: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  secBtnText: { color: COLORS.primary, fontWeight: "800" },
  waBtn: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "#25D366",
    backgroundColor: "#F0FFF4",
  },
  waBtnText: { color: "#128C4B", fontWeight: "800" },
  cancelBtn: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.danger,
  },
  cancelBtnText: { color: COLORS.white, fontWeight: "800" },
});
