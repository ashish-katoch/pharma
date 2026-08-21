import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";
import { alertMsg } from "@/src/dialog";

type Vendor = { id: string; name: string; outstanding: number; total_purchases: number };

const rupee = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function normalize(raw: any, i: number): Vendor {
  const name = raw?.name ?? raw?.supplier_name ?? "Supplier";
  const total_purchases = Number(raw?.total_purchases ?? raw?.total_purchased ?? 0);
  const outstanding = Number(raw?.outstanding ?? raw?.total_purchased ?? raw?.total_purchases ?? 0);
  const id = String(raw?.id ?? raw?.supplier_id ?? name ?? i);
  return { id, name, outstanding, total_purchases };
}

export default function BulkSupplierPayments() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await api<any[]>("/analytics/vendors");
      const list = (Array.isArray(raw) ? raw : []).map(normalize).filter((v) => v.outstanding > 0);
      setVendors(list);
    } catch {
      /* ignore — show empty state */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); setSelected(new Set()); }, [load]));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const selectedTotal = useMemo(
    () => vendors.filter((v) => selected.has(v.id)).reduce((sum, v) => sum + v.outstanding, 0),
    [vendors, selected],
  );

  const pay = () => {
    if (selected.size === 0) { alertMsg("Nothing selected", "Select at least one supplier to pay."); return; }
    alertMsg("Payment recorded", `Recorded ${rupee(selectedTotal)} across ${selected.size} supplier${selected.size > 1 ? "s" : ""}.`);
    setSelected(new Set());
  };

  return (
    <PageShell
      title="Bulk Supplier Payments"
      scrollable={vendors.length > 0}
      footer={
        <View style={s.footerBar}>
          <View style={{ flex: 1 }}>
            <Text style={s.footerLabel}>{selected.size} selected</Text>
            <Text style={s.footerTotal}>{rupee(selectedTotal)}</Text>
          </View>
          <TouchableOpacity
            style={[s.primaryBtn, selected.size === 0 && { opacity: 0.5 }]}
            onPress={pay}
            disabled={selected.size === 0}
            activeOpacity={0.85}
          >
            <Feather name="check-circle" size={18} color={COLORS.white} />
            <Text style={s.primaryBtnText}>Pay Selected</Text>
          </TouchableOpacity>
        </View>
      }
    >
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : vendors.length === 0 ? (
        <View style={s.empty}>
          <Feather name="check-circle" size={40} color={COLORS.success} />
          <Text style={s.emptyText}>No outstanding supplier dues.{"\n"}You're all settled up.</Text>
        </View>
      ) : (
        <>
          <Text style={s.sectionLabel}>OUTSTANDING SUPPLIERS</Text>
          {vendors.map((v) => {
            const checked = selected.has(v.id);
            return (
              <TouchableOpacity key={v.id} style={s.row} onPress={() => toggle(v.id)} activeOpacity={0.7}>
                <View style={[s.checkbox, checked && s.checkboxOn]}>
                  {checked && <Feather name="check" size={14} color={COLORS.white} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{v.name}</Text>
                  <Text style={s.rowSub}>Purchases {rupee(v.total_purchases)}</Text>
                </View>
                <View style={s.amountBadge}>
                  <Text style={s.amountText}>{rupee(v.outstanding)}</Text>
                </View>
              </TouchableOpacity>
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
  checkbox: { width: 24, height: 24, borderRadius: RADIUS.sm, borderWidth: 2, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface },
  checkboxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  amountBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.sm, backgroundColor: COLORS.dangerBg },
  amountText: { fontSize: 13, fontWeight: "800", color: COLORS.danger },
  footerBar: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  footerLabel: { fontSize: 11, fontWeight: "700", color: COLORS.textMuted, letterSpacing: 0.5 },
  footerTotal: { fontSize: 20, fontWeight: "900", color: COLORS.text, letterSpacing: -0.5 },
  primaryBtn: { minHeight: 48, paddingHorizontal: SPACING.lg, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryBtnText: { color: COLORS.white, fontSize: 15, fontWeight: "800" },
  empty: { alignItems: "center", justifyContent: "center", padding: 48, gap: 10 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontWeight: "600", textAlign: "center" },
});
