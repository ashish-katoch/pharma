import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";

type Row = {
  date?: string;
  patient_name?: string;
  doctor_name?: string;
  medicine_name?: string;
  quantity?: number;
  bill_no?: string;
};

const currentMonth = new Date().toISOString().slice(0, 7);

export default function Prescriptions() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Row[]>("/reports/schedule-h?month=" + currentMonth);
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <PageShell title="Prescriptions">
      <Text style={s.intro}>
        Schedule-H prescription records logged this month ({currentMonth}).
      </Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={COLORS.primary} />
      ) : rows.length === 0 ? (
        <View style={s.empty}>
          <Feather name="file-text" size={40} color={COLORS.textMuted} />
          <Text style={s.emptyText}>No prescription records this month</Text>
        </View>
      ) : (
        rows.map((r, i) => (
          <View key={r.bill_no ?? String(i)} style={s.card}>
            <View style={s.cardHead}>
              <View style={s.iconWrap}>
                <Feather name="file-text" size={16} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.medicine}>{r.medicine_name ?? "Medicine"}</Text>
                <Text style={s.meta}>
                  {(r.patient_name ?? "Patient")} · Dr {r.doctor_name ?? "—"}
                </Text>
              </View>
            </View>
            <View style={s.footRow}>
              <Text style={s.foot}>
                {(r.date ?? "").slice(0, 10) || "—"} · Qty {r.quantity ?? 0}
              </Text>
              {r.bill_no ? <Text style={s.billNo}>#{r.bill_no}</Text> : null}
            </View>
          </View>
        ))
      )}
    </PageShell>
  );
}

const s = StyleSheet.create({
  intro: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.md, lineHeight: 18 },
  card: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  medicine: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  footRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
  },
  foot: { fontSize: 12, color: COLORS.textSecondary },
  billNo: { fontSize: 11, fontWeight: "800", color: COLORS.primary },
  empty: { alignItems: "center", justifyContent: "center", padding: 48, gap: 10 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontWeight: "600", textAlign: "center" },
});
