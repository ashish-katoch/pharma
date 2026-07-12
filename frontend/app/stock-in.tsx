import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Medicine } from "@/src/cart";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

type Mode = "select" | "new-medicine" | "add-batch";

export default function StockIn() {
  const router = useRouter();
  const params = useLocalSearchParams<{ medicineId?: string }>();
  const [mode, setMode] = useState<Mode>(params.medicineId ? "add-batch" : "select");
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Medicine | null>(null);
  const [saving, setSaving] = useState(false);

  // batch form
  const [batchNo, setBatchNo] = useState("");
  const [expiry, setExpiry] = useState("");
  const [qty, setQty] = useState("");
  const [mrp, setMrp] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");

  // new medicine form
  const [nm, setNm] = useState({
    name: "",
    brand: "",
    generic: "",
    strength: "",
    pack: "",
    hsn: "3004",
    schedule: "OTC",
    mrp: "",
    reorder_level: "10",
    gst_rate: "12",
  });

  useEffect(() => {
    (async () => {
      const items = await api<Medicine[]>(`/medicines${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      setMedicines(items);
      if (params.medicineId) {
        const m = items.find((x) => x.id === params.medicineId);
        if (m) setSelected(m);
      }
    })();
  }, [q, params.medicineId]);

  const chooseMedicine = (m: Medicine) => {
    setSelected(m);
    setMrp(String(m.mrp));
    setMode("add-batch");
  };

  const saveBatch = async () => {
    if (!selected) return;
    if (!batchNo.trim()) return Alert.alert("Batch #", "Enter batch number");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return Alert.alert("Expiry", "Use YYYY-MM-DD");
    const q1 = parseInt(qty, 10);
    if (!q1 || q1 <= 0) return Alert.alert("Quantity", "Enter a positive quantity");
    const m1 = parseFloat(mrp);
    if (!m1 || m1 <= 0) return Alert.alert("MRP", "Enter MRP");
    setSaving(true);
    try {
      await api("/batches", {
        method: "POST",
        body: {
          medicine_id: selected.id,
          batch_no: batchNo.trim(),
          expiry,
          quantity: q1,
          mrp: m1,
          purchase_price: parseFloat(purchasePrice) || 0,
        },
      });
      Alert.alert("Stock added", `${q1} units of ${selected.name} added.`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "");
    } finally {
      setSaving(false);
    }
  };

  const saveNewMedicine = async () => {
    if (!nm.name.trim()) return Alert.alert("Name", "Enter medicine name");
    setSaving(true);
    try {
      const created = await api<Medicine>("/medicines", {
        method: "POST",
        body: {
          ...nm,
          mrp: parseFloat(nm.mrp) || 0,
          reorder_level: parseInt(nm.reorder_level, 10) || 10,
          gst_rate: parseFloat(nm.gst_rate) || 12,
        },
      });
      setSelected(created);
      setMrp(String(created.mrp));
      setMode("add-batch");
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="stock-in-back">
          <Feather name="x" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Stock In</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md }} keyboardShouldPersistTaps="handled">
          {mode === "select" && (
            <>
              <Text style={styles.stepLabel}>STEP 1 · Pick a medicine</Text>
              <View style={styles.searchBox}>
                <Feather name="search" size={18} color={COLORS.textMuted} />
                <TextInput
                  testID="stock-in-search"
                  style={styles.searchInput}
                  placeholder="Search or add new"
                  placeholderTextColor={COLORS.textMuted}
                  value={q}
                  onChangeText={setQ}
                />
              </View>

              <TouchableOpacity
                testID="stock-in-new-medicine"
                style={styles.newMedBtn}
                onPress={() => setMode("new-medicine")}
              >
                <Feather name="plus-circle" size={22} color={COLORS.primary} />
                <Text style={styles.newMedText}>Add new medicine</Text>
                <Feather name="chevron-right" size={20} color={COLORS.primary} />
              </TouchableOpacity>

              {medicines.slice(0, 50).map((m) => (
                <TouchableOpacity
                  key={m.id}
                  testID={`stock-in-select-${m.id}`}
                  style={styles.medRow}
                  onPress={() => chooseMedicine(m)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.medName}>{m.name}</Text>
                    <Text style={styles.medMeta}>{m.brand} · Stock {m.total_stock}</Text>
                  </View>
                  <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
                </TouchableOpacity>
              ))}
            </>
          )}

          {mode === "new-medicine" && (
            <>
              <TouchableOpacity onPress={() => setMode("select")} style={styles.backLink}>
                <Feather name="chevron-left" size={18} color={COLORS.primary} />
                <Text style={{ color: COLORS.primary, fontWeight: "700" }}>Back</Text>
              </TouchableOpacity>
              <Text style={styles.stepLabel}>NEW MEDICINE</Text>
              <Field label="Name *" value={nm.name} onChange={(v) => setNm({ ...nm, name: v })} testID="new-med-name" />
              <Field label="Brand" value={nm.brand} onChange={(v) => setNm({ ...nm, brand: v })} testID="new-med-brand" />
              <Field label="Generic" value={nm.generic} onChange={(v) => setNm({ ...nm, generic: v })} testID="new-med-generic" />
              <Row2>
                <Field label="Strength" value={nm.strength} onChange={(v) => setNm({ ...nm, strength: v })} half testID="new-med-strength" />
                <Field label="Pack" value={nm.pack} onChange={(v) => setNm({ ...nm, pack: v })} half testID="new-med-pack" />
              </Row2>
              <Row2>
                <Field label="HSN" value={nm.hsn} onChange={(v) => setNm({ ...nm, hsn: v })} half testID="new-med-hsn" />
                <Field label="Schedule" value={nm.schedule} onChange={(v) => setNm({ ...nm, schedule: v })} half testID="new-med-schedule" />
              </Row2>
              <Row2>
                <Field label="MRP ₹" value={nm.mrp} onChange={(v) => setNm({ ...nm, mrp: v })} half keyboardType="decimal-pad" testID="new-med-mrp" />
                <Field label="Reorder level" value={nm.reorder_level} onChange={(v) => setNm({ ...nm, reorder_level: v })} half keyboardType="numeric" testID="new-med-reorder" />
              </Row2>
              <Field label="GST %" value={nm.gst_rate} onChange={(v) => setNm({ ...nm, gst_rate: v })} keyboardType="decimal-pad" testID="new-med-gst" />
              <TouchableOpacity
                testID="new-med-save"
                style={styles.primaryBtn}
                onPress={saveNewMedicine}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color={COLORS.white} /> : (
                  <Text style={styles.primaryBtnText}>Continue → Add batch</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {mode === "add-batch" && selected && (
            <>
              <TouchableOpacity onPress={() => { setMode("select"); setSelected(null); }} style={styles.backLink}>
                <Feather name="chevron-left" size={18} color={COLORS.primary} />
                <Text style={{ color: COLORS.primary, fontWeight: "700" }}>Change medicine</Text>
              </TouchableOpacity>
              <View style={styles.selectedCard}>
                <Feather name="package" size={22} color={COLORS.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.selName}>{selected.name}</Text>
                  <Text style={styles.selMeta}>{selected.brand} · Stock {selected.total_stock}</Text>
                </View>
              </View>
              <Text style={styles.stepLabel}>NEW BATCH</Text>
              <Field label="Batch number" value={batchNo} onChange={setBatchNo} testID="batch-no" />
              <Field label="Expiry (YYYY-MM-DD)" value={expiry} onChange={setExpiry} placeholder="2027-12-31" testID="batch-expiry" />
              <Row2>
                <Field label="Quantity" value={qty} onChange={setQty} half keyboardType="numeric" testID="batch-qty" />
                <Field label="MRP ₹" value={mrp} onChange={setMrp} half keyboardType="decimal-pad" testID="batch-mrp" />
              </Row2>
              <Field label="Purchase price ₹ (optional)" value={purchasePrice} onChange={setPurchasePrice} keyboardType="decimal-pad" testID="batch-purchase" />
              <TouchableOpacity
                testID="batch-save"
                style={styles.primaryBtn}
                onPress={saveBatch}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color={COLORS.white} /> : (
                  <>
                    <Feather name="check" size={20} color={COLORS.white} />
                    <Text style={styles.primaryBtnText}>Save Batch</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, keyboardType, half, testID, placeholder }: any) {
  return (
    <View style={{ gap: 6, flex: half ? 1 : undefined }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        style={styles.field}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
      />
    </View>
  );
}

function Row2({ children }: any) {
  return <View style={{ flexDirection: "row", gap: SPACING.md }}>{children}</View>;
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
  title: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  stepLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: 4 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    minHeight: 52,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: COLORS.text },
  newMedBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.lg,
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: "dashed",
  },
  newMedText: { flex: 1, fontSize: 15, fontWeight: "700", color: COLORS.primary },
  medRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  medName: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  medMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  backLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  selectedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.md,
  },
  selName: { fontSize: 15, fontWeight: "800", color: COLORS.text },
  selMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  fieldLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.textSecondary },
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.white,
    fontSize: 15,
    color: COLORS.text,
  },
  primaryBtn: {
    minHeight: 56,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: SPACING.md,
  },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
});
