import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { alertMsg } from "@/src/dialog";

const DATA_TYPES = [
  "Medicines",
  "Bills",
  "Customers",
  "Suppliers",
  "Purchases",
  "Expenses",
] as const;

const FORMATS = ["CSV", "Excel"] as const;
type Format = (typeof FORMATS)[number];

export default function BulkExportScreen() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [format, setFormat] = useState<Format>("CSV");

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const count = selected.size;

  const doExport = () => {
    if (count === 0) {
      alertMsg("Nothing selected", "Pick at least one dataset to export.");
      return;
    }
    alertMsg(
      "Export started",
      `${count} dataset${count > 1 ? "s" : ""} will be exported as ${format}.`,
    );
  };

  const footer = (
    <TouchableOpacity style={s.primaryBtn} activeOpacity={0.85} onPress={doExport}>
      <Feather name="download" size={18} color={COLORS.white} />
      <Text style={s.primaryBtnText}>
        Export {count} dataset{count === 1 ? "" : "s"}
      </Text>
    </TouchableOpacity>
  );

  return (
    <PageShell title="Bulk Export" footer={footer}>
      <Text style={s.sectionLabel}>DATA TYPES</Text>
      {DATA_TYPES.map((name) => {
        const checked = selected.has(name);
        return (
          <TouchableOpacity
            key={name}
            style={s.checkRow}
            activeOpacity={0.7}
            onPress={() => toggle(name)}
          >
            <View style={[s.checkbox, checked && s.checkboxOn]}>
              {checked && <Feather name="check" size={14} color={COLORS.white} />}
            </View>
            <Text style={s.checkLabel}>{name}</Text>
          </TouchableOpacity>
        );
      })}

      <Text style={[s.sectionLabel, { marginTop: SPACING.lg }]}>DATE RANGE</Text>
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

      <Text style={[s.sectionLabel, { marginTop: SPACING.lg }]}>FORMAT</Text>
      <View style={s.pillRow}>
        {FORMATS.map((opt) => {
          const active = opt === format;
          return (
            <TouchableOpacity
              key={opt}
              style={[s.pill, active && s.pillActive]}
              activeOpacity={0.7}
              onPress={() => setFormat(opt)}
            >
              <Text style={[s.pillText, active && s.pillTextActive]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
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
  subLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  checkRow: {
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
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: RADIUS.sm,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.white,
  },
  checkboxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: COLORS.text },
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
