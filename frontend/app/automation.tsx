import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Switch } from "react-native";
import { Feather } from "@expo/vector-icons";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { alertMsg } from "@/src/dialog";

type Rule = {
  key: string;
  label: string;
  sub: string;
  icon: keyof typeof Feather.glyphMap;
};

const RULES: Rule[] = [
  { key: "reorder", label: "Auto-reorder low stock", sub: "Draft a purchase order when stock hits reorder level", icon: "shopping-cart" },
  { key: "backup", label: "Auto-backup nightly", sub: "Back up your data every night at 2:00 AM", icon: "cloud" },
  { key: "lowStock", label: "Low-stock alerts", sub: "Notify when a medicine runs low", icon: "alert-triangle" },
  { key: "expiry", label: "Expiry alerts", sub: "Warn about batches nearing expiry", icon: "clock" },
  { key: "gst", label: "Auto-send GST reminders", sub: "Remind you before monthly filing due dates", icon: "file-text" },
];

export default function Automation() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    reorder: false,
    backup: true,
    lowStock: true,
    expiry: true,
    gst: false,
  });

  const toggle = (key: string) =>
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));

  const save = () => alertMsg("Saved", "Automation rules updated.");

  return (
    <PageShell
      title="Automation"
      footer={
        <TouchableOpacity style={s.primaryBtn} onPress={save} activeOpacity={0.85}>
          <Feather name="save" size={18} color={COLORS.white} />
          <Text style={s.primaryBtnText}>Save Rules</Text>
        </TouchableOpacity>
      }
    >
      <Text style={s.sectionLabel}>AUTOMATION RULES</Text>
      {RULES.map((r) => (
        <View key={r.key} style={s.toggleRow}>
          <View style={s.iconWrap}>
            <Feather name={r.icon} size={18} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>{r.label}</Text>
            <Text style={s.rowSub}>{r.sub}</Text>
          </View>
          <Switch
            value={enabled[r.key]}
            onValueChange={() => toggle(r.key)}
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
            thumbColor={COLORS.white}
          />
        </View>
      ))}

      <View style={s.note}>
        <Feather name="zap" size={14} color={COLORS.textMuted} />
        <Text style={s.noteText}>
          Rules run in the background automatically. You can review and undo any
          automated action from the activity log.
        </Text>
      </View>
    </PageShell>
  );
}

const s = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: SPACING.sm, marginBottom: SPACING.xs },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },
  iconWrap: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  primaryBtn: { minHeight: 52, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
  note: { flexDirection: "row", gap: 8, padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, marginTop: SPACING.sm },
  noteText: { flex: 1, fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
});
