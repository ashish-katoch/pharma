import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { alertMsg } from "@/src/dialog";

const REPORT_TYPES = ["Sales", "Inventory", "GST", "P&L"] as const;
const FORMATS = ["PDF", "CSV", "Excel"] as const;

type ReportType = (typeof REPORT_TYPES)[number];
type Format = (typeof FORMATS)[number];

function PillGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={s.pillRow}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <TouchableOpacity
            key={opt}
            style={[s.pill, active && s.pillActive]}
            activeOpacity={0.7}
            onPress={() => onChange(opt)}
          >
            <Text style={[s.pillText, active && s.pillTextActive]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function ReportBuilderScreen() {
  const router = useRouter();
  const [type, setType] = useState<ReportType>("Sales");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [format, setFormat] = useState<Format>("PDF");

  const generate = () => {
    if (!from || !to) {
      alertMsg("Missing dates", "Please enter both From and To dates.");
      return;
    }
    router.push({
      pathname: "/report-preview",
      params: { type: `${type} Report` },
    });
  };

  const footer = (
    <TouchableOpacity style={s.primaryBtn} activeOpacity={0.85} onPress={generate}>
      <Feather name="bar-chart-2" size={18} color={COLORS.white} />
      <Text style={s.primaryBtnText}>Generate Report</Text>
    </TouchableOpacity>
  );

  return (
    <PageShell title="Report Builder" footer={footer}>
      <Text style={s.fieldLabel}>REPORT TYPE</Text>
      <PillGroup options={REPORT_TYPES} value={type} onChange={setType} />

      <Text style={[s.fieldLabel, { marginTop: SPACING.lg }]}>DATE RANGE</Text>
      <View style={s.dateRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.subLabel}>From</Text>
          <TextInput
            style={s.field}
            value={from}
            onChangeText={setFrom}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.subLabel}>To</Text>
          <TextInput
            style={s.field}
            value={to}
            onChangeText={setTo}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
          />
        </View>
      </View>

      <Text style={[s.fieldLabel, { marginTop: SPACING.lg }]}>FORMAT</Text>
      <PillGroup options={FORMATS} value={format} onChange={setFormat} />
    </PageShell>
  );
}

const s = StyleSheet.create({
  fieldLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  subLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  dateRow: { flexDirection: "row", gap: SPACING.md },
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    fontSize: 15,
    color: COLORS.text,
  },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  pill: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { fontSize: 14, fontWeight: "600", color: COLORS.textSecondary },
  pillTextActive: { color: COLORS.white, fontWeight: "700" },
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
