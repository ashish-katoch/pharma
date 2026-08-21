import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";

type Customer = { id: string; name: string; phone: string | null; loyalty_points: number };

const num = (n: number) => (n || 0).toLocaleString("en-IN");

export default function LoyaltyHistory() {
  const [list, setList] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setList(await api<Customer[]>("/customers"));
    } catch {
      /* ignore — show empty state */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const feed = [...list]
    .filter((c) => (c.loyalty_points || 0) > 0)
    .sort((a, b) => (b.loyalty_points || 0) - (a.loyalty_points || 0));

  return (
    <PageShell title="Points History">
      <Text style={s.sectionLabel}>RECENT ACTIVITY</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : feed.length === 0 ? (
        <View style={s.empty}>
          <Feather name="award" size={40} color={COLORS.textMuted} />
          <Text style={s.emptyText}>No points earned yet.{"\n"}Activity appears here as customers earn rewards.</Text>
        </View>
      ) : (
        feed.map((c) => (
          <View key={c.id} style={s.row}>
            <View style={s.iconWrap}>
              <Feather name="award" size={18} color={COLORS.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle} numberOfLines={1}>
                Earned {num(c.loyalty_points || 0)} pts · {c.name}
              </Text>
              {c.phone ? <Text style={s.rowSub}>{c.phone}</Text> : null}
            </View>
            <Text style={s.amount}>+{num(c.loyalty_points || 0)}</Text>
          </View>
        ))
      )}
    </PageShell>
  );
}

const s = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: SPACING.sm, marginBottom: SPACING.xs },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.successBg, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: "900", color: COLORS.success },
  empty: { alignItems: "center", justifyContent: "center", padding: 48, gap: 10 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontWeight: "600", textAlign: "center" },
});
