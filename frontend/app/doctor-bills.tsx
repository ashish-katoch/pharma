import { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { PageShell } from "@/src/components/PageShell";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type DoctorBill = {
  id: string;
  bill_no: string;
  customer_name: string | null;
  total: number;
  created_at: string;
};

export default function DoctorBills() {
  const { doctor_id, doctor_name, month } = useLocalSearchParams<{
    doctor_id: string;
    doctor_name: string;
    month: string;
  }>();
  const router = useRouter();
  const [bills, setBills] = useState<DoctorBill[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        try {
          const data = await api<DoctorBill[]>(
            `/analytics/doctor-bills?doctor_id=${doctor_id}&month=${month}`
          );
          setBills(data);
        } catch {
          /* ignore */
        } finally {
          setLoading(false);
        }
      })();
    }, [doctor_id, month])
  );

  const totalRevenue = bills.reduce((s, b) => s + b.total, 0);

  return (
    <PageShell title={`Dr. ${doctor_name}`} showBack scrollable>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : (
        <>
          <View style={s.summaryCard}>
            <View style={s.summaryCol}>
              <Text style={s.summaryValue}>{bills.length}</Text>
              <Text style={s.summaryLabel}>BILLS</Text>
            </View>
            <View style={s.divider} />
            <View style={s.summaryCol}>
              <Text style={s.summaryValue}>{rupee(totalRevenue)}</Text>
              <Text style={s.summaryLabel}>REVENUE</Text>
            </View>
          </View>

          {bills.length === 0 ? (
            <View style={s.empty}>
              <Feather name="file-text" size={36} color={COLORS.textMuted} />
              <Text style={s.emptyText}>No bills this month</Text>
            </View>
          ) : (
            bills.map((b) => (
              <TouchableOpacity
                key={b.id}
                style={s.card}
                onPress={() => router.push(`/bill/${b.id}` as any)}
                activeOpacity={0.75}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.billNo}>{b.bill_no}</Text>
                  <Text style={s.meta}>
                    {b.customer_name ?? "Walk-in"} · {b.created_at.slice(0, 10)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={s.total}>{rupee(b.total)}</Text>
                  <Feather name="chevron-right" size={16} color={COLORS.textMuted} />
                </View>
              </TouchableOpacity>
            ))
          )}
        </>
      )}
    </PageShell>
  );
}

const s = StyleSheet.create({
  summaryCard: {
    flexDirection: "row",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  summaryCol: { flex: 1, alignItems: "center", gap: 4 },
  summaryValue: { fontSize: 22, fontWeight: "900", color: COLORS.text, letterSpacing: -0.5 },
  summaryLabel: { fontSize: 10, fontWeight: "800", color: COLORS.textMuted, letterSpacing: 1 },
  divider: { width: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.md },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  billNo: { fontSize: 15, fontWeight: "800", color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  total: { fontSize: 15, fontWeight: "800", color: COLORS.primary },
  empty: { alignItems: "center", padding: 48, gap: 10 },
  emptyText: { fontSize: 14, color: COLORS.textMuted, fontWeight: "600" },
});
