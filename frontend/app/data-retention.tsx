import { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";
import { alertMsg } from "@/src/dialog";

const PERIODS = [
  { key: "1y", label: "1 year" },
  { key: "2y", label: "2 years" },
  { key: "3y", label: "3 years" },
  { key: "forever", label: "Forever" },
];

export default function DataRetention() {
  const [period, setPeriod] = useState("2y");
  const [confirming, setConfirming] = useState(false);
  const [purging, setPurging] = useState(false);

  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? "";

  const purge = useCallback(async () => {
    setPurging(true);
    try {
      await api("/admin/purge-old-data", { method: "POST" });
      alertMsg("Done", "Old data purged successfully.");
    } catch {
      alertMsg("Failed", "Could not purge old data. Try again later.");
    } finally {
      setPurging(false);
      setConfirming(false);
    }
  }, []);

  return (
    <PageShell title="Data Retention">
      <Text style={s.sectionLabel}>KEEP RECORDS FOR</Text>
      <View style={s.pillGroup}>
        {PERIODS.map((p) => {
          const active = p.key === period;
          return (
            <TouchableOpacity
              key={p.key}
              style={[s.pill, active && s.pillActive]}
              onPress={() => setPeriod(p.key)}
              activeOpacity={0.8}
            >
              <Text style={[s.pillText, active && s.pillTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.infoCard}>
        <Feather name="archive" size={16} color={COLORS.info} />
        <Text style={s.infoText}>
          Bills, invoices and logs older than{" "}
          <Text style={{ fontWeight: "800" }}>{periodLabel.toLowerCase()}</Text> are
          archived and removed from active storage. GST records required by law are
          always retained.
        </Text>
      </View>

      <Text style={s.sectionLabel}>DANGER ZONE</Text>
      <View style={s.dangerCard}>
        <Text style={s.dangerTitle}>Purge old data</Text>
        <Text style={s.dangerSub}>
          Permanently delete archived records past the retention period. This cannot
          be undone. Owner only.
        </Text>

        {!confirming ? (
          <TouchableOpacity
            style={s.dangerBtn}
            onPress={() => setConfirming(true)}
            activeOpacity={0.85}
          >
            <Feather name="trash-2" size={16} color={COLORS.danger} />
            <Text style={s.dangerBtnText}>Purge Old Data</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ gap: SPACING.sm }}>
            <Text style={s.confirmText}>Are you sure? This is permanent.</Text>
            <View style={{ flexDirection: "row", gap: SPACING.sm }}>
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => setConfirming(false)}
                disabled={purging}
                activeOpacity={0.8}
              >
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.dangerSolidBtn}
                onPress={purge}
                disabled={purging}
                activeOpacity={0.85}
              >
                {purging ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <Text style={s.dangerSolidText}>Yes, Purge</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </PageShell>
  );
}

const s = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: SPACING.sm, marginBottom: SPACING.xs },
  pillGroup: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginBottom: SPACING.md },
  pill: { paddingHorizontal: SPACING.lg, paddingVertical: 10, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { fontSize: 14, fontWeight: "700", color: COLORS.textSecondary },
  pillTextActive: { color: COLORS.white },
  infoCard: { flexDirection: "row", gap: SPACING.sm, padding: SPACING.lg, backgroundColor: COLORS.infoBg, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primaryFixed, marginBottom: SPACING.sm },
  infoText: { flex: 1, fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
  dangerCard: { padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.dangerBg, gap: SPACING.sm },
  dangerTitle: { fontSize: 15, fontWeight: "800", color: COLORS.danger },
  dangerSub: { fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
  dangerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 46, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.danger, backgroundColor: COLORS.dangerBg, marginTop: SPACING.xs },
  dangerBtnText: { color: COLORS.danger, fontSize: 15, fontWeight: "800" },
  confirmText: { fontSize: 13, fontWeight: "700", color: COLORS.danger },
  cancelBtn: { flex: 1, minHeight: 46, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.white },
  cancelBtnText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: "700" },
  dangerSolidBtn: { flex: 1, minHeight: 46, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.danger },
  dangerSolidText: { color: COLORS.white, fontSize: 15, fontWeight: "800" },
});
