import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, FlatList, Modal,
  KeyboardAvoidingView, Platform, useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { alertMsg, alertNav } from "@/src/dialog";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

type Medicine = { id: string; name: string; strength: string };
type Batch = { id: string; batch_no: string; expiry: string; quantity: number; medicine_id: string };

const REASONS = [
  { key: "expiry_writeoff", label: "Expiry Write-off", icon: "calendar" as const, color: COLORS.danger },
  { key: "damage", label: "Damage / Breakage", icon: "alert-triangle" as const, color: COLORS.warning },
  { key: "theft", label: "Theft / Loss", icon: "eye-off" as const, color: COLORS.danger },
  { key: "correction", label: "Stock Correction", icon: "edit-2" as const, color: COLORS.info },
  { key: "other", label: "Other", icon: "more-horizontal" as const, color: COLORS.textMuted },
];

export default function StockAdjust() {
  const router = useRouter();
  const [step, setStep] = useState<"medicine" | "batch" | "details">("medicine");
  const [medQ, setMedQ] = useState("");
  const [medResults, setMedResults] = useState<Medicine[]>([]);
  const [medLoading, setMedLoading] = useState(false);
  const [selectedMed, setSelectedMed] = useState<Medicine | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [reason, setReason] = useState("");
  const [changeStr, setChangeStr] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  useEffect(() => {
    if (!medQ.trim()) { setMedResults([]); return; }
    setMedLoading(true);
    const t = setTimeout(() => {
      api<Medicine[]>(`/medicines?q=${encodeURIComponent(medQ)}`)
        .then(setMedResults)
        .catch(() => {})
        .finally(() => setMedLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [medQ]);

  async function selectMed(m: Medicine) {
    setSelectedMed(m);
    try {
      const data = await api<Batch[]>(`/batches?medicine_id=${m.id}`);
      setBatches(data.filter((b) => b.quantity > 0));
    } catch { setBatches([]); }
    setStep("batch");
  }

  function selectBatch(b: Batch) {
    setSelectedBatch(b);
    setStep("details");
  }

  async function save() {
    const change = parseInt(changeStr);
    if (!reason) { alertMsg("Required", "Select a reason"); return; }
    if (!changeStr || isNaN(change) || change === 0) { alertMsg("Required", "Enter a non-zero quantity change"); return; }

    const isWriteOff = reason !== "correction";
    const finalChange = isWriteOff ? -Math.abs(change) : change;

    if (isWriteOff && Math.abs(finalChange) > (selectedBatch?.quantity ?? 0)) {
      alertMsg("Insufficient", `Only ${selectedBatch?.quantity} units available`);
      return;
    }

    setSaving(true);
    try {
      await api("/adjustments", {
        method: "POST",
        body: {
          medicine_id: selectedMed!.id,
          medicine_name: selectedMed!.name,
          batch_id: selectedBatch!.id,
          batch_no: selectedBatch!.batch_no,
          change: finalChange,
          reason,
          notes,
        },
      });
      alertNav("Done", `Stock adjusted by ${finalChange > 0 ? "+" : ""}${finalChange} units.`, () => router.back());
    } catch (e: any) {
      alertMsg("Error", e?.message || "Adjustment failed");
    } finally { setSaving(false); }
  }

  return (
    <SafeAreaView style={[styles.root, isDesktop && styles.rootDesktop]} edges={["top"]}>
      <View style={isDesktop ? styles.desktopCol : { flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { if (step === "medicine") router.back(); else if (step === "batch") setStep("medicine"); else setStep("batch"); }} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Stock Adjustment</Text>
      </View>

      {/* Steps indicator */}
      <View style={styles.stepsRow}>
        {["Medicine", "Batch", "Details"].map((s, i) => {
          const stepKey = ["medicine", "batch", "details"][i];
          const active = step === stepKey;
          const done = (step === "batch" && i === 0) || (step === "details" && i <= 1);
          return (
            <View key={s} style={styles.stepItem}>
              <View style={[styles.stepDot, done && styles.stepDotDone, active && styles.stepDotActive]}>
                {done ? <Feather name="check" size={12} color={COLORS.white} /> : <Text style={[styles.stepNum, active && { color: COLORS.white }]}>{i + 1}</Text>}
              </View>
              <Text style={[styles.stepLabel, active && { color: COLORS.primary, fontWeight: "700" }]}>{s}</Text>
            </View>
          );
        })}
      </View>

      {step === "medicine" && (
        <View style={{ flex: 1 }}>
          <View style={styles.searchRow}>
            <Feather name="search" size={16} color={COLORS.textMuted} />
            <TextInput style={styles.searchInput} value={medQ} onChangeText={setMedQ} placeholder="Search medicine…" placeholderTextColor={COLORS.textMuted} autoFocus />
          </View>
          {medLoading ? <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} /> : (
            <FlatList
              data={medResults}
              keyExtractor={(m) => m.id}
              contentContainerStyle={{ padding: SPACING.lg, gap: 8 }}
              ListEmptyComponent={medQ.length > 0 ? <Text style={styles.empty}>No results</Text> : <Text style={styles.empty}>Type to search medicines</Text>}
              renderItem={({ item: m }) => (
                <TouchableOpacity style={styles.card} onPress={() => selectMed(m)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.medName}>{m.name}</Text>
                    {m.strength ? <Text style={styles.medMeta}>{m.strength}</Text> : null}
                  </View>
                  <Feather name="chevron-right" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

      {step === "batch" && selectedMed && (
        <View style={{ flex: 1 }}>
          <View style={styles.selCard}>
            <Text style={styles.selLabel}>Medicine</Text>
            <Text style={styles.selValue}>{selectedMed.name}</Text>
          </View>
          {batches.length === 0 ? (
            <Text style={[styles.empty, { marginTop: 40 }]}>No active batches with stock</Text>
          ) : (
            <FlatList
              data={batches}
              keyExtractor={(b) => b.id}
              contentContainerStyle={{ padding: SPACING.lg, gap: 8 }}
              renderItem={({ item: b }) => (
                <TouchableOpacity style={styles.card} onPress={() => selectBatch(b)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.medName}>Batch {b.batch_no}</Text>
                    <Text style={styles.medMeta}>Exp: {b.expiry} · {b.quantity} units</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

      {step === "details" && selectedMed && selectedBatch && (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md }} keyboardShouldPersistTaps="handled">
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLine}>{selectedMed.name}</Text>
            <Text style={styles.summaryMeta}>Batch {selectedBatch.batch_no} · {selectedBatch.quantity} units in stock</Text>
          </View>

          <Text style={styles.sectionLabel}>REASON FOR ADJUSTMENT *</Text>
          {REASONS.map((r) => (
            <TouchableOpacity key={r.key} style={[styles.reasonRow, reason === r.key && styles.reasonRowActive]} onPress={() => setReason(r.key)}>
              <Feather name={r.icon} size={18} color={reason === r.key ? r.color : COLORS.textMuted} />
              <Text style={[styles.reasonLabel, reason === r.key && { color: r.color, fontWeight: "700" }]}>{r.label}</Text>
              {reason === r.key && <Feather name="check-circle" size={18} color={r.color} />}
            </TouchableOpacity>
          ))}

          <Text style={styles.sectionLabel}>QUANTITY</Text>
          <Text style={styles.qtyHint}>
            {reason === "correction" ? "Enter new adjustment (+ to add, enter without sign to subtract)" : "Units to remove (enter as positive number)"}
          </Text>
          <TextInput
            style={styles.field}
            value={changeStr}
            onChangeText={setChangeStr}
            keyboardType={reason === "correction" ? "default" : "numeric"}
            placeholder={reason === "correction" ? "e.g. +10 or -5" : "e.g. 12"}
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={styles.sectionLabel}>NOTES (OPTIONAL)</Text>
          <TextInput style={[styles.field, { minHeight: 70, textAlignVertical: "top", paddingTop: 10 }]} value={notes} onChangeText={setNotes} multiline placeholder="Add any notes…" placeholderTextColor={COLORS.textMuted} />

          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color={COLORS.white} /> : (
              <>
                <Feather name="check-circle" size={18} color={COLORS.white} />
                <Text style={styles.saveBtnText}>Apply Adjustment</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
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
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: COLORS.text },
  stepsRow: { flexDirection: "row", justifyContent: "center", gap: SPACING.xl, padding: SPACING.md, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  stepItem: { alignItems: "center", gap: 4 },
  stepDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface },
  stepDotActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  stepDotDone: { borderColor: COLORS.success, backgroundColor: COLORS.success },
  stepNum: { fontSize: 12, fontWeight: "700", color: COLORS.textMuted },
  stepLabel: { fontSize: 11, color: COLORS.textMuted },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 6, margin: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.sm },
  searchInput: { flex: 1, height: 44, fontSize: 15, color: COLORS.text },
  empty: { textAlign: "center", color: COLORS.textMuted, fontSize: 13 },
  card: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.white, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  medName: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  medMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  selCard: { margin: SPACING.lg, padding: SPACING.md, backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary },
  selLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1, color: COLORS.primary },
  selValue: { fontSize: 16, fontWeight: "800", color: COLORS.text, marginTop: 2 },
  summaryCard: { padding: SPACING.md, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  summaryLine: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  summaryMeta: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted },
  reasonRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.white, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  reasonRowActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  reasonLabel: { flex: 1, fontSize: 14, color: COLORS.text },
  qtyHint: { fontSize: 12, color: COLORS.textMuted, marginTop: -SPACING.sm + 2 },
  field: { minHeight: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, backgroundColor: COLORS.white, fontSize: 15, color: COLORS.text },
  saveBtn: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 16, marginTop: SPACING.md },
  saveBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 16 },
});
