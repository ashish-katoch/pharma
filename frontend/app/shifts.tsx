import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator,
  TouchableOpacity, Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth, useIsOwner } from "@/src/auth";
import { alertMsg } from "@/src/dialog";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { PageShell } from "@/src/components/PageShell";
import { EmptyState } from "@/src/components/ui/EmptyState";

type Shift = {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  clock_in: string;
  clock_out: string | null;
  duration_minutes: number | null;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function fmtDuration(mins: number | null) {
  if (mins === null) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function Shifts() {
  const router = useRouter();
  const { user } = useAuth();
  const isOwner = useIsOwner();
  const today = new Date().toISOString().slice(0, 10);

  const [active, setActive] = useState<Shift | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [clocking, setClocking] = useState(false);
  const [elapsed, setElapsed] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [activeRes, listRes] = await Promise.all([
        api<Shift | Record<string, never>>("/shifts/active"),
        isOwner
          ? api<Shift[]>(`/shifts?date=${today}`)
          : api<Shift[]>(`/shifts?date=${today}&user_id=${user?.id ?? ""}`),
      ]);
      setActive("id" in activeRes ? activeRes as Shift : null);
      setShifts(listRes);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [isOwner, user?.id, today]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Live elapsed timer when clocked in
  useEffect(() => {
    if (!active) { setElapsed(""); return; }
    const tick = () => {
      const diff = Math.floor((Date.now() - new Date(active.clock_in).getTime()) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsed(`${h > 0 ? `${h}h ` : ""}${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active]);

  const clockIn = async () => {
    setClocking(true);
    try {
      const shift = await api<Shift>("/shifts/clock-in", { method: "POST" });
      setActive(shift);
      await load();
    } catch (e: any) {
      alertMsg("Error", e?.message || "Clock-in failed");
    } finally { setClocking(false); }
  };

  const clockOut = () => {
    Alert.alert("Clock Out", "End your shift now?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clock Out", style: "destructive", onPress: async () => {
          setClocking(true);
          try {
            await api("/shifts/clock-out", { method: "POST" });
            setActive(null);
            await load();
          } catch (e: any) {
            alertMsg("Error", e?.message || "Clock-out failed");
          } finally { setClocking(false); }
        },
      },
    ]);
  };

  const totalMins = shifts
    .filter((s) => s.duration_minutes !== null)
    .reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);

  return (
    <PageShell title="Shift Tracking" showBack scrollable={false} noPadding>
      {/* Clock card */}
      <View style={[styles.clockCard, active && styles.clockCardActive]}>
        <View style={styles.clockInfo}>
          <Feather
            name={active ? "clock" : "moon"}
            size={28}
            color={active ? COLORS.white : COLORS.textMuted}
          />
          <View style={{ flex: 1 }}>
            {active ? (
              <>
                <Text style={styles.clockStatus}>On Shift</Text>
                <Text style={styles.clockSince}>Since {fmtTime(active.clock_in)}</Text>
                <Text style={styles.clockElapsed}>{elapsed}</Text>
              </>
            ) : (
              <>
                <Text style={styles.clockStatusOff}>Not Clocked In</Text>
                <Text style={styles.clockSinceOff}>Tap to start your shift</Text>
              </>
            )}
          </View>
        </View>
        <TouchableOpacity
          style={[styles.clockBtn, active && styles.clockBtnOut, clocking && { opacity: 0.6 }]}
          onPress={active ? clockOut : clockIn}
          disabled={clocking}
        >
          {clocking
            ? <ActivityIndicator color={active ? COLORS.danger : COLORS.white} size="small" />
            : <Text style={[styles.clockBtnText, active && styles.clockBtnTextOut]}>
                {active ? "Clock Out" : "Clock In"}
              </Text>}
        </TouchableOpacity>
      </View>

      {/* Today's shifts list */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={shifts}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState icon="clock" title="No shifts today" subtitle="Clock in to start tracking your shift." />
          }
          ListHeaderComponent={
            shifts.length > 0 ? (
              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{shifts.length}</Text>
                  <Text style={styles.summaryLabel}>Shifts Today</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{fmtDuration(totalMins)}</Text>
                  <Text style={styles.summaryLabel}>Total Hours</Text>
                </View>
              </View>
            ) : null
          }
          renderItem={({ item: s }) => (
            <View style={[styles.shiftCard, !s.clock_out && styles.shiftCardActive]}>
              {isOwner && (
                <View style={styles.staffAvatar}>
                  <Feather name="user" size={16} color={COLORS.white} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                {isOwner && <Text style={styles.shiftStaff}>{s.user_name}</Text>}
                <View style={styles.shiftTimeRow}>
                  <View style={styles.timeBlock}>
                    <Text style={styles.timeLabel}>IN</Text>
                    <Text style={styles.timeValue}>{fmtTime(s.clock_in)}</Text>
                    <Text style={styles.timeDate}>{fmtDate(s.clock_in)}</Text>
                  </View>
                  <Feather name="arrow-right" size={14} color={COLORS.textMuted} />
                  <View style={styles.timeBlock}>
                    <Text style={styles.timeLabel}>OUT</Text>
                    {s.clock_out ? (
                      <>
                        <Text style={styles.timeValue}>{fmtTime(s.clock_out)}</Text>
                        <Text style={styles.timeDate}>{fmtDate(s.clock_out)}</Text>
                      </>
                    ) : (
                      <Text style={[styles.timeValue, { color: COLORS.primary }]}>Active</Text>
                    )}
                  </View>
                </View>
              </View>
              <View style={[styles.durationBadge, !s.clock_out && styles.durationBadgeActive]}>
                <Text style={[styles.durationText, !s.clock_out && styles.durationTextActive]}>
                  {s.clock_out ? fmtDuration(s.duration_minutes) : elapsed || "—"}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  clockCard: {
    margin: SPACING.lg, borderRadius: RADIUS.lg, padding: SPACING.lg,
    backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.border,
    gap: SPACING.md,
  },
  clockCardActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  clockInfo: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  clockStatus: { fontSize: 18, fontWeight: "900", color: COLORS.white },
  clockSince: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  clockElapsed: { fontSize: 22, fontWeight: "900", color: COLORS.white, marginTop: 4, letterSpacing: -0.5 },
  clockStatusOff: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  clockSinceOff: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  clockBtn: {
    alignItems: "center", justifyContent: "center", borderRadius: RADIUS.md,
    paddingVertical: 14, backgroundColor: "rgba(255,255,255,0.25)",
  },
  clockBtnOut: { backgroundColor: COLORS.white },
  clockBtnText: { fontSize: 16, fontWeight: "900", color: COLORS.white },
  clockBtnTextOut: { color: COLORS.danger },
  list: { padding: SPACING.lg, gap: SPACING.sm, paddingBottom: 40 },
  summaryRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.sm },
  summaryCard: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, alignItems: "center",
  },
  summaryValue: { fontSize: 18, fontWeight: "900", color: COLORS.text },
  summaryLabel: { fontSize: 10, fontWeight: "700", color: COLORS.textMuted, marginTop: 2 },
  shiftCard: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
  },
  shiftCardActive: { borderColor: COLORS.primary, borderWidth: 1.5 },
  staffAvatar: {
    width: 34, height: 34, borderRadius: RADIUS.pill, backgroundColor: COLORS.primary,
    alignItems: "center", justifyContent: "center",
  },
  shiftStaff: { fontSize: 13, fontWeight: "800", color: COLORS.text, marginBottom: 4 },
  shiftTimeRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  timeBlock: { alignItems: "center", gap: 2 },
  timeLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1, color: COLORS.textMuted },
  timeValue: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  timeDate: { fontSize: 10, color: COLORS.textMuted },
  durationBadge: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  durationBadgeActive: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  durationText: { fontSize: 12, fontWeight: "800", color: COLORS.textSecondary },
  durationTextActive: { color: COLORS.primary },
});
