import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Switch } from "react-native";
import { Feather } from "@expo/vector-icons";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { alertMsg } from "@/src/dialog";

type Device = {
  key: string;
  label: string;
  sub: string;
  icon: keyof typeof Feather.glyphMap;
};

const DEVICES: Device[] = [
  { key: "barcode", label: "Barcode scanner", sub: "USB / Bluetooth scanner for billing", icon: "maximize" },
  { key: "cashDrawer", label: "Cash drawer", sub: "Auto-open on cash payment", icon: "inbox" },
  { key: "printer", label: "Receipt printer", sub: "Thermal 58mm / 80mm printer", icon: "printer" },
  { key: "scale", label: "Weighing scale", sub: "Serial scale for loose items", icon: "activity" },
  { key: "display", label: "Customer display", sub: "Second screen showing cart total", icon: "monitor" },
];

export default function HardwareSettings() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    barcode: true,
    cashDrawer: false,
    printer: true,
    scale: false,
    display: false,
  });

  const toggle = (key: string) =>
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));

  const save = () => alertMsg("Saved", "Hardware settings updated.");

  return (
    <PageShell
      title="Hardware"
      footer={
        <TouchableOpacity style={s.primaryBtn} onPress={save} activeOpacity={0.85}>
          <Feather name="save" size={18} color={COLORS.white} />
          <Text style={s.primaryBtnText}>Save</Text>
        </TouchableOpacity>
      }
    >
      <Text style={s.sectionLabel}>CONNECTED DEVICES</Text>
      {DEVICES.map((d) => (
        <View key={d.key} style={s.toggleRow}>
          <View style={s.iconWrap}>
            <Feather name={d.icon} size={18} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>{d.label}</Text>
            <Text style={s.rowSub}>{d.sub}</Text>
          </View>
          <Switch
            value={enabled[d.key]}
            onValueChange={() => toggle(d.key)}
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
            thumbColor={COLORS.white}
          />
        </View>
      ))}

      <View style={s.note}>
        <Feather name="info" size={14} color={COLORS.textMuted} />
        <Text style={s.noteText}>
          Enabled devices are used automatically at billing. Disconnect a device
          here to skip it without unplugging.
        </Text>
      </View>
    </PageShell>
  );
}

const s = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: SPACING.sm, marginBottom: SPACING.xs },
  rowTitle: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },
  iconWrap: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  primaryBtn: { minHeight: 52, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
  note: { flexDirection: "row", gap: 8, padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, marginTop: SPACING.sm },
  noteText: { flex: 1, fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
});
