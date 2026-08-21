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

type Frequency = "Daily" | "Weekly" | "Monthly";
type Schedule = {
  id: string;
  name: string;
  frequency: Frequency;
  nextRun: string;
  enabled: boolean;
};

const SEED: Schedule[] = [
  { id: "1", name: "Daily Sales Summary", frequency: "Daily", nextRun: "Tomorrow, 08:00", enabled: true },
  { id: "2", name: "Weekly GST Report", frequency: "Weekly", nextRun: "Mon, 09:00", enabled: true },
  { id: "3", name: "Monthly P&L Statement", frequency: "Monthly", nextRun: "01 Sep, 07:00", enabled: false },
];

export default function ScheduledReportsScreen() {
  const [schedules, setSchedules] = useState<Schedule[]>(SEED);

  const toggle = (id: string) =>
    setSchedules((list) =>
      list.map((sch) => (sch.id === id ? { ...sch, enabled: !sch.enabled } : sch)),
    );

  const addBtn = (
    <TouchableOpacity
      style={s.iconBtn}
      activeOpacity={0.7}
      onPress={() => alertMsg("Add schedule", "Coming from report builder")}
    >
      <Feather name="plus" size={18} color={COLORS.primary} />
    </TouchableOpacity>
  );

  return (
    <PageShell title="Scheduled Reports" rightAction={addBtn}>
      {schedules.map((sch) => (
        <View key={sch.id} style={s.card}>
          <View style={s.iconWrap}>
            <Feather name="clock" size={16} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{sch.name}</Text>
            <Text style={s.cardSub}>
              {sch.frequency} · Next: {sch.nextRun}
            </Text>
          </View>
          <Switch
            value={sch.enabled}
            onValueChange={() => toggle(sch.id)}
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
            thumbColor={COLORS.white}
          />
        </View>
      ))}
    </PageShell>
  );
}

const s = StyleSheet.create({
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLight,
  },
  card: {
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
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  cardSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
});
