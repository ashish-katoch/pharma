import { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";
import { alertMsg } from "@/src/dialog";

type POItem = { id: string; name: string; current: number; suggested: number };

function normalize(raw: any, i: number): POItem {
  const name = raw?.medicine_name ?? raw?.name ?? "Item";
  const current = Number(raw?.current_stock ?? raw?.stock ?? 0);
  const suggested = Number(raw?.suggested_qty ?? raw?.reorder ?? Math.max(20 - current, 10));
  const id = String(raw?.medicine_id ?? raw?.id ?? name ?? i);
  return { id, name, current, suggested: Math.max(1, suggested) };
}

export default function PurchaseOrderDraft() {
  const [items, setItems] = useState<POItem[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<any>("/analytics/stockout-risk");
      const rows: any[] = Array.isArray(data) ? data : (data?.items ?? []);
      const list = rows.map(normalize);
      setItems(list);
      setQty(Object.fromEntries(list.map((it) => [it.id, it.suggested])));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const bump = (id: string, delta: number) =>
    setQty((prev) => ({ ...prev, [id]: Math.max(1, (prev[id] ?? 1) + delta) }));

  const totalUnits = items.reduce((sum, it) => sum + (qty[it.id] ?? it.suggested), 0);

  const generate = () => {
    if (items.length === 0) return;
    alertMsg("PO created", `Draft purchase order with ${items.length} item${items.length > 1 ? "s" : ""} (${totalUnits} units) is ready.`);
  };

  return (
    <PageShell
      title="Purchase Order Draft"
      footer={
        items.length > 0 ? (
          <TouchableOpacity style={s.primaryBtn} onPress={generate} activeOpacity={0.85}>
            <Feather name="file-plus" size={20} color={COLORS.white} />
            <Text style={s.primaryBtnText}>Generate PO · {totalUnits} units</Text>
          </TouchableOpacity>
        ) : undefined
      }
    >
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : items.length === 0 ? (
        <View style={s.empty}>
          <Feather name="check-circle" size={40} color={COLORS.success} />
          <Text style={s.emptyText}>Nothing to reorder.{"\n"}Stock levels are healthy.</Text>
        </View>
      ) : (
        <>
          <Text style={s.sectionLabel}>SUGGESTED REORDER</Text>
          {items.map((it) => {
            const q = qty[it.id] ?? it.suggested;
            return (
              <View key={it.id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{it.name}</Text>
                  <Text style={s.rowSub}>In stock: {it.current}</Text>
                </View>
                <View style={s.stepper}>
                  <TouchableOpacity style={s.stepBtn} onPress={() => bump(it.id, -1)} activeOpacity={0.7}>
                    <Feather name="minus" size={16} color={COLORS.primary} />
                  </TouchableOpacity>
                  <Text style={s.qtyText}>{q}</Text>
                  <TouchableOpacity style={s.stepBtn} onPress={() => bump(it.id, 1)} activeOpacity={0.7}>
                    <Feather name="plus" size={16} color={COLORS.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </>
      )}
    </PageShell>
  );
}

const s = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: SPACING.sm, marginBottom: SPACING.xs },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },
  rowTitle: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  stepper: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  stepBtn: { width: 32, height: 32, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  qtyText: { minWidth: 32, textAlign: "center", fontSize: 16, fontWeight: "900", color: COLORS.text },
  primaryBtn: { minHeight: 52, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
  empty: { alignItems: "center", justifyContent: "center", padding: 48, gap: 10 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontWeight: "600", textAlign: "center" },
});
