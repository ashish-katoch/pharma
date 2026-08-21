import { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";
import { alertMsg } from "@/src/dialog";

const currentMonth = new Date().toISOString().slice(0, 7);

const CATEGORIES = [
  { key: "drug-license", label: "Drug License", sub: "Retail & wholesale certificates" },
  { key: "gst-returns", label: "GST Returns", sub: "Monthly GSTR filings" },
  { key: "schedule-h", label: "Schedule-H Register", sub: "Restricted-drug sales log" },
  { key: "purchase-invoices", label: "Purchase Invoices", sub: "Supplier tax invoices" },
];

export default function RegulatoryVault() {
  const [scheduleHCount, setScheduleHCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<any[]>("/reports/schedule-h?month=" + currentMonth);
      setScheduleHCount(Array.isArray(data) ? data.length : 0);
    } catch {
      setScheduleHCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <PageShell title="Regulatory Vault">
      <Text style={s.intro}>
        Keep drug-license, tax and Schedule-H records in one place for audits and inspections.
      </Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={COLORS.primary} />
      ) : (
        <View style={s.kpiRow}>
          <View style={s.kpiCard}>
            <Text style={s.kpiValue}>{scheduleHCount}</Text>
            <Text style={s.kpiLabel}>SCHEDULE-H SALES</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiValue}>{CATEGORIES.length}</Text>
            <Text style={s.kpiLabel}>DOC CATEGORIES</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={[s.kpiValue, { color: COLORS.success }]}>OK</Text>
            <Text style={s.kpiLabel}>COMPLIANCE</Text>
          </View>
        </View>
      )}

      <Text style={s.sectionLabel}>DOCUMENT REGISTER</Text>

      {CATEGORIES.map((c) => (
        <TouchableOpacity
          key={c.key}
          style={s.row}
          activeOpacity={0.7}
          onPress={() => alertMsg(c.label, "Document management is coming soon.")}
        >
          <View style={s.iconWrap}>
            <Feather name="file-text" size={18} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>{c.label}</Text>
            <Text style={s.rowSub}>{c.sub}</Text>
          </View>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
      ))}
    </PageShell>
  );
}

const s = StyleSheet.create({
  intro: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.md, lineHeight: 18 },
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
    fontSize: 9,
    fontWeight: "700",
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
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
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
});
