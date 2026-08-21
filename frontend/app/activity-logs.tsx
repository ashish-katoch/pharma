import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";

type AuditEvent = {
  id?: string;
  action?: string;
  entity_type?: string;
  entity_id?: string;
  user_email?: string;
  actor?: string;
  created_at?: string;
  details?: Record<string, unknown>;
};

function humanAction(action?: string) {
  return (action ?? "activity").replace(/_/g, " ");
}

function fmtWhen(ev: AuditEvent) {
  const who = ev.user_email ?? ev.actor ?? "system";
  const when = ev.created_at
    ? `${ev.created_at.slice(0, 10)} ${ev.created_at.slice(11, 16)}`.trim()
    : "";
  return when ? `${who} · ${when}` : who;
}

export default function ActivityLogsScreen() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEvents(await api<AuditEvent[]>("/audit"));
    } catch {
      /* ignore — show empty state */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refreshBtn = (
    <TouchableOpacity onPress={load} style={s.iconBtn} activeOpacity={0.7}>
      <Feather name="refresh-cw" size={18} color={COLORS.primary} />
    </TouchableOpacity>
  );

  return (
    <PageShell title="Activity Log" rightAction={refreshBtn}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={COLORS.primary} />
      ) : events.length === 0 ? (
        <View style={s.empty}>
          <Feather name="activity" size={40} color={COLORS.textMuted} />
          <Text style={s.emptyText}>No activity recorded yet</Text>
        </View>
      ) : (
        events.map((ev, i) => (
          <View key={ev.id ?? String(i)} style={s.row}>
            <View style={s.iconWrap}>
              <Feather name="activity" size={16} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{humanAction(ev.action)}</Text>
              <Text style={s.rowSub}>{fmtWhen(ev)}</Text>
            </View>
          </View>
        ))
      )}
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
  row: {
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
  rowTitle: { fontSize: 15, fontWeight: "600", color: COLORS.text, textTransform: "capitalize" },
  rowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  empty: { alignItems: "center", justifyContent: "center", padding: 48, gap: 10 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontWeight: "600", textAlign: "center" },
});
