import { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";

type Customer = { id: string; name: string; phone: string | null; loyalty_points: number };

const num = (n: number) => (n || 0).toLocaleString("en-IN");

export default function Loyalty() {
  const router = useRouter();
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

  const members = [...list].sort((a, b) => (b.loyalty_points || 0) - (a.loyalty_points || 0));
  const totalMembers = list.length;
  const totalPoints = list.reduce((sum, c) => sum + (c.loyalty_points || 0), 0);

  return (
    <PageShell
      title="Loyalty Program"
      rightAction={
        <TouchableOpacity
          style={s.headerBtn}
          onPress={() => router.push("/loyalty-history")}
          activeOpacity={0.7}
        >
          <Feather name="clock" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      }
    >
      <View style={s.kpiRow}>
        <View style={s.kpiCard}>
          <Feather name="users" size={18} color={COLORS.primary} />
          <Text style={s.kpiValue}>{num(totalMembers)}</Text>
          <Text style={s.kpiLabel}>TOTAL MEMBERS</Text>
        </View>
        <View style={s.kpiCard}>
          <Feather name="star" size={18} color={COLORS.warning} />
          <Text style={s.kpiValue}>{num(totalPoints)}</Text>
          <Text style={s.kpiLabel}>POINTS ISSUED</Text>
        </View>
      </View>

      <Text style={s.sectionLabel}>MEMBERS</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : members.length === 0 ? (
        <View style={s.empty}>
          <Feather name="award" size={40} color={COLORS.textMuted} />
          <Text style={s.emptyText}>No loyalty members yet.{"\n"}Points accrue as customers shop.</Text>
        </View>
      ) : (
        members.map((c) => (
          <View key={c.id} style={s.row}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{(c.name?.[0] ?? "?").toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle} numberOfLines={1}>{c.name}</Text>
              {c.phone ? <Text style={s.rowSub}>{c.phone}</Text> : null}
            </View>
            <View style={s.pointsBadge}>
              <Feather name="star" size={12} color={COLORS.warningDark} />
              <Text style={s.pointsText}>{num(c.loyalty_points || 0)} pts</Text>
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
    alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primaryLight,
  },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: SPACING.sm, marginBottom: SPACING.xs },
  kpiRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.sm },
  kpiCard: { flex: 1, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, alignItems: "center", gap: 4 },
  kpiValue: { fontSize: 20, fontWeight: "900", color: COLORS.text, letterSpacing: -0.5 },
  kpiLabel: { fontSize: 10, fontWeight: "700", color: COLORS.textMuted, letterSpacing: 0.5, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },
  rowTitle: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontWeight: "800", color: COLORS.primary },
  pointsBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill, backgroundColor: COLORS.warningBg },
  pointsText: { fontSize: 12, fontWeight: "800", color: COLORS.warningDark },
  empty: { alignItems: "center", justifyContent: "center", padding: 48, gap: 10 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontWeight: "600", textAlign: "center" },
});
