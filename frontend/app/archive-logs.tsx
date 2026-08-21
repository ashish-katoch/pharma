import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { alertMsg } from "@/src/dialog";

type ArchivePeriod = { period: string; records: number; sizeMB: number };

function seedPeriods(): ArchivePeriod[] {
  const now = new Date();
  const fmt = (d: Date) =>
    d.toLocaleString("en-US", { month: "long", year: "numeric" });
  return [1, 2, 3].map((back) => {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    return {
      period: fmt(d),
      records: 1200 + back * 640,
      sizeMB: +(2.4 + back * 1.7).toFixed(1),
    };
  });
}

export default function ArchiveLogsScreen() {
  const periods = seedPeriods();

  return (
    <PageShell title="Archived Records">
      <View style={s.note}>
        <Feather name="archive" size={16} color={COLORS.info} />
        <Text style={s.noteText}>
          Older records are moved to cold storage to keep the app fast. Archived
          data is retained for compliance and can be restored on demand.
        </Text>
      </View>

      <Text style={s.sectionLabel}>ARCHIVED PERIODS</Text>

      {periods.map((p) => (
        <View key={p.period} style={s.card}>
          <View style={s.cardHead}>
            <View style={s.iconWrap}>
              <Feather name="folder" size={16} color={COLORS.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.periodTitle}>{p.period}</Text>
              <Text style={s.periodSub}>
                {p.records.toLocaleString()} records · {p.sizeMB} MB
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={s.ghostBtn}
            activeOpacity={0.7}
            onPress={() =>
              alertMsg(
                "Restore requested",
                `${p.period} will be restored from the archive shortly.`,
              )
            }
          >
            <Feather name="rotate-ccw" size={14} color={COLORS.primary} />
            <Text style={s.ghostBtnText}>Restore</Text>
          </TouchableOpacity>
        </View>
      ))}
    </PageShell>
  );
}

const s = StyleSheet.create({
  note: {
    flexDirection: "row",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.infoBg,
    marginBottom: SPACING.md,
  },
  noteText: { flex: 1, fontSize: 12, lineHeight: 18, color: COLORS.textSecondary },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  card: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  periodTitle: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  periodSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 40,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  ghostBtnText: { color: COLORS.primary, fontSize: 14, fontWeight: "700" },
});
