import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { PageShell } from "@/src/components/PageShell";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { alertMsg, alertNav } from "@/src/dialog";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type BillLine = {
  medicine_id: string;
  medicine_name: string;
  batch_id: string;
  batch_no: string;
  quantity: number;
  mrp: number;
  discount_pct: number;
  line_total: number;
};

type Bill = {
  id: string;
  bill_no: string;
  customer_name: string;
  lines: BillLine[];
  payment_mode: string;
  grand_total: number;
  status: string;
  edit_count?: number;
};

type EditLine = {
  medicine_id: string;
  batch_id: string;
  medicine_name: string;
  batch_no: string;
  original_qty: number;
  quantity: string;
  mrp: number;
  discount_pct: number;
};

const PAYMENT_MODES = ["cash", "upi", "card", "credit"] as const;

export default function BillEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [lines, setLines] = useState<EditLine[]>([]);
  const [paymentMode, setPaymentMode] = useState("cash");
  const [reason, setReason] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const b = await api<Bill>(`/bills/${id}`);
        setBill(b);
        setPaymentMode(b.payment_mode);
        setLines(
          b.lines.map((l) => ({
            medicine_id: l.medicine_id,
            batch_id: l.batch_id,
            medicine_name: l.medicine_name,
            batch_no: l.batch_no,
            original_qty: l.quantity,
            quantity: String(l.quantity),
            mrp: l.mrp,
            discount_pct: l.discount_pct,
          }))
        );
      } catch (e: any) {
        alertMsg("Error", e?.message || "Could not load bill");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const updateQty = (idx: number, val: string) => {
    setLines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], quantity: val };
      return next;
    });
  };

  const lineTotal = (l: EditLine) => {
    const q = parseInt(l.quantity, 10) || 0;
    const disc = l.mrp * q * (l.discount_pct / 100);
    return l.mrp * q - disc;
  };

  const grandTotal = lines.reduce((s, l) => s + lineTotal(l), 0);

  const save = async () => {
    if (!reason.trim()) {
      alertMsg("Reason required", "Please enter a reason for editing this bill");
      return;
    }
    for (const l of lines) {
      const q = parseInt(l.quantity, 10);
      if (isNaN(q) || q < 0) {
        alertMsg("Invalid quantity", `Enter a valid quantity for ${l.medicine_name}`);
        return;
      }
    }
    setSaving(true);
    try {
      await api(`/bills/${id}`, {
        method: "PUT",
        body: {
          lines: lines.map((l) => ({
            medicine_id: l.medicine_id,
            batch_id: l.batch_id,
            quantity: parseInt(l.quantity, 10),
          })),
          payment_mode: paymentMode,
          reason: reason.trim(),
        },
      });
      alertNav("Bill updated", "Changes saved successfully.", () => router.back());
    } catch (e: any) {
      alertMsg("Failed", e?.message || "Could not save changes");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageShell title="Edit Bill" showBack scrollable={false}>
        <ActivityIndicator style={{ flex: 1 }} color={COLORS.primary} />
      </PageShell>
    );
  }

  if (!bill) return null;

  const editCount = bill.edit_count ?? 0;

  const EditCountBadge = editCount > 0 ? (
    <View style={styles.editCountBadge}>
      <Text style={styles.editCountText}>Edited {editCount}×</Text>
    </View>
  ) : undefined;

  const SaveBar = (
    <TouchableOpacity
      style={[styles.saveBtn, saving && { opacity: 0.6 }]}
      onPress={save}
      disabled={saving}
      testID="bill-edit-save"
    >
      {saving ? (
        <ActivityIndicator color={COLORS.white} />
      ) : (
        <>
          <Feather name="check" size={18} color={COLORS.white} />
          <Text style={styles.saveBtnText}>Save Changes</Text>
        </>
      )}
    </TouchableOpacity>
  );

  return (
    <PageShell title="Edit Bill" showBack scrollable={false} noPadding rightAction={EditCountBadge} footer={SaveBar}>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Warning banner */}
          <View style={styles.warnBanner}>
            <Feather name="alert-triangle" size={16} color={COLORS.warning} />
            <Text style={styles.warnText}>
              Editing adjusts stock quantities. A version snapshot is saved before changes apply.
            </Text>
          </View>

          {/* Line items */}
          <Text style={styles.sectionLabel}>QUANTITIES</Text>
          {lines.map((l, idx) => {
            const q = parseInt(l.quantity, 10) || 0;
            const delta = q - l.original_qty;
            return (
              <View key={idx} style={styles.lineCard}>
                <View style={styles.lineInfo}>
                  <Text style={styles.lineName} numberOfLines={1}>{l.medicine_name}</Text>
                  <Text style={styles.lineMeta}>Batch {l.batch_no} · Original qty: {l.original_qty}</Text>
                </View>
                <View style={styles.lineRight}>
                  <TextInput
                    style={styles.qtyInput}
                    value={l.quantity}
                    onChangeText={(v) => updateQty(idx, v)}
                    keyboardType="numeric"
                    selectTextOnFocus
                    testID={`edit-qty-${idx}`}
                  />
                  {delta !== 0 && (
                    <Text style={[styles.delta, delta > 0 ? styles.deltaPos : styles.deltaNeg]}>
                      {delta > 0 ? `+${delta}` : delta}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}

          {/* Payment mode */}
          <Text style={[styles.sectionLabel, { marginTop: SPACING.md }]}>PAYMENT MODE</Text>
          <View style={styles.modeRow}>
            {PAYMENT_MODES.map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.modeChip, paymentMode === m && styles.modeChipActive]}
                onPress={() => setPaymentMode(m)}
              >
                <Text style={[styles.modeChipText, paymentMode === m && styles.modeChipTextActive]}>
                  {m.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Reason */}
          <Text style={[styles.sectionLabel, { marginTop: SPACING.md }]}>REASON *</Text>
          <TextInput
            style={styles.reasonInput}
            value={reason}
            onChangeText={setReason}
            placeholder="Why is this bill being edited?"
            placeholderTextColor={COLORS.textMuted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            testID="edit-reason"
          />

          {/* Total preview */}
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>NEW TOTAL</Text>
            <Text style={styles.totalValue}>{rupee(grandTotal)}</Text>
            {bill.grand_total !== grandTotal && (
              <Text style={styles.totalDiff}>
                was {rupee(bill.grand_total)} · {grandTotal > bill.grand_total ? "+" : ""}{rupee(grandTotal - bill.grand_total)}
              </Text>
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  editCountBadge: {
    backgroundColor: "#FEF3C7",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  editCountText: { fontSize: 11, fontWeight: "700", color: "#92400E" },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 100 },
  warnBanner: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  warnText: { flex: 1, fontSize: 13, color: "#92400E", lineHeight: 18 },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.textSecondary },
  lineCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  lineInfo: { flex: 1 },
  lineName: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  lineMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  lineRight: { alignItems: "center", gap: 4 },
  qtyInput: {
    width: 64,
    height: 44,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.md,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  delta: { fontSize: 11, fontWeight: "700" },
  deltaPos: { color: COLORS.danger },
  deltaNeg: { color: "#16A34A" },
  modeRow: { flexDirection: "row", gap: SPACING.sm, flexWrap: "wrap" },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  modeChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  modeChipText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
  modeChipTextActive: { color: COLORS.white },
  reasonInput: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  totalCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    alignItems: "center",
    gap: 4,
  },
  totalLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.textMuted },
  totalValue: { fontSize: 28, fontWeight: "900", color: COLORS.text },
  totalDiff: { fontSize: 13, color: COLORS.textMuted },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
  },
  saveBtnText: { fontSize: 16, fontWeight: "800", color: COLORS.white },
});
