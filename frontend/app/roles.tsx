import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { alertMsg } from "@/src/dialog";

type Role = {
  key: string;
  name: string;
  desc: string;
  members: number;
  icon: keyof typeof Feather.glyphMap;
  locked?: boolean;
};

const ROLES: Role[] = [
  { key: "owner", name: "Owner", desc: "Full access to everything, billing and staff", members: 1, icon: "award", locked: true },
  { key: "manager", name: "Manager", desc: "Runs the shop day-to-day, sees reports", members: 2, icon: "briefcase" },
  { key: "pharmacist", name: "Pharmacist", desc: "Dispenses and manages inventory", members: 3, icon: "activity" },
  { key: "cashier", name: "Cashier", desc: "Creates bills and takes payments", members: 4, icon: "credit-card" },
];

export default function Roles() {
  const router = useRouter();
  const [roles] = useState<Role[]>(ROLES);

  return (
    <PageShell
      title="Roles"
      rightAction={
        <TouchableOpacity
          onPress={() => alertMsg("Add role", "Create a custom role with its own permission set.")}
          activeOpacity={0.7}
          style={s.addBtn}
        >
          <Feather name="plus" size={20} color={COLORS.primary} />
        </TouchableOpacity>
      }
    >
      <Text style={s.sectionLabel}>TEAM ROLES</Text>
      {roles.map((r) => (
        <TouchableOpacity
          key={r.key}
          style={s.card}
          onPress={() => router.push("/permissions")}
          activeOpacity={0.7}
        >
          <View style={s.iconWrap}>
            <Feather name={r.icon} size={18} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={s.nameRow}>
              <Text style={s.name}>{r.name}</Text>
              {r.locked && (
                <View style={s.lockBadge}>
                  <Feather name="lock" size={10} color={COLORS.textMuted} />
                  <Text style={s.lockText}>Fixed</Text>
                </View>
              )}
            </View>
            <Text style={s.desc}>{r.desc}</Text>
          </View>
          <View style={s.memberBadge}>
            <Text style={s.memberCount}>{r.members}</Text>
            <Text style={s.memberLabel}>{r.members === 1 ? "member" : "members"}</Text>
          </View>
        </TouchableOpacity>
      ))}

      <View style={s.note}>
        <Feather name="info" size={14} color={COLORS.textMuted} />
        <Text style={s.noteText}>
          Tap a role to edit its permissions. The Owner role is fixed and always has
          full access.
        </Text>
      </View>
    </PageShell>
  );
}

const s = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: SPACING.sm, marginBottom: SPACING.xs },
  addBtn: { width: 36, height: 36, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primaryLight },
  card: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },
  iconWrap: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  name: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  lockBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.sm, backgroundColor: COLORS.surfaceContainer },
  lockText: { fontSize: 10, fontWeight: "700", color: COLORS.textMuted },
  desc: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  memberBadge: { alignItems: "center", minWidth: 52 },
  memberCount: { fontSize: 18, fontWeight: "900", color: COLORS.primary, letterSpacing: -0.5 },
  memberLabel: { fontSize: 10, fontWeight: "700", color: COLORS.textMuted },
  note: { flexDirection: "row", gap: 8, padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, marginTop: SPACING.sm },
  noteText: { flex: 1, fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
});
