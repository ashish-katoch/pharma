import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Switch } from "react-native";
import { Feather } from "@expo/vector-icons";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { alertMsg } from "@/src/dialog";

type Channel = {
  key: string;
  label: string;
  sub: string;
  icon: keyof typeof Feather.glyphMap;
};

const CHANNELS: Channel[] = [
  { key: "lowStock", label: "Low stock", sub: "Medicine below reorder level", icon: "trending-down" },
  { key: "expiring", label: "Expiring soon", sub: "Batches nearing expiry", icon: "clock" },
  { key: "dailySales", label: "Daily sales summary", sub: "End-of-day totals", icon: "bar-chart-2" },
  { key: "creditDue", label: "Credit due reminders", sub: "Customer dues coming up", icon: "credit-card" },
  { key: "newOrder", label: "New order alerts", sub: "Online / counter orders", icon: "shopping-bag" },
];

const DELIVERY = [
  { key: "push", label: "Push" },
  { key: "sms", label: "SMS" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
];

export default function StayNotified() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    lowStock: true,
    expiring: true,
    dailySales: false,
    creditDue: true,
    newOrder: true,
  });
  const [delivery, setDelivery] = useState("push");

  const toggle = (key: string) =>
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));

  const save = () => alertMsg("Saved", "Notification preferences updated.");

  return (
    <PageShell
      title="Notifications"
      footer={
        <TouchableOpacity style={s.primaryBtn} onPress={save} activeOpacity={0.85}>
          <Feather name="save" size={18} color={COLORS.white} />
          <Text style={s.primaryBtnText}>Save Preferences</Text>
        </TouchableOpacity>
      }
    >
      <Text style={s.sectionLabel}>ALERTS</Text>
      {CHANNELS.map((c) => (
        <View key={c.key} style={s.toggleRow}>
          <View style={s.iconWrap}>
            <Feather name={c.icon} size={18} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>{c.label}</Text>
            <Text style={s.rowSub}>{c.sub}</Text>
          </View>
          <Switch
            value={enabled[c.key]}
            onValueChange={() => toggle(c.key)}
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
            thumbColor={COLORS.white}
          />
        </View>
      ))}

      <Text style={s.sectionLabel}>DELIVER VIA</Text>
      <View style={s.pillGroup}>
        {DELIVERY.map((d) => {
          const active = d.key === delivery;
          return (
            <TouchableOpacity
              key={d.key}
              style={[s.pill, active && s.pillActive]}
              onPress={() => setDelivery(d.key)}
              activeOpacity={0.8}
            >
              <Text style={[s.pillText, active && s.pillTextActive]}>{d.label}</Text>
            </TouchableOpacity>
          );
        })}
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
  pillGroup: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  pill: { paddingHorizontal: SPACING.lg, paddingVertical: 10, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { fontSize: 14, fontWeight: "700", color: COLORS.textSecondary },
  pillTextActive: { color: COLORS.white },
  primaryBtn: { minHeight: 52, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
});
