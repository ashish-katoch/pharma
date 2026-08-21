import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";

type Shift = {
  id?: string;
  user_email?: string;
  clock_in?: string;
  clock_out?: string | null;
  opening_cash?: number;
  closing_cash?: number;
  total_sales?: number;
};

const rupee = (n: number) =>
  "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function fmt(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default function ShiftSummary() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Shift[]>("/shifts");
      setShifts(Array.isArray(data) ? data : []);
    } catch {
      setShifts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <PageShell title="Shift Summary">
      <Text style={s.intro}>Recent staff shifts with cash and sales totals.</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={COLORS.primary} />
      ) : shifts.length === 0 ? (
        <View style={s.empty}>
          <Feather name="clock" size={40} color={COLORS.textMuted} />
          <Text style={s.emptyText}>No shifts recorded yet</Text>
        </View>
      ) : (
        shifts.map((sh, i) => {
          const active = !sh.clock_out;
          return (
            <View key={sh.id ?? String(i)} style={[s.card, active && s.cardActive]}>
              <View style={s.cardHead}>
                <View style={s.avatar}>
                  <Feather name="user" size={16} color={COLORS.white} />
                </View>
                <Text style={s.staff} numberOfLines={1}>
                  {sh.user_email ?? "Staff member"}
                </Text>
                <View style={[s.badge, active ? s.badgeActive : s.badgeDone]}>
                  <Text style={[s.badgeText, active ? s.badgeTextActive : s.badgeTextDone]}>
                    {active ? "Active" : "Closed"}
                  </Text>
                </View>
              </View>

              <Text style={s.times}>
                In: {fmt(sh.clock_in) ?? "—"} · Out: {fmt(sh.clock_out) ?? "active"}
              </Text>

              {(sh.opening_cash != null || sh.closing_cash != null || sh.total_sales != null) && (
                <View style={s.statsRow}>
                  {sh.opening_cash != null && (
                    <Stat label="OPENING" value={rupee(sh.opening_cash)} />
                  )}
                  {sh.closing_cash != null && (
                    <Stat label="CLOSING" value={rupee(sh.closing_cash)} />
                  )}
                  {sh.total_sales != null && (
                    <Stat label="SALES" value={rupee(sh.total_sales)} />
                  )}
                </View>
              )}
            </View>
          );
        })
      )}
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  intro: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.md },
  card: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  cardActive: { borderColor: COLORS.primary, borderWidth: 1.5 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  staff: { flex: 1, fontSize: 15, fontWeight: "700", color: COLORS.text },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  badgeActive: { backgroundColor: COLORS.primaryLight },
  badgeDone: { backgroundColor: COLORS.surfaceContainer },
  badgeText: { fontSize: 11, fontWeight: "800" },
  badgeTextActive: { color: COLORS.primary },
  badgeTextDone: { color: COLORS.textSecondary },
  times: { fontSize: 12, color: COLORS.textSecondary },
  statsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
  },
  stat: { flex: 1, gap: 2 },
  statValue: { fontSize: 15, fontWeight: "800", color: COLORS.text },
  statLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5, color: COLORS.textMuted },
  empty: { alignItems: "center", justifyContent: "center", padding: 48, gap: 10 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontWeight: "600", textAlign: "center" },
});
