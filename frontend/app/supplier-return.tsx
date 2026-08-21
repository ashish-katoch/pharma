import { useCallback, useState } from "react";
import { useDebounce } from "@/src/hooks/useDebounce";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal, FlatList,
  Platform,
  useWindowDimensions
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { alertMsg, alertNav } from "@/src/dialog";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { DatePicker } from "@/src/components/DatePicker";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type Supplier = { id: string; name: string; phone: string };
type Batch = { id: string; batch_no: string; expiry: string; quantity: number; mrp: number; purchase_price: number; medicine_id: string; medicine_name: string };

type ReturnLine = {
  medicine_id: string;
  medicine_name: string;
  batch_id: string;
  batch_no: string;
  quantity: number;
  purchase_price: number;
  reason: string;
  max_qty: number;
};

const REASONS = [
  { id: "expiry", label: "Expiry / Near-expiry" },
  { id: "damage", label: "Damaged / Broken" },
  { id: "quality", label: "Quality Issue" },
  { id: "excess", label: "Excess Ordering" },
  { id: "other", label: "Other" },
];

export default function SupplierReturn() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const router = useRouter();
  const [step, setStep] = useState<"supplier" | "batches" | "review">("supplier");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [supplierQ, setSupplierQ] = useState("");
  const [addingBatch, setAddingBatch] = useState<Batch | null>(null);
  const [addQty, setAddQty] = useState("1");
  const [addReason, setAddReason] = useState("expiry");

  const loadSuppliers = useCallback(async (q = "") => {
    setLoading(true);
    try {
      setSuppliers(await api<Supplier[]>(`/suppliers${q ? `?q=${encodeURIComponent(q)}` : ""}`));
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { loadSuppliers(); }, [loadSuppliers]));
  const debouncedLoadSuppliers = useDebounce(loadSuppliers);

  const loadBatches = async (s: Supplier) => {
    setSelectedSupplier(s);
    setLoading(true);
    try {
      const all = await api<Batch[]>(`/batches/by-supplier/${s.id}`);
      setBatches(all.filter((b) => b.quantity > 0));
      setLines([]);
      setStep("batches");
    } catch (e: any) {
      alertMsg("Error", e?.message || "Failed to load batches");
    } finally { setLoading(false); }
  };

  const openAddBatch = (b: Batch) => {
    setAddingBatch(b);
    setAddQty("1");
    setAddReason("expiry");
  };

  const confirmAddBatch = () => {
    if (!addingBatch) return;
    const qty = parseInt(addQty, 10);
    if (!qty || qty <= 0 || qty > addingBatch.quantity) {
      alertMsg("Invalid qty", `Enter 1–${addingBatch.quantity}`);
      return;
    }
    setLines((prev) => {
      const existing = prev.findIndex((l) => l.batch_id === addingBatch.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], quantity: qty, reason: addReason };
        return updated;
      }
      return [...prev, {
        medicine_id: addingBatch.medicine_id,
        medicine_name: addingBatch.medicine_name,
        batch_id: addingBatch.id,
        batch_no: addingBatch.batch_no,
        quantity: qty,
        purchase_price: addingBatch.purchase_price || addingBatch.mrp * 0.85,
        reason: addReason,
        max_qty: addingBatch.quantity,
      }];
    });
    setAddingBatch(null);
  };

  const removeLine = (batchId: string) => setLines((prev) => prev.filter((l) => l.batch_id !== batchId));

  const totalValue = lines.reduce((s, l) => s + l.quantity * l.purchase_price, 0);

  const submit = async () => {
    if (!selectedSupplier || lines.length === 0) return;
    setSaving(true);
    try {
      const result = await api<{ debit_note_no: string }>("/supplier-returns", {
        method: "POST",
        body: {
          supplier_id: selectedSupplier.id,
          supplier_name: selectedSupplier.name,
          return_date: returnDate,
          lines,
          notes,
        },
      });
      alertNav(
        "Return Submitted",
        `Debit Note ${result.debit_note_no} created for ${rupee(totalValue)}.\nStock has been added back.`,
        () => router.back()
      );
    } catch (e: any) {
      alertMsg("Error", e?.message || "Failed to submit return");
    } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={[styles.root, isDesktop && styles.rootDesktop]} edges={["top"]}>
      <View style={isDesktop ? styles.desktopCol : { flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => step === "supplier" ? router.back() : setStep(step === "review" ? "batches" : "supplier")} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>
          {step === "supplier" ? "Supplier Return" : step === "batches" ? selectedSupplier?.name ?? "" : "Review Return"}
        </Text>
        {step === "batches" && lines.length > 0 && (
          <TouchableOpacity onPress={() => setStep("review")} style={styles.nextBtn}>
            <Text style={styles.nextBtnText}>Review →</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Step indicators */}
      <View style={styles.stepRow}>
        {["Select Supplier", "Add Items", "Review"].map((s, i) => {
          const stepIdx = step === "supplier" ? 0 : step === "batches" ? 1 : 2;
          return (
            <View key={s} style={styles.stepItem}>
              <View style={[styles.stepDot, i <= stepIdx && styles.stepDotActive]}>
                <Text style={[styles.stepDotText, i <= stepIdx && { color: COLORS.white }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepLabel, i === stepIdx && { color: COLORS.primary }]}>{s}</Text>
            </View>
          );
        })}
      </View>

      {/* STEP 1: supplier */}
      {step === "supplier" && (
        <>
          <View style={styles.searchRow}>
            <Feather name="search" size={16} color={COLORS.textMuted} />
            <TextInput style={styles.searchInput} placeholder="Search supplier…" placeholderTextColor={COLORS.textMuted} value={supplierQ} onChangeText={(v) => { setSupplierQ(v); debouncedLoadSuppliers(v); }} />
          </View>
          {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} /> : (
            <FlatList
              data={suppliers}
              keyExtractor={(s) => s.id}
              contentContainerStyle={styles.list}
              ListEmptyComponent={<Text style={styles.empty}>No suppliers found. Add suppliers first.</Text>}
              renderItem={({ item: s }) => (
                <TouchableOpacity style={styles.card} onPress={() => loadBatches(s)}>
                  <View style={styles.avatar}><Feather name="truck" size={18} color={COLORS.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{s.name}</Text>
                    {s.phone ? <Text style={styles.cardMeta}>{s.phone}</Text> : null}
                  </View>
                  <Feather name="chevron-right" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            />
          )}
        </>
      )}

      {/* STEP 2: batches */}
      {step === "batches" && (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: 8, paddingBottom: 40 }}>
          {lines.length > 0 && (
            <View style={styles.addedBanner}>
              <Text style={styles.addedBannerText}>{lines.length} item{lines.length !== 1 ? "s" : ""} added · {rupee(totalValue)}</Text>
              <TouchableOpacity onPress={() => setStep("review")}>
                <Text style={{ color: COLORS.primary, fontWeight: "700", fontSize: 13 }}>Review →</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={styles.sectionLabel}>BATCHES IN STOCK</Text>
          {loading ? <ActivityIndicator color={COLORS.primary} /> : batches.length === 0 ? (
            <Text style={styles.empty}>No batches with stock found for this supplier.</Text>
          ) : batches.map((b) => {
            const already = lines.find((l) => l.batch_id === b.id);
            return (
              <View key={b.id} style={styles.batchCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName} numberOfLines={1}>{b.medicine_name}</Text>
                  <Text style={styles.cardMeta}>Batch {b.batch_no} · Exp {b.expiry} · Qty {b.quantity}</Text>
                </View>
                {already ? (
                  <TouchableOpacity style={styles.addedBadge} onPress={() => removeLine(b.id)}>
                    <Text style={styles.addedBadgeText}>{already.quantity} added ✕</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.addBtn} onPress={() => openAddBatch(b)}>
                    <Feather name="plus" size={16} color={COLORS.white} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* STEP 3: review */}
      {step === "review" && (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 80 }}>
          <View style={styles.summaryCard}>
            <Text style={styles.summarySupplier}>Return to: {selectedSupplier?.name}</Text>
            <Text style={styles.summaryAmount}>{rupee(totalValue)}</Text>
            <Text style={styles.summaryLabel}>{lines.length} item{lines.length !== 1 ? "s" : ""} · Debit Note will be generated</Text>
          </View>

          <DatePicker
            label="Return Date"
            value={returnDate}
            onChange={setReturnDate}
            maximumDate={new Date().toISOString().slice(0, 10)}
          />

          <Text style={styles.sectionLabel}>ITEMS</Text>
          {lines.map((l) => (
            <View key={l.batch_id} style={styles.reviewLine}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{l.medicine_name}</Text>
                <Text style={styles.cardMeta}>Batch {l.batch_no} · {REASONS.find((r) => r.id === l.reason)?.label}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.reviewQty}>{l.quantity} units</Text>
                <Text style={styles.reviewAmt}>{rupee(l.quantity * l.purchase_price)}</Text>
              </View>
            </View>
          ))}

          <View style={{ gap: 4 }}>
            <Text style={styles.fieldLabel}>Notes (optional)</Text>
            <TextInput style={[styles.field, { minHeight: 70, textAlignVertical: "top", paddingTop: 10 }]} value={notes} onChangeText={setNotes} multiline placeholder="Any remarks…" placeholderTextColor={COLORS.textMuted} />
          </View>

          <TouchableOpacity style={[styles.submitBtn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
            {saving ? <ActivityIndicator color={COLORS.white} /> : (
              <>
                <Feather name="send" size={18} color={COLORS.white} />
                <Text style={styles.submitBtnText}>Submit Return & Generate Debit Note</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Add batch qty modal */}
      <Modal visible={!!addingBatch} animationType="slide" transparent onRequestClose={() => setAddingBatch(null)}>
        <View style={styles.overlay}>
          <View style={styles.addSheet}>
            <View style={styles.addSheetHeader}>
              <Text style={styles.addSheetTitle}>Add to Return</Text>
              <TouchableOpacity onPress={() => setAddingBatch(null)}><Feather name="x" size={22} color={COLORS.text} /></TouchableOpacity>
            </View>
            <View style={{ padding: SPACING.lg, gap: SPACING.md }}>
              <Text style={styles.cardName}>{addingBatch?.medicine_name}</Text>
              <Text style={styles.cardMeta}>Batch {addingBatch?.batch_no} · In stock: {addingBatch?.quantity}</Text>
              <Text style={styles.fieldLabel}>QUANTITY TO RETURN</Text>
              <TextInput style={styles.field} value={addQty} onChangeText={setAddQty} keyboardType="numeric" />
              <Text style={styles.fieldLabel}>REASON</Text>
              <View style={styles.reasonRow}>
                {REASONS.map((r) => (
                  <TouchableOpacity key={r.id} style={[styles.reasonChip, addReason === r.id && styles.reasonChipActive]} onPress={() => setAddReason(r.id)}>
                    <Text style={[styles.reasonText, addReason === r.id && styles.reasonTextActive]}>{r.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.confirmBtn} onPress={confirmAddBatch}>
                <Text style={styles.confirmBtnText}>Add to Return</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  rootDesktop: { backgroundColor: "#F0F2F8" },
  desktopCol: {
    flex: 1,
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    backgroundColor: COLORS.surface,
  },
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.lg, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { flex: 1, fontSize: 17, fontWeight: "700", color: COLORS.text },
  nextBtn: { paddingHorizontal: SPACING.md, paddingVertical: 8, backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md },
  nextBtnText: { fontSize: 13, fontWeight: "700", color: COLORS.primary },
  stepRow: { flexDirection: "row", justifyContent: "space-around", padding: SPACING.md, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  stepItem: { alignItems: "center", gap: 4 },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  stepDotActive: { backgroundColor: COLORS.primary },
  stepDotText: { fontSize: 12, fontWeight: "800", color: COLORS.textMuted },
  stepLabel: { fontSize: 10, fontWeight: "700", color: COLORS.textMuted },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 6, margin: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.sm },
  searchInput: { flex: 1, height: 44, fontSize: 15, color: COLORS.text },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: 40, gap: 8 },
  empty: { textAlign: "center", color: COLORS.textMuted, marginTop: 40 },
  card: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.white, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  cardName: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  cardMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted },
  addedBanner: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: COLORS.successBg, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.success },
  addedBannerText: { fontSize: 13, fontWeight: "700", color: COLORS.success },
  batchCard: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.white, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  addBtn: { width: 32, height: 32, borderRadius: RADIUS.sm, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  addedBadge: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: COLORS.dangerBg, borderRadius: RADIUS.md },
  addedBadgeText: { fontSize: 12, fontWeight: "700", color: COLORS.danger },
  summaryCard: { backgroundColor: COLORS.text, borderRadius: RADIUS.lg, padding: SPACING.lg, gap: 6 },
  summarySupplier: { fontSize: 12, color: "#94A3B8", fontWeight: "600" },
  summaryAmount: { fontSize: 34, fontWeight: "900", color: COLORS.white, letterSpacing: -1 },
  summaryLabel: { fontSize: 12, color: "#94A3B8" },
  fieldLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.textSecondary },
  field: { minHeight: 46, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, backgroundColor: COLORS.surface, fontSize: 15, color: COLORS.text },
  reviewLine: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.white, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  reviewQty: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  reviewAmt: { fontSize: 12, color: COLORS.primary, fontWeight: "600", marginTop: 2 },
  submitBtn: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 16 },
  submitBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 15 },
  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.55)", justifyContent: "flex-end" },
  addSheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  addSheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  addSheetTitle: { fontSize: 17, fontWeight: "800", color: COLORS.text },
  reasonRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reasonChip: { paddingHorizontal: SPACING.sm, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  reasonChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  reasonText: { fontSize: 12, fontWeight: "600", color: COLORS.textSecondary },
  reasonTextActive: { color: COLORS.white },
  confirmBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 14, alignItems: "center" },
  confirmBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 15 },
});
