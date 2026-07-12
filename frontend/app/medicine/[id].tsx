import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
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
};

export default function MedicineDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [med, setMed] = useState<Medicine | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [m, b] = await Promise.all([
          api<Medicine>(`/medicines/${id}`),
          api<Batch[]>(`/batches?medicine_id=${id}`),
        ]);
        setMed(m);
        setBatches(b);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading || !med) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="medicine-back">
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{med.name}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.lg, paddingBottom: 120 }}>
        <View style={styles.hero}>
          <Text style={styles.heroName}>{med.name}</Text>
          <Text style={styles.heroMeta}>{med.brand} · {med.pack}</Text>
          <View style={styles.tagRow}>
            {med.schedule ? <Text style={styles.schedTag}>Schedule {med.schedule}</Text> : null}
            {med.hsn ? <Text style={styles.schedTag}>HSN {med.hsn}</Text> : null}
            {med.gst_rate ? <Text style={styles.schedTag}>GST {med.gst_rate}%</Text> : null}
          </View>
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
      </ScrollView>
    </SafeAreaView>
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
  headerTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text, flex: 1, marginHorizontal: 12 },
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
});
