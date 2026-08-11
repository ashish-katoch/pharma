import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { COLORS, SPACING, RADIUS } from "@/src/theme";

type AuditEvent = {
  id?: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  actor: string;
  created_at: string;
  details?: Record<string, unknown>;
};

const ACTION_COLOR: Record<string, string> = {
  create_bill: "#10B981",
  cancel_bill: "#EF4444",
  update_bill: "#F59E0B",
  create_purchase: "#3B82F6",
  update_medicine: "#8B5CF6",
  update_shop: "#6366F1",
  login: "#0EA5E9",
  delete_staff: "#EF4444",
  create_expense: "#F59E0B",
};

function actionColor(action: string) {
  for (const [k, v] of Object.entries(ACTION_COLOR)) {
    if (action?.includes(k)) return v;
  }
  return COLORS.textSecondary;
}

function humanAction(action: string) {
  return action?.replace(/_/g, " ") ?? action;
}

export default function AuditLogScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<AuditEvent[]>("/audit?limit=300");
      setEvents(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item }: { item: AuditEvent }) => {
    const color = actionColor(item.action);
    const date = item.created_at?.slice(0, 10) ?? "";
    const time = item.created_at?.slice(11, 16) ?? "";
    return (
      <View style={styles.card}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardRow}>
            <Text style={[styles.action, { color }]}>{humanAction(item.action)}</Text>
            <Text style={styles.time}>{time}</Text>
          </View>
          <View style={styles.cardRow}>
            <Text style={styles.actor}>{item.actor}</Text>
            {item.entity_type ? (
              <Text style={styles.entity}>{item.entity_type}</Text>
            ) : null}
            <Text style={styles.date}>{date}</Text>
          </View>
          {item.details && Object.keys(item.details).length > 0 ? (
            <Text style={styles.details} numberOfLines={1}>
              {Object.entries(item.details)
                .slice(0, 3)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")}
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Audit Log</Text>
        <Text style={styles.count}>{events.length} events</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e, i) => e.id ?? String(i)}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.primary} />}
          contentContainerStyle={{ padding: SPACING.md, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="shield" size={40} color={COLORS.textSecondary} />
              <Text style={styles.emptyText}>No audit events yet</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  title: { fontSize: 17, fontWeight: "700", color: COLORS.text, flex: 1, marginLeft: SPACING.md },
  count: { fontSize: 12, color: COLORS.textSecondary, fontWeight: "600" },
  card: {
    flexDirection: "row",
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  cardBody: { flex: 1 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: 2 },
  action: { fontSize: 13, fontWeight: "700", flex: 1, textTransform: "capitalize" },
  time: { fontSize: 11, color: COLORS.textSecondary, fontVariant: ["tabular-nums"] },
  actor: { fontSize: 12, color: COLORS.text, fontWeight: "600", flex: 1 },
  entity: {
    fontSize: 10,
    color: COLORS.textSecondary,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: RADIUS.sm,
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  date: { fontSize: 11, color: COLORS.textSecondary, fontVariant: ["tabular-nums"] },
  details: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: SPACING.sm },
  emptyText: { color: COLORS.textSecondary, fontSize: 14 },
});
