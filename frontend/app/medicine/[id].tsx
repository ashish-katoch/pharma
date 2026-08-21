import { useEffect, useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PageShell } from "@/src/components/PageShell";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { alertMsg } from "@/src/dialog";
import { useIsOwner } from "@/src/auth";
import { COLORS, RADIUS, SPACING, expiryTone } from "@/src/theme";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type Batch = {
  id: string;
  batch_no: string;
  expiry: string;
  quantity: number;
  mrp: number;
  purchase_price: number;
};

type Medicine = {
  id: string;
  name: string;
  brand?: string;
  generic?: string;
  strength?: string;
  pack?: string;
  hsn?: string;
  schedule?: string;
  gst_rate?: number;
  mrp: number;
  total_stock: number;
  reorder_level: number;
  location?: string;
};

type PriceHistory = {
  id: string;
  old_mrp: number;
  new_mrp: number;
  changed_by: string;
  changed_at: string;
};

export default function MedicineDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isOwner = useIsOwner();
  const [med, setMed] = useState<Medicine | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Medicine>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [m, b, ph] = await Promise.all([
          api<Medicine>(`/medicines/${id}`),
          api<Batch[]>(`/batches?medicine_id=${id}`),
          api<PriceHistory[]>(`/medicines/${id}/price-history`).catch(() => []),
        ]);
        setMed(m);
        setBatches(b);
        setPriceHistory(ph);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const openEdit = () => {
    if (!med) return;
    setEditForm({
      name: med.name, brand: med.brand, generic: med.generic,
      strength: med.strength, pack: med.pack, hsn: med.hsn,
      schedule: med.schedule, gst_rate: med.gst_rate,
      mrp: med.mrp, reorder_level: med.reorder_level, location: med.location,
    });
    setEditOpen(true);
  };

  const saveMedicine = async () => {
    if (!editForm.name?.trim()) { alertMsg("Name", "Medicine name is required"); return; }
    setSaving(true);
    try {
      const updated = await api<Medicine>(`/medicines/${id}`, {
        method: "PUT",
        body: {
          ...editForm,
          mrp: parseFloat(String(editForm.mrp)) || 0,
          reorder_level: parseInt(String(editForm.reorder_level), 10) || 10,
          gst_rate: parseFloat(String(editForm.gst_rate)) || 12,
        },
      });
      setMed(updated);
      setEditOpen(false);
    } catch (e: any) {
      alertMsg("Failed", e?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !med) {
    return (
      <PageShell title="Medicine" showBack scrollable={false}>
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      </PageShell>
    );
  }

  const EditBtn = isOwner ? (
    <TouchableOpacity onPress={openEdit} testID="medicine-edit-btn">
      <Feather name="edit-2" size={20} color={COLORS.primary} />
    </TouchableOpacity>
  ) : undefined;

  return (
    <PageShell title={med.name} showBack scrollable={false} noPadding rightAction={EditBtn}>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.lg, paddingBottom: 120 }}>
        <View style={styles.hero}>
          <Text style={styles.heroName}>{med.name}</Text>
          <Text style={styles.heroMeta}>{med.brand} · {med.pack}</Text>
          <View style={styles.tagRow}>
            {med.schedule ? <Text style={styles.schedTag}>Schedule {med.schedule}</Text> : null}
            {med.hsn ? <Text style={styles.schedTag}>HSN {med.hsn}</Text> : null}
            {med.gst_rate ? <Text style={styles.schedTag}>GST {med.gst_rate}%</Text> : null}
          </View>
          {med.location ? (
            <View style={styles.locationRow}>
              <Feather name="map-pin" size={12} color={COLORS.textMuted} />
              <Text style={styles.locationText}>{med.location}</Text>
            </View>
          ) : null}
          <Text style={styles.heroPrice}>{rupee(med.mrp)}</Text>
        </View>

        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>TOTAL STOCK</Text>
            <Text style={[styles.statValue, med.total_stock <= med.reorder_level && { color: COLORS.danger }]}>
              {med.total_stock}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>REORDER AT</Text>
            <Text style={styles.statValue}>{med.reorder_level}</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Batches ({batches.length})</Text>
          <TouchableOpacity
            testID="medicine-add-batch"
            onPress={() => router.push({ pathname: "/stock-in", params: { medicineId: med.id } })}
            style={styles.addBtn}
          >
            <Feather name="plus" size={16} color={COLORS.white} />
            <Text style={styles.addBtnText}>Add batch</Text>
          </TouchableOpacity>
        </View>

        {batches.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="inbox" size={32} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>No batches yet</Text>
          </View>
        ) : (
          batches.map((b) => {
            const tone = expiryTone(b.expiry);
            return (
              <View key={b.id} style={styles.batchCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.batchNo}>Batch {b.batch_no}</Text>
                  <Text style={styles.batchMeta}>Qty {b.quantity} · {rupee(b.mrp)}</Text>
                </View>
                <View style={[styles.expiryBadge, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.expiryBadgeText, { color: tone.fg }]}>{b.expiry}</Text>
                  <Text style={[styles.expiryBadgeSub, { color: tone.fg }]}>{tone.label}</Text>
                </View>
              </View>
            );
          })
        )}

        {priceHistory.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>MRP History</Text>
            {priceHistory.map((ph, idx) => (
              <View key={ph.id ?? idx} style={styles.phCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.phChange}>
                    {rupee(ph.old_mrp)} → {rupee(ph.new_mrp)}
                  </Text>
                  <Text style={styles.phMeta}>{ph.changed_at?.slice(0, 10)} · {ph.changed_by}</Text>
                </View>
                <Text style={[
                  styles.phDelta,
                  { color: ph.new_mrp > ph.old_mrp ? COLORS.danger : "#10b981" },
                ]}>
                  {ph.new_mrp > ph.old_mrp ? "+" : ""}
                  {rupee(ph.new_mrp - ph.old_mrp)}
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* ── Edit Medicine Modal ── */}
      <Modal visible={editOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditOpen(false)}>
        <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditOpen(false)}>
              <Feather name="x" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Edit Medicine</Text>
            <TouchableOpacity onPress={saveMedicine} disabled={saving} testID="medicine-save-btn">
              {saving ? <ActivityIndicator color={COLORS.primary} /> : (
                <Text style={{ color: COLORS.primary, fontWeight: "800", fontSize: 15 }}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
              {(
                [
                  { key: "name", label: "Name *" },
                  { key: "brand", label: "Brand" },
                  { key: "generic", label: "Generic Name" },
                  { key: "strength", label: "Strength" },
                  { key: "pack", label: "Pack" },
                  { key: "hsn", label: "HSN Code" },
                  { key: "schedule", label: "Schedule (OTC / H / H1)" },
                  { key: "gst_rate", label: "GST %", numeric: true },
                  { key: "mrp", label: "MRP ₹", numeric: true },
                  { key: "reorder_level", label: "Reorder Level", numeric: true },
                  { key: "location", label: "Location (Block-Row-Shelf)" },
                ] as { key: keyof Medicine; label: string; numeric?: boolean }[]
              ).map(({ key, label, numeric }) => (
                <View key={key} style={{ gap: 4 }}>
                  <Text style={styles.editFieldLabel}>{label}</Text>
                  <TextInput
                    style={styles.editInput}
                    value={editForm[key] != null ? String(editForm[key]) : ""}
                    onChangeText={(v) => setEditForm((p) => ({ ...p, [key]: numeric ? v : v }))}
                    keyboardType={numeric ? "decimal-pad" : "default"}
                    placeholder={label}
                    placeholderTextColor={COLORS.textMuted}
                    testID={`medicine-edit-${key}`}
                  />
                </View>
              ))}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  headerTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text, flex: 1, marginHorizontal: 12 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  editFieldLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.textSecondary },
  editInput: {
    height: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  hero: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  heroName: { fontSize: 22, fontWeight: "800", color: COLORS.text, letterSpacing: -0.4 },
  heroMeta: { fontSize: 13, color: COLORS.textSecondary },
  heroPrice: { fontSize: 26, fontWeight: "900", color: COLORS.primary, marginTop: 8 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  locationText: { fontSize: 12, color: COLORS.textMuted, fontWeight: "600" },
  tagRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 },
  schedTag: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.textSecondary,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statRow: { flexDirection: "row", gap: SPACING.md },
  statCard: {
    flex: 1,
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.textMuted },
  statValue: { fontSize: 28, fontWeight: "900", color: COLORS.text, marginTop: 6 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: COLORS.text },
  addBtn: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
  },
  addBtnText: { color: COLORS.white, fontSize: 12, fontWeight: "700" },
  batchCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
  },
  batchNo: { fontSize: 14, fontWeight: "800", color: COLORS.text, fontVariant: ["tabular-nums"] },
  batchMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  expiryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    alignItems: "flex-end",
  },
  expiryBadgeText: { fontSize: 12, fontWeight: "800" },
  expiryBadgeSub: { fontSize: 10, fontWeight: "700", marginTop: 2 },
  empty: { alignItems: "center", padding: SPACING.xxl, gap: 8 },
  emptyText: { color: COLORS.textMuted, fontSize: 14 },
  phCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 6,
  },
  phChange: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  phMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  phDelta: { fontSize: 14, fontWeight: "800", fontVariant: ["tabular-nums"] },
});
