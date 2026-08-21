import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Switch } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

type Rule = {
  id: string;
  name: string;
  type: "percent" | "flat";
  value: number;
  minBill: number;
  active: boolean;
};

const rupee = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const SEED: Rule[] = [
  { id: "1", name: "Senior Citizen", type: "percent", value: 10, minBill: 0, active: true },
  { id: "2", name: "Festive Offer", type: "percent", value: 5, minBill: 500, active: true },
  { id: "3", name: "Bulk Purchase", type: "flat", value: 100, minBill: 2000, active: false },
];

export default function Discounts() {
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>(SEED);

  const toggle = (id: string) =>
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, active: !r.active } : r)));

  const describe = (r: Rule) => {
    const amount = r.type === "percent" ? `${r.value}% off` : `${rupee(r.value)} off`;
    return r.minBill > 0 ? `${amount} · min bill ${rupee(r.minBill)}` : amount;
  };

  return (
    <PageShell
      title="Discount Rules"
      rightAction={
        <TouchableOpacity
          style={s.headerBtn}
          onPress={() => router.push("/discount-new")}
          activeOpacity={0.7}
        >
          <Feather name="plus" size={20} color={COLORS.white} />
        </TouchableOpacity>
      }
    >
      <Text style={s.sectionLabel}>ACTIVE RULES</Text>

      {rules.length === 0 ? (
        <View style={s.empty}>
          <Feather name="percent" size={40} color={COLORS.textMuted} />
          <Text style={s.emptyText}>No discount rules yet.{"\n"}Tap + to create one.</Text>
        </View>
      ) : (
        rules.map((r) => (
          <View key={r.id} style={s.card}>
            <View style={s.cardTop}>
              <View style={[s.typeBadge, r.type === "percent" ? s.typePercent : s.typeFlat]}>
                <Feather
                  name={r.type === "percent" ? "percent" : "tag"}
                  size={14}
                  color={r.type === "percent" ? COLORS.primary : COLORS.successDark}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{r.name}</Text>
                <Text style={s.rowSub}>{describe(r)}</Text>
              </View>
              <Switch
                value={r.active}
                onValueChange={() => toggle(r.id)}
                trackColor={{ true: COLORS.primary, false: COLORS.surfaceDim }}
                thumbColor={COLORS.white}
              />
            </View>
          </View>
        ))
      )}
    </PageShell>
  );
}

const s = StyleSheet.create({
  headerBtn: {
    width: 36, height: 36, borderRadius: RADIUS.md,
    alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary,
  },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: SPACING.sm, marginBottom: SPACING.xs },
  card: { padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },
  cardTop: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  typeBadge: { width: 40, height: 40, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  typePercent: { backgroundColor: COLORS.primaryLight },
  typeFlat: { backgroundColor: COLORS.successBg },
  rowTitle: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  empty: { alignItems: "center", justifyContent: "center", padding: 48, gap: 10 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontWeight: "600", textAlign: "center" },
});
