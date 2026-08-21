import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";

type Staff = {
  email?: string;
  bill_count?: number;
  revenue?: number;
  discount_given?: number;
};

const currentMonth = new Date().toISOString().slice(0, 7);
const rupee = (n: number) =>
  "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function StaffPayroll() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<any>("/analytics/staff?month=" + currentMonth);
      const list: Staff[] = Array.isArray(data) ? data : (data?.staff ?? []);
      setStaff(list);
    } catch {
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalRevenue = staff.reduce((sum, m) => sum + (m.revenue ?? 0), 0);

  return (
    <PageShell title="Staff Payroll">
      <Text style={s.intro}>Staff contribution and revenue for {currentMonth}.</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={COLORS.primary} />
      ) : (
        <>
          <View style={s.kpiRow}>
            <View style={s.kpiCard}>
              <Text style={s.kpiValue}>{staff.length}</Text>
              <Text style={s.kpiLabel}>STAFF</Text>
            </View>
            <View style={s.kpiCard}>
              <Text style={s.kpiValue}>{rupee(totalRevenue)}</Text>
              <Text style={s.kpiLabel}>TOTAL REVENUE</Text>
            </View>
          </View>

          {staff.length === 0 ? (
            <View style={s.empty}>
              <Feather name="users" size={40} color={COLORS.textMuted} />
              <Text style={s.emptyText}>No staff activity this month</Text>
            </View>
          ) : (
            staff.map((m, i) => (
              <View key={m.email ?? String(i)} style={s.row}>
                <View style={s.avatar}>
                  <Feather name="user" size={16} color={COLORS.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>
                    {m.email ?? "Unknown staff"}
                  </Text>
                  <Text style={s.rowSub}>
                    {m.bill_count ?? 0} bills · {rupee(m.revenue ?? 0)}
                  </Text>
                </View>
                {m.discount_given ? (
                  <View style={s.discBadge}>
                    <Text style={s.discText}>-{rupee(m.discount_given)}</Text>
                  </View>
                ) : null}
              </View>
            ))
          )}
        </>
      )}
    </PageShell>
  );
}

const s = StyleSheet.create({
  intro: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.md },
  kpiRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.md },
  kpiCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    alignItems: "center",
    gap: 4,
  },
  kpiValue: { fontSize: 20, fontWeight: "900", color: COLORS.text, letterSpacing: -0.5 },
  kpiLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  discBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.warningBg,
  },
  discText: { fontSize: 11, fontWeight: "800", color: COLORS.warningDark },
  empty: { alignItems: "center", justifyContent: "center", padding: 48, gap: 10 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontWeight: "600", textAlign: "center" },
});
