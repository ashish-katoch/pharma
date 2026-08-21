import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal,
  KeyboardAvoidingView, Platform, FlatList, Image,
} from "react-native";
import { PageShell } from "@/src/components/PageShell";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { api, getToken } from "@/src/api";
import { alertMsg, alertNav } from "@/src/dialog";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { DatePicker } from "@/src/components/DatePicker";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type Supplier = { id: string; name: string };
type MedResult = { id: string; name: string; strength: string; gst_rate: number; mrp: number };

type PurchaseLine = {
  medicine_id: string;
  medicine_name: string;
  batch_no: string;
  expiry: string;
  quantity: string;
  purchase_price: string;
  mrp: string;
  gst_rate: number;
  price_hint?: number;
};

export default function PurchaseNew() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState("cash");
  const [paidAmount, setPaidAmount] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [saving, setSaving] = useState(false);

  // Med search modal
  const [medModal, setMedModal] = useState(false);
  const [medQ, setMedQ] = useState("");
  const [medResults, setMedResults] = useState<MedResult[]>([]);
  const [medLoading, setMedLoading] = useState(false);

  // Supplier search
  const [suppModal, setSuppModal] = useState(false);
  const [suppQ, setSuppQ] = useState("");

  useEffect(() => {
    api<Supplier[]>("/suppliers").then(setSuppliers).catch(() => {});
  }, []);

  useEffect(() => {
    if (!medQ.trim()) { setMedResults([]); return; }
    setMedLoading(true);
    const t = setTimeout(() => {
      api<MedResult[]>(`/medicines?q=${encodeURIComponent(medQ)}`)
        .then(setMedResults)
        .catch(() => {})
        .finally(() => setMedLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [medQ]);

  async function addLine(med: MedResult) {
    let price_hint: number | undefined;
    if (supplierId) {
      try {
        const prices = await api<Array<{ medicine_id: string; purchase_price: number }>>(
          `/suppliers/${supplierId}/prices`
        );
        const match = prices.find((p) => p.medicine_id === med.id);
        if (match) price_hint = match.purchase_price;
      } catch {}
    }
    setLines((prev) => [...prev, {
      medicine_id: med.id,
      medicine_name: med.name,
      batch_no: "",
      expiry: "",
      quantity: "",
      purchase_price: price_hint != null ? String(price_hint) : "",
      mrp: String(med.mrp || ""),
      gst_rate: med.gst_rate,
      price_hint,
    }]);
    setMedModal(false);
    setMedQ("");
  }

  function updateLine(idx: number, key: keyof PurchaseLine, value: string) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [key]: value } : l));
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  const total = lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.purchase_price) || 0), 0);

  async function save() {
    if (lines.length === 0) { alertMsg("Empty", "Add at least one item"); return; }
    for (const l of lines) {
      if (!l.batch_no.trim() || !l.expiry.trim() || !l.quantity || !l.purchase_price) {
        alertMsg("Incomplete", `Fill all fields for ${l.medicine_name}`);
        return;
      }
      if (parseFloat(l.quantity) <= 0) {
        alertMsg("Invalid quantity", `Quantity must be greater than 0 for ${l.medicine_name}`);
        return;
      }
      if (parseFloat(l.purchase_price) <= 0) {
        alertMsg("Invalid price", `Purchase price must be greater than 0 for ${l.medicine_name}`);
        return;
      }
    }
    setSaving(true);
    try {
      await api("/purchases", {
        method: "POST",
        body: {
          supplier_id: supplierId || null,
          supplier_name: supplierName || null,
          invoice_no: invoiceNo,
          invoice_date: invoiceDate,
          payment_mode: paymentMode,
          paid_amount: parseFloat(paidAmount) || 0,
          invoice_doc_url: invoiceDocUrl || null,
          lines: lines.map((l) => ({
            medicine_id: l.medicine_id,
            medicine_name: l.medicine_name,
            batch_no: l.batch_no,
            expiry: l.expiry,
            quantity: parseInt(l.quantity),
            purchase_price: parseFloat(l.purchase_price),
            mrp: parseFloat(l.mrp) || 0,
            gst_rate: l.gst_rate,
          })),
        },
      });
      alertNav("Done", "Purchase recorded. Stock updated.", () => router.back());
    } catch (e: any) {
      alertMsg("Error", e?.message || "Save failed");
    } finally { setSaving(false); }
  }

  const [invoiceDocUrl, setInvoiceDocUrl] = useState<string | null>(null);
  const [invoiceUploading, setInvoiceUploading] = useState(false);
  const [invoiceLocalUri, setInvoiceLocalUri] = useState<string | null>(null);

  const uploadFile = async (uri: string, name: string, mimeType: string) => {
    const token = await getToken();
    const base = process.env.EXPO_PUBLIC_BACKEND_URL;
    const fd = new FormData();
    fd.append("file", { uri, name, type: mimeType } as any);
    const res = await fetch(`${base}/api/uploads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return data.url as string;
  };

  const attachInvoice = () => {
    Alert.alert("Attach Invoice", "Choose source", [
      {
        text: "Take Photo",
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") { alertMsg("Permission denied", "Camera access is required"); return; }
          const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
          if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            setInvoiceLocalUri(asset.uri);
            setInvoiceUploading(true);
            try {
              const url = await uploadFile(asset.uri, "invoice.jpg", "image/jpeg");
              setInvoiceDocUrl(url);
            } catch { alertMsg("Upload failed", "Could not upload photo"); } finally { setInvoiceUploading(false); }
          }
        },
      },
      {
        text: "Photo Library",
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== "granted") { alertMsg("Permission denied", "Photo library access is required"); return; }
          const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsEditing: false });
          if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            setInvoiceLocalUri(asset.uri);
            setInvoiceUploading(true);
            try {
              const url = await uploadFile(asset.uri, "invoice.jpg", asset.mimeType || "image/jpeg");
              setInvoiceDocUrl(url);
            } catch { alertMsg("Upload failed", "Could not upload image"); } finally { setInvoiceUploading(false); }
          }
        },
      },
      {
        text: "PDF / Document",
        onPress: async () => {
          const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"] });
          if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            setInvoiceLocalUri(asset.uri);
            setInvoiceUploading(true);
            try {
              const url = await uploadFile(asset.uri, asset.name, asset.mimeType || "application/pdf");
              setInvoiceDocUrl(url);
            } catch { alertMsg("Upload failed", "Could not upload document"); } finally { setInvoiceUploading(false); }
          }
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const filteredSupps = suppliers.filter((s) => s.name.toLowerCase().includes(suppQ.toLowerCase()));

  return (
    <PageShell title="New Purchase" showBack scrollable={false} noPadding>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Supplier */}
        <Text style={styles.sectionLabel}>SUPPLIER</Text>
        <TouchableOpacity style={styles.pickerRow} onPress={() => { setSuppQ(""); setSuppModal(true); }}>
          <Feather name="truck" size={16} color={COLORS.textMuted} />
          <Text style={[styles.pickerText, supplierId && { color: COLORS.text }]}>
            {supplierId ? supplierName : "Select supplier (optional)"}
          </Text>
          <Feather name="chevron-down" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>

        {/* Invoice details */}
        <Text style={styles.sectionLabel}>INVOICE DETAILS</Text>
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Invoice No.</Text>
            <TextInput style={styles.field} value={invoiceNo} onChangeText={setInvoiceNo} placeholder="INV-001" placeholderTextColor={COLORS.textMuted} />
          </View>
          <DatePicker label="DATE" value={invoiceDate} onChange={setInvoiceDate} half />
        </View>

        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Payment</Text>
            <View style={styles.modeRow}>
              {["cash", "credit", "upi"].map((m) => (
                <TouchableOpacity key={m} style={[styles.modeChip, paymentMode === m && styles.modeChipActive]} onPress={() => setPaymentMode(m)}>
                  <Text style={[styles.modeChipText, paymentMode === m && styles.modeChipTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Paid (₹)</Text>
            <TextInput style={styles.field} value={paidAmount} onChangeText={setPaidAmount} keyboardType="numeric" placeholder="0" placeholderTextColor={COLORS.textMuted} />
          </View>
        </View>

        {/* Lines */}
        <View style={styles.linesHeader}>
          <Text style={styles.sectionLabel}>ITEMS ({lines.length})</Text>
          <TouchableOpacity style={styles.addLineBtn} onPress={() => setMedModal(true)}>
            <Feather name="plus" size={14} color={COLORS.white} />
            <Text style={styles.addLineBtnText}>Add Item</Text>
          </TouchableOpacity>
        </View>

        {lines.map((l, idx) => (
          <View key={idx} style={styles.lineCard}>
            <View style={styles.lineHeader}>
              <Text style={styles.lineName} numberOfLines={1}>{l.medicine_name}</Text>
              <TouchableOpacity onPress={() => removeLine(idx)}>
                <Feather name="x" size={18} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Batch No. *</Text>
                <TextInput style={styles.field} value={l.batch_no} onChangeText={(v) => updateLine(idx, "batch_no", v)} placeholder="B001" placeholderTextColor={COLORS.textMuted} autoCapitalize="characters" />
              </View>
              <DatePicker label="EXPIRY *" value={l.expiry} onChange={(v) => updateLine(idx, "expiry", v)} half minimumDate={new Date().toISOString().slice(0, 10)} />
            </View>
            <View style={styles.row3}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Qty *</Text>
                <TextInput style={styles.field} value={l.quantity} onChangeText={(v) => updateLine(idx, "quantity", v)} keyboardType="numeric" placeholder="0" placeholderTextColor={COLORS.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>
                  Cost ₹ *{l.price_hint != null ? ` (last: ₹${l.price_hint})` : ""}
                </Text>
                <TextInput style={styles.field} value={l.purchase_price} onChangeText={(v) => updateLine(idx, "purchase_price", v)} keyboardType="numeric" placeholder="0.00" placeholderTextColor={COLORS.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>MRP ₹</Text>
                <TextInput style={styles.field} value={l.mrp} onChangeText={(v) => updateLine(idx, "mrp", v)} keyboardType="numeric" placeholder="0.00" placeholderTextColor={COLORS.textMuted} />
              </View>
            </View>
          </View>
        ))}

        {lines.length === 0 && (
          <Text style={styles.emptyHint}>Tap "Add Item" to add medicines to this purchase.</Text>
        )}

        {lines.length > 0 && (
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>TOTAL PURCHASE VALUE</Text>
            <Text style={styles.totalValue}>{rupee(total)}</Text>
          </View>
        )}

        {/* Invoice attachment */}
        <Text style={styles.sectionLabel}>INVOICE DOCUMENT (OPTIONAL)</Text>
        {invoiceDocUrl || invoiceLocalUri ? (
          <View style={styles.attachedRow}>
            {invoiceLocalUri && invoiceLocalUri.match(/\.(jpe?g|png|webp)/i) ? (
              <Image source={{ uri: invoiceLocalUri }} style={styles.attachThumb} resizeMode="cover" />
            ) : (
              <View style={styles.attachThumb}>
                <Feather name="file-text" size={28} color={COLORS.primary} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.attachLabel}>
                {invoiceUploading ? "Uploading…" : invoiceDocUrl ? "Attached" : "Pending upload"}
              </Text>
              {invoiceUploading && <ActivityIndicator size="small" color={COLORS.primary} />}
            </View>
            <TouchableOpacity onPress={() => { setInvoiceDocUrl(null); setInvoiceLocalUri(null); }}>
              <Feather name="x" size={20} color={COLORS.danger} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.attachBtn} onPress={attachInvoice} disabled={invoiceUploading}>
            <Feather name="paperclip" size={18} color={COLORS.primary} />
            <Text style={styles.attachBtnText}>Attach Photo / PDF</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.saveBtn, (saving || lines.length === 0) && { opacity: 0.6 }]} onPress={save} disabled={saving || lines.length === 0}>
          {saving ? <ActivityIndicator color={COLORS.white} /> : (
            <>
              <Feather name="check-circle" size={18} color={COLORS.white} />
              <Text style={styles.saveBtnText}>Save Purchase · {rupee(total)}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Supplier picker */}
      <Modal visible={suppModal} animationType="slide" transparent onRequestClose={() => setSuppModal(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { maxHeight: "60%" }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select Supplier</Text>
              <TouchableOpacity onPress={() => setSuppModal(false)}><Feather name="x" size={24} color={COLORS.text} /></TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm }}>
              <TextInput style={styles.field} value={suppQ} onChangeText={setSuppQ} placeholder="Search…" placeholderTextColor={COLORS.textMuted} autoFocus />
            </View>
            <FlatList
              data={filteredSupps}
              keyExtractor={(s) => s.id}
              contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: 20, gap: 8 }}
              ListEmptyComponent={<Text style={{ color: COLORS.textMuted, textAlign: "center", marginTop: 20 }}>No suppliers. Add one first.</Text>}
              renderItem={({ item: s }) => (
                <TouchableOpacity style={styles.suppRow} onPress={() => { setSupplierId(s.id); setSupplierName(s.name); setSuppModal(false); }}>
                  <Text style={{ fontSize: 15, color: COLORS.text }}>{s.name}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Medicine picker */}
      <Modal visible={medModal} animationType="slide" transparent onRequestClose={() => setMedModal(false)}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.sheet, { maxHeight: "70%" }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Search Medicine</Text>
              <TouchableOpacity onPress={() => { setMedModal(false); setMedQ(""); }}><Feather name="x" size={24} color={COLORS.text} /></TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm }}>
              <TextInput style={styles.field} value={medQ} onChangeText={setMedQ} placeholder="Type medicine name…" placeholderTextColor={COLORS.textMuted} autoFocus />
            </View>
            {medLoading ? (
              <ActivityIndicator style={{ marginTop: 20 }} color={COLORS.primary} />
            ) : (
              <FlatList
                data={medResults}
                keyExtractor={(m) => m.id}
                contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: 20, gap: 8 }}
                ListEmptyComponent={medQ.length > 1 ? <Text style={{ color: COLORS.textMuted, textAlign: "center", marginTop: 20 }}>No results</Text> : null}
                renderItem={({ item: m }) => (
                  <TouchableOpacity style={styles.medRow} onPress={() => addLine(m)}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: COLORS.text }}>{m.name}</Text>
                      {m.strength ? <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>{m.strength}</Text> : null}
                    </View>
                    <Text style={{ fontSize: 13, color: COLORS.textMuted }}>MRP {rupee(m.mrp)}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: SPACING.lg, paddingBottom: 60, gap: SPACING.sm },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: 4, marginBottom: 2 },
  pickerRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.white, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  pickerText: { flex: 1, fontSize: 15, color: COLORS.textMuted },
  row2: { flexDirection: "row", gap: SPACING.sm },
  row3: { flexDirection: "row", gap: SPACING.sm },
  fieldLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, color: COLORS.textSecondary, marginBottom: 3 },
  field: { minHeight: 44, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm, backgroundColor: COLORS.white, fontSize: 14, color: COLORS.text },
  modeRow: { flexDirection: "row", gap: 4, marginTop: 3 },
  modeChip: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  modeChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  modeChipText: { fontSize: 11, fontWeight: "700", color: COLORS.textSecondary },
  modeChipTextActive: { color: COLORS.white },
  linesHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SPACING.sm },
  addLineBtn: { flexDirection: "row", gap: 4, alignItems: "center", backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.md },
  addLineBtnText: { color: COLORS.white, fontWeight: "700", fontSize: 13 },
  lineCard: { backgroundColor: COLORS.white, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm },
  lineHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  lineName: { flex: 1, fontSize: 14, fontWeight: "700", color: COLORS.text },
  emptyHint: { color: COLORS.textMuted, fontSize: 13, textAlign: "center", marginVertical: SPACING.xl },
  totalCard: { backgroundColor: COLORS.primaryLight, padding: SPACING.lg, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary, alignItems: "center" },
  totalLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2, color: COLORS.primary },
  totalValue: { fontSize: 24, fontWeight: "800", color: COLORS.primary, marginTop: 4 },
  saveBtn: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 16 },
  saveBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 16 },
  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  suppRow: { padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  medRow: { flexDirection: "row", alignItems: "center", padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  attachBtn: {
    flexDirection: "row",
    gap: SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderStyle: "dashed" as const,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    backgroundColor: COLORS.primaryLight,
  },
  attachBtnText: { fontSize: 14, fontWeight: "700", color: COLORS.primary },
  attachedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.sm,
  },
  attachThumb: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  attachLabel: { fontSize: 13, fontWeight: "700", color: COLORS.text },
});
