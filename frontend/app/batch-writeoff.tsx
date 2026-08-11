import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  ScrollView,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { COLORS, SPACING, RADIUS } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { Ionicons } from "@expo/vector-icons";

type ExpiringBatch = {
  id: string;
  medicine_id: string;
  medicine_name: string;
  batch_no: string;
  expiry: string;
  quantity: number;
  mrp: number;
};

export default function BatchWriteoffScreen() {
  const { user } = useAuth();
  const [batches, setBatches] = useState<ExpiringBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(90);
  const [selectedBatch, setSelectedBatch] = useState<ExpiringBatch | null>(null);
  const [writeoffQty, setWriteoffQty] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/batches/expiring-soon?days=${days}`);
      setBatches(data);
    } catch {
      Alert.alert("Error", "Failed to load expiring batches");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useFocusEffect(useCallback(() => { fetchBatches(); }, [fetchBatches]));

  const expiryColor = (expiry: string) => {
    const months = diffMonths(expiry);
    if (months <= 1) return COLORS.danger;
    if (months <= 3) return "#f59e0b";
    return "#10b981";
  };

  const diffMonths = (expiry: string) => {
    const [y, m] = expiry.split("-").map(Number);
    const now = new Date();
    return (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1));
  };

  const confirmWriteoff = async () => {
    if (!selectedBatch) return;
    const qty = parseInt(writeoffQty, 10);
    if (isNaN(qty) || qty <= 0 || qty > selectedBatch.quantity) {
      Alert.alert("Invalid quantity", `Enter between 1 and ${selectedBatch.quantity}`);
      return;
    }
    setSubmitting(true);
    try {
      await api("/adjustments", {
        method: "POST",
        body: JSON.stringify({
          medicine_id: selectedBatch.medicine_id,
          medicine_name: selectedBatch.medicine_name,
          batch_id: selectedBatch.id,
          batch_no: selectedBatch.batch_no,
          change: -qty,
          reason: "expiry_writeoff",
          notes: notes || `Expiry write-off batch ${selectedBatch.batch_no}`,
        }),
      });
      Alert.alert("Done", `${qty} units written off`);
      setSelectedBatch(null);
      setWriteoffQty("");
      setNotes("");
      fetchBatches();
    } catch {
      Alert.alert("Error", "Write-off failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderItem = ({ item }: { item: ExpiringBatch }) => {
    const months = diffMonths(item.expiry);
    const color = expiryColor(item.expiry);
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardInfo}>
            <Text style={styles.medName}>{item.medicine_name}</Text>
            <Text style={styles.batchNo}>Batch: {item.batch_no}</Text>
          </View>
          <View style={[styles.expiryBadge, { backgroundColor: color + "22" }]}>
            <Text style={[styles.expiryText, { color }]}>
              {months <= 0 ? "Expired" : `${months}mo`}
            </Text>
          </View>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardDetail}>Expiry: {item.expiry}</Text>
          <Text style={styles.cardDetail}>Qty: {item.quantity}</Text>
          <Text style={styles.cardDetail}>MRP: ₹{item.mrp}</Text>
        </View>
        <TouchableOpacity
          style={styles.writeoffBtn}
          onPress={() => {
            setSelectedBatch(item);
            setWriteoffQty(String(item.quantity));
            setNotes("");
          }}
        >
          <Ionicons name="trash-outline" size={14} color="#fff" />
          <Text style={styles.writeoffBtnText}>Write Off</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Expiry Write-Off</Text>
        <View style={styles.filterRow}>
          {[30, 60, 90, 180].map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.chip, days === d && styles.chipActive]}
              onPress={() => setDays(d)}
            >
              <Text style={[styles.chipText, days === d && styles.chipTextActive]}>
                {d}d
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : batches.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-circle-outline" size={48} color={COLORS.textSecondary} />
          <Text style={styles.emptyText}>No batches expiring in {days} days</Text>
        </View>
      ) : (
        <FlatList
          data={batches}
          keyExtractor={(b) => b.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: SPACING.md }}
        />
      )}

      <Modal visible={!!selectedBatch} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Write Off Stock</Text>
            {selectedBatch && (
              <>
                <Text style={styles.modalMed}>{selectedBatch.medicine_name}</Text>
                <Text style={styles.modalSub}>
                  Batch {selectedBatch.batch_no} — Expires {selectedBatch.expiry}
                </Text>
                <Text style={styles.fieldLabel}>Quantity to write off (max {selectedBatch.quantity})</Text>
                <TextInput
                  style={styles.input}
                  value={writeoffQty}
                  onChangeText={setWriteoffQty}
                  keyboardType="numeric"
                  placeholder="Quantity"
                />
                <Text style={styles.fieldLabel}>Notes (optional)</Text>
                <TextInput
                  style={[styles.input, { height: 70 }]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Reason for write-off"
                  multiline
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setSelectedBatch(null)}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.confirmBtn}
                    onPress={confirmWriteoff}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.confirmBtnText}>Confirm Write-Off</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { fontSize: 20, fontWeight: "700", color: COLORS.text, marginBottom: SPACING.sm },
  filterRow: { flexDirection: "row", gap: SPACING.xs },
  chip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, color: COLORS.textSecondary },
  chipTextActive: { color: "#fff" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: SPACING.sm },
  emptyText: { color: COLORS.textSecondary, fontSize: 15 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  cardInfo: { flex: 1 },
  medName: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  batchNo: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  expiryBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.sm },
  expiryText: { fontSize: 12, fontWeight: "700" },
  cardRow: { flexDirection: "row", gap: SPACING.md, marginBottom: SPACING.sm },
  cardDetail: { fontSize: 12, color: COLORS.textSecondary },
  writeoffBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.danger,
    paddingVertical: 6,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
    alignSelf: "flex-start",
  },
  writeoffBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: COLORS.text, marginBottom: SPACING.sm },
  modalMed: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  modalSub: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.md },
  fieldLabel: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    fontSize: 15,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  modalActions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm },
  cancelBtn: {
    flex: 1,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  cancelBtnText: { color: COLORS.textSecondary, fontWeight: "600" },
  confirmBtn: {
    flex: 2,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.danger,
    alignItems: "center",
  },
  confirmBtnText: { color: "#fff", fontWeight: "700" },
});
