import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Linking, Platform,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { alertMsg } from "@/src/dialog";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { PageShell } from "@/src/components/PageShell";
import { EmptyState } from "@/src/components/ui/EmptyState";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN")}`;

type ReorderItem = { medicine_id: string; medicine_name: string; pack: string; total_stock: number; reorder_level: number; shortage: number; supplier_id: string; supplier_name: string };
type SupplierGroup = { supplier_id: string; supplier_name: string; items: ReorderItem[] };
type ReorderData = { total_items: number; suppliers: SupplierGroup[] };

export default function Reorder() {
  const router = useRouter();
  const [data, setData] = useState<ReorderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api<ReorderData>("/reorder/pending")); }
    catch (e: any) { alertMsg("Error", e?.message || "Failed to load reorder data"); }
    finally { setLoading(false); }
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
        Alert.alert("Purchase Orders Drafted", msg, [{ text: "View Purchases", onPress: () => router.push("/suppliers") }, { text: "OK" }]);
      }
    } catch (e: any) { alertMsg("Error", e?.message || "Failed to draft POs"); }
    finally { setDrafting(false); }
  };

  const whatsappOrder = (group: SupplierGroup) => {
    const lines = group.items.map((it) => `• ${it.medicine_name}${it.pack ? ` (${it.pack})` : ""} — need ${it.shortage} units`);
    const msg = `*Purchase Order Request*\n\n${lines.join("\n")}\n\n_Please confirm availability and rates._`;
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => alertMsg("WhatsApp", "Could not open WhatsApp"));
  };

  const RefreshBtn = (
    <TouchableOpacity onPress={load} style={s.refreshBtn}>
      <Feather name="refresh-cw" size={16} color={COLORS.primary} />
    </TouchableOpacity>
  );

  return (
    <PageShell title="Reorder Centre" rightAction={RefreshBtn} showBack scrollable={false} noPadding>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : !data || data.total_items === 0 || !data.suppliers ? (
        <EmptyState icon="check-circle" title="All stocked up!" subtitle="No medicines are below their reorder level." tone="success" />
      ) : (
        <ScrollView contentContainerStyle={s.scroll}>
          {/* Summary banner */}
          <View style={s.banner}>
            <View style={s.bannerStat}>
              <Text style={s.bannerNum}>{data.total_items}</Text>
              <Text style={s.bannerLabel}>Items to reorder</Text>
            </View>
            <View style={s.bannerStat}>
              <Text style={s.bannerNum}>{data.suppliers?.length ?? 0}</Text>
              <Text style={s.bannerLabel}>Suppliers</Text>
            </View>
          </View>

          <TouchableOpacity style={[s.draftBtn, drafting && { opacity: 0.6 }]} onPress={draftPOs} disabled={drafting}>
            {drafting ? <ActivityIndicator color={COLORS.white} size="small" /> : <Feather name="file-plus" size={16} color={COLORS.white} />}
            <Text style={s.draftBtnText}>Draft Purchase Orders</Text>
          </TouchableOpacity>

          {data.suppliers.map((group) => (
            <View key={group.supplier_id} style={s.group}>
              <View style={s.groupHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.supplierName}>{group.supplier_name}</Text>
                  <Text style={s.supplierMeta}>{group.items.length} item{group.items.length !== 1 ? "s" : ""}</Text>
                </View>
                <TouchableOpacity style={s.waBtn} onPress={() => whatsappOrder(group)}>
                  <Feather name="message-circle" size={15} color="#25D366" />
                  <Text style={s.waBtnText}>WhatsApp</Text>
                </TouchableOpacity>
              </View>
              {group.items.map((item) => (
                <View key={item.medicine_id} style={s.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemName}>{item.medicine_name}</Text>
                    {item.pack ? <Text style={s.itemMeta}>{item.pack}</Text> : null}
                  </View>
                  <View style={s.stockBadge}>
                    <Text style={s.stockNum}>{item.total_stock}</Text>
                    <Text style={s.stockLabel}>in stock</Text>
                  </View>
                  <View style={s.needBadge}>
                    <Text style={s.needNum}>{item.shortage}</Text>
                    <Text style={s.needLabel}>order</Text>
                  </View>
                </View>
              ))}
            </View>
          ))}

          {data.suppliers.some((g) => g.supplier_id === "unlinked") && (
            <View style={s.unlinkedNote}>
              <Feather name="info" size={14} color={COLORS.textMuted} />
              <Text style={s.unlinkedText}>Some items have no linked supplier. Link them via Inventory → Medicine detail to include in PO drafts.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </PageShell>
  );
}

const s = StyleSheet.create({
  refreshBtn: { width: 34, height: 34, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  scroll: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 },
  banner: { flexDirection: "row", backgroundColor: COLORS.text, borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.xl },
  bannerStat: { alignItems: "center" },
  bannerNum: { fontSize: 34, fontWeight: "900", color: COLORS.white, letterSpacing: -1 },
  bannerLabel: { fontSize: 11, color: "#94A3B8", fontWeight: "600", marginTop: 2 },
  draftBtn: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 14 },
  draftBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 15 },
  group: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" },
  groupHeader: { flexDirection: "row", alignItems: "center", padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface },
  supplierName: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  supplierMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  waBtn: { flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: "#25D366" },
  waBtnText: { fontSize: 12, fontWeight: "700", color: "#25D366" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  itemName: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  itemMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  stockBadge: { alignItems: "center", minWidth: 44 },
  stockNum: { fontSize: 16, fontWeight: "800", color: COLORS.danger },
  stockLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: "600" },
  needBadge: { alignItems: "center", minWidth: 48, backgroundColor: COLORS.primaryLight, padding: 6, borderRadius: RADIUS.sm },
  needNum: { fontSize: 16, fontWeight: "800", color: COLORS.primary },
  needLabel: { fontSize: 10, color: COLORS.primary, fontWeight: "600" },
  unlinkedNote: { flexDirection: "row", gap: 8, alignItems: "flex-start", padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border },
  unlinkedText: { flex: 1, fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
});
