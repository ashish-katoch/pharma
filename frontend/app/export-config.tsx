import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { alertMsg } from "@/src/dialog";

const DATE_FORMATS = ["DD/MM/YYYY", "YYYY-MM-DD"] as const;
const DELIMITERS = ["Comma", "Semicolon"] as const;

type DateFormat = (typeof DATE_FORMATS)[number];
type Delimiter = (typeof DELIMITERS)[number];

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

export default function ExportConfigScreen() {
  const [includeHeaders, setIncludeHeaders] = useState(true);
  const [includeTax, setIncludeTax] = useState(true);
  const [dateFormat, setDateFormat] = useState<DateFormat>("DD/MM/YYYY");
  const [delimiter, setDelimiter] = useState<Delimiter>("Comma");

  const footer = (
    <TouchableOpacity
      style={s.primaryBtn}
      activeOpacity={0.85}
      onPress={() =>
        alertMsg("Saved", "Your export defaults have been updated.")
      }
    >
      <Feather name="save" size={18} color={COLORS.white} />
      <Text style={s.primaryBtnText}>Save Defaults</Text>
    </TouchableOpacity>
  );

  return (
    <PageShell title="Export Settings" footer={footer}>
      <Text style={s.sectionLabel}>COLUMNS</Text>
      <View style={s.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.toggleLabel}>Include headers</Text>
          <Text style={s.toggleDesc}>Add a header row with column names</Text>
        </View>
        <Switch
          value={includeHeaders}
          onValueChange={setIncludeHeaders}
          trackColor={{ false: COLORS.border, true: COLORS.primary }}
          thumbColor={COLORS.white}
        />
      </View>
      <View style={s.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.toggleLabel}>Include tax columns</Text>
          <Text style={s.toggleDesc}>Export CGST / SGST / IGST breakdown</Text>
        </View>
        <Switch
          value={includeTax}
          onValueChange={setIncludeTax}
          trackColor={{ false: COLORS.border, true: COLORS.primary }}
          thumbColor={COLORS.white}
        />
      </View>

      <Text style={[s.sectionLabel, { marginTop: SPACING.lg }]}>DATE FORMAT</Text>
      <PillGroup
        options={DATE_FORMATS}
        value={dateFormat}
        onChange={setDateFormat}
      />

      <Text style={[s.sectionLabel, { marginTop: SPACING.lg }]}>DELIMITER</Text>
      <PillGroup options={DELIMITERS} value={delimiter} onChange={setDelimiter} />
    </PageShell>
  );
}

const s = StyleSheet.create({
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  toggleRow: {
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
  toggleLabel: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  toggleDesc: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
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
