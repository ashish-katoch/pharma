import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { alertMsg } from "@/src/dialog";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN")}`;

type ReorderItem = {
  medicine_id: string;
  medicine_name: string;
  pack: string;
  total_stock: number;
  reorder_level: number;
  shortage: number;
  supplier_id: string;
  supplier_name: string;
};

type SupplierGroup = {
  supplier_id: string;
  supplier_name: string;
  items: ReorderItem[];
};

type ReorderData = {
  total_items: number;
  suppliers: SupplierGroup[];
};

export default function Reorder() {
  const router = useRouter();
  const [data, setData] = useState<ReorderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<ReorderData>("/reorder/pending");
      setData(d);
    } catch (e: any) {
      alertMsg("Error", e?.message || "Failed to load reorder data");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const draftPOs = async () => {
    setDrafting(true);
    try {
      const result = await api<{ created: number }>("/reorder/draft-po", { method: "POST" });
      const msg = `${result.created} PO draft${result.created !== 1 ? "s" : ""} created for linked suppliers. Open Purchases to review.`;
      if (Platform.OS === "web") {
        if (window.confirm(`Purchase Orders Drafted\n\n${msg}\n\nView Purchases now?`)) router.push("/suppliers");
      } else {
        Alert.alert("Purchase Orders Drafted", msg, [
          { text: "View Purchases", onPress: () => router.push("/suppliers") }, { text: "OK" },
        ]);
      }
    } catch (e: any) {
      alertMsg("Error", e?.message || "Failed to draft POs");
    } finally {
      setDrafting(false);
    }
  };

  const whatsappOrder = (group: SupplierGroup, phone?: string) => {
    const lines = group.items.map(
      (it) => `• ${it.medicine_name}${it.pack ? ` (${it.pack})` : ""} — need ${it.shortage} units`
    );
    const msg = `*Purchase Order Request*\n\n${lines.join("\n")}\n\n_Please confirm availability and rates._`;
    const encoded = encodeURIComponent(msg);
    const url = phone
      ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    Linking.openURL(url).catch(() => alertMsg("WhatsApp", "Could not open WhatsApp"));
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Reorder Centre</Text>
        <TouchableOpacity onPress={load} style={{ padding: 4 }}>
          <Feather name="refresh-cw" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : !data || data.total_items === 0 ? (
        <View style={styles.empty}>
          <Feather name="check-circle" size={48} color={COLORS.success} />
          <Text style={styles.emptyTitle}>All stocked up!</Text>
          <Text style={styles.emptySub}>No medicines are below their reorder level.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Summary banner */}
          <View style={styles.banner}>
            <View style={styles.bannerStat}>
              <Text style={styles.bannerNum}>{data.total_items}</Text>
              <Text style={styles.bannerLabel}>Items to reorder</Text>
            </View>
            <View style={styles.bannerStat}>
              <Text style={styles.bannerNum}>{data.suppliers.length}</Text>
              <Text style={styles.bannerLabel}>Suppliers</Text>
            </View>
          </View>

          {/* Draft PO button */}
          <TouchableOpacity
            style={[styles.draftBtn, drafting && { opacity: 0.6 }]}
            onPress={draftPOs}
            disabled={drafting}
          >
            {drafting ? (
              <ActivityIndicator color={COLORS.white} size="small" />
            ) : (
              <Feather name="file-plus" size={16} color={COLORS.white} />
            )}
            <Text style={styles.draftBtnText}>Draft Purchase Orders</Text>
          </TouchableOpacity>

          {/* Per-supplier groups */}
          {data.suppliers.map((group) => (
            <View key={group.supplier_id} style={styles.group}>
              <View style={styles.groupHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.supplierName}>{group.supplier_name}</Text>
                  <Text style={styles.supplierMeta}>{group.items.length} item{group.items.length !== 1 ? "s" : ""}</Text>
                </View>
                <TouchableOpacity
                  style={styles.waBtn}
                  onPress={() => whatsappOrder(group)}
                >
                  <Feather name="message-circle" size={15} color="#25D366" />
                  <Text style={styles.waBtnText}>WhatsApp</Text>
                </TouchableOpacity>
              </View>

              {group.items.map((item) => (
                <View key={item.medicine_id} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.medicine_name}</Text>
                    {item.pack ? <Text style={styles.itemMeta}>{item.pack}</Text> : null}
                  </View>
                  <View style={styles.stockBadge}>
                    <Text style={styles.stockNum}>{item.total_stock}</Text>
                    <Text style={styles.stockLabel}>in stock</Text>
                  </View>
                  <View style={styles.needBadge}>
                    <Text style={styles.needNum}>{item.shortage}</Text>
                    <Text style={styles.needLabel}>order</Text>
                  </View>
                </View>
              ))}
            </View>
          ))}

          {/* Unlinked group note */}
          {data.suppliers.some((g) => g.supplier_id === "unlinked") && (
            <View style={styles.unlinkedNote}>
              <Feather name="info" size={14} color={COLORS.textMuted} />
              <Text style={styles.unlinkedText}>
                Some items have no linked supplier. Link them via Inventory → Medicine detail to include in PO drafts.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.lg, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: COLORS.text },
  scroll: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: SPACING.xl },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text },
  emptySub: { fontSize: 14, color: COLORS.textSecondary, textAlign: "center" },
  banner: {
    flexDirection: "row",
    backgroundColor: COLORS.text,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.xl,
  },
  bannerStat: { alignItems: "center" },
  bannerNum: { fontSize: 34, fontWeight: "900", color: COLORS.white, letterSpacing: -1 },
  bannerLabel: { fontSize: 11, color: "#94A3B8", fontWeight: "600", marginTop: 2 },
  draftBtn: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
  },
  draftBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 15 },
  group: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  supplierName: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  supplierMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  waBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: "#25D366",
  },
  waBtnText: { fontSize: 12, fontWeight: "700", color: "#25D366" },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  itemName: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  itemMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  stockBadge: { alignItems: "center", minWidth: 44 },
  stockNum: { fontSize: 16, fontWeight: "800", color: COLORS.danger },
  stockLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: "600" },
  needBadge: {
    alignItems: "center",
    minWidth: 48,
    backgroundColor: COLORS.primaryLight,
    padding: 6,
    borderRadius: RADIUS.sm,
  },
  needNum: { fontSize: 16, fontWeight: "800", color: COLORS.primary },
  needLabel: { fontSize: 10, color: COLORS.primary, fontWeight: "600" },
  unlinkedNote: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  unlinkedText: { flex: 1, fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
});
