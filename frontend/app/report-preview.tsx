import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { alertMsg } from "@/src/dialog";

type SummaryRow = { label: string; value: string };

const SUMMARY: SummaryRow[] = [
  { label: "Gross Sales", value: "₹4,82,150" },
  { label: "Tax Collected (GST)", value: "₹58,940" },
  { label: "Discounts Given", value: "₹12,300" },
  { label: "Net Revenue", value: "₹4,11,910" },
  { label: "Bills Generated", value: "1,284" },
  { label: "Average Bill Value", value: "₹375.32" },
];

export default function ReportPreviewScreen() {
  const params = useLocalSearchParams<{ type?: string }>();
  const reportType =
    (typeof params.type === "string" && params.type) || "Sales Report";

  const now = new Date();
  const generatedAt = now.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const footer = (
    <TouchableOpacity
      style={s.primaryBtn}
      activeOpacity={0.85}
      onPress={() =>
        alertMsg("Exported", `${reportType} has been exported as a PDF.`)
      }
    >
      <Feather name="download" size={18} color={COLORS.white} />
      <Text style={s.primaryBtnText}>Export PDF</Text>
    </TouchableOpacity>
  );

  return (
    <PageShell title="Report Preview" footer={footer}>
      <View style={s.paper}>
        <View style={s.paperHead}>
          <Text style={s.reportTitle}>{reportType}</Text>
          <Text style={s.reportMeta}>Period: 01 Aug 2026 – 20 Aug 2026</Text>
          <Text style={s.reportMeta}>Generated: {generatedAt}</Text>
        </View>

        <View style={s.divider} />

        {SUMMARY.map((r, i) => (
          <View
            key={r.label}
            style={[s.sumRow, i === SUMMARY.length - 1 && s.sumRowLast]}
          >
            <Text style={s.sumLabel}>{r.label}</Text>
            <Text style={s.sumValue}>{r.value}</Text>
          </View>
        ))}

        <View style={s.paperFoot}>
          <Feather name="check-circle" size={13} color={COLORS.success} />
          <Text style={s.paperFootText}>
            This is a preview. Figures are illustrative.
          </Text>
        </View>
      </View>
    </PageShell>
  );
}

const s = StyleSheet.create({
  paper: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xl,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  paperHead: { gap: 4 },
  reportTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  reportMeta: { fontSize: 12, color: COLORS.textMuted },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.lg,
  },
  sumRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceContainer,
  },
  sumRowLast: { borderBottomWidth: 0 },
  sumLabel: { fontSize: 14, color: COLORS.textSecondary },
  sumValue: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
  paperFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: SPACING.lg,
  },
  paperFootText: { fontSize: 11, color: COLORS.textMuted },
  primaryBtn: {
    minHeight: 52,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
});
