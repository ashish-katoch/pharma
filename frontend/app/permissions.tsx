import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Switch } from "react-native";
import { Feather } from "@expo/vector-icons";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { alertMsg } from "@/src/dialog";

const ROLES = ["Manager", "Cashier", "Pharmacist"] as const;
type Role = (typeof ROLES)[number];

const PERMISSIONS: { key: string; label: string }[] = [
  { key: "viewReports", label: "View reports" },
  { key: "editInventory", label: "Edit inventory" },
  { key: "createBills", label: "Create bills" },
  { key: "giveDiscounts", label: "Give discounts" },
  { key: "manageStaff", label: "Manage staff" },
  { key: "voidBills", label: "Void bills" },
  { key: "exportData", label: "Export data" },
];

type PermMap = Record<string, boolean>;

const DEFAULTS: Record<Role, PermMap> = {
  Manager: {
    viewReports: true,
    editInventory: true,
    createBills: true,
    giveDiscounts: true,
    manageStaff: true,
    voidBills: true,
    exportData: true,
  },
  Cashier: {
    viewReports: false,
    editInventory: false,
    createBills: true,
    giveDiscounts: false,
    manageStaff: false,
    voidBills: false,
    exportData: false,
  },
  Pharmacist: {
    viewReports: true,
    editInventory: true,
    createBills: true,
    giveDiscounts: true,
    manageStaff: false,
    voidBills: false,
    exportData: false,
  },
};

export default function Permissions() {
  const [role, setRole] = useState<Role>("Manager");
  const [perms, setPerms] = useState<Record<Role, PermMap>>(DEFAULTS);

  const toggle = (key: string) =>
    setPerms((prev) => ({
      ...prev,
      [role]: { ...prev[role], [key]: !prev[role][key] },
    }));

  const save = () => alertMsg("Saved", `Permissions updated for ${role}.`);

  return (
    <PageShell
      title="Permissions"
      footer={
        <TouchableOpacity style={s.primaryBtn} onPress={save} activeOpacity={0.85}>
          <Feather name="save" size={18} color={COLORS.white} />
          <Text style={s.primaryBtnText}>Save Permissions</Text>
        </TouchableOpacity>
      }
    >
      <Text style={s.sectionLabel}>ROLE</Text>
      <View style={s.pillGroup}>
        {ROLES.map((r) => {
          const active = r === role;
          return (
            <TouchableOpacity
              key={r}
              style={[s.pill, active && s.pillActive]}
              onPress={() => setRole(r)}
              activeOpacity={0.8}
            >
              <Text style={[s.pillText, active && s.pillTextActive]}>{r}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={s.sectionLabel}>{role.toUpperCase()} CAN</Text>
      {PERMISSIONS.map((p) => (
        <View key={p.key} style={s.toggleRow}>
          <Text style={s.rowTitle}>{p.label}</Text>
          <Switch
            value={perms[role][p.key]}
            onValueChange={() => toggle(p.key)}
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
            thumbColor={COLORS.white}
          />
        </View>
      ))}

      <View style={s.note}>
        <Feather name="shield" size={14} color={COLORS.textMuted} />
        <Text style={s.noteText}>
          The Owner role always has every permission and cannot be restricted.
        </Text>
      </View>
    </PageShell>
  );
}

const s = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: SPACING.sm, marginBottom: SPACING.xs },
  pillGroup: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginBottom: SPACING.sm },
  pill: { paddingHorizontal: SPACING.lg, paddingVertical: 10, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { fontSize: 14, fontWeight: "700", color: COLORS.textSecondary },
  pillTextActive: { color: COLORS.white },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.md, padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: "600", color: COLORS.text },
  primaryBtn: { minHeight: 52, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
  note: { flexDirection: "row", gap: 8, padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, marginTop: SPACING.sm },
  noteText: { flex: 1, fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
});
