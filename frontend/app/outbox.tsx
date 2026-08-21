import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Platform, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import { confirmDestructive } from "@/src/confirm";
import { useSync } from "@/src/sync";
import {
  getPendingQueue,
  getFailedQueue,
  resetSyncEntry,
} from "@/src/repositories/SyncRepository";
import { voidBillLocal } from "@/src/repositories/BillingRepository";
import { SyncQueueEntry } from "@/src/repositories/types";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

const rupee = (n: number) =>
  `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function OutboxScreen() {
  const router = useRouter();
  const sync = useSync();
  const [pending, setPending] = useState<SyncQueueEntry[]>([]);
  const [failed, setFailed] = useState<SyncQueueEntry[]>([]);

  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  const load = useCallback(async () => {
    if (Platform.OS === "web") return;
    const [p, f] = await Promise.all([getPendingQueue(), getFailedQueue()]);
    setPending(p);
    setFailed(f);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doSync = async () => {
    await sync.syncNow();
    await load();
    await sync.refresh();
  };

  const clearFailed = () => {
    if (failed.length === 0) return;
    confirmDestructive(
      "Clear failed bills?",
      "These bills were rejected by the server. Stock was already deducted locally — review your inventory.",
      "Clear",
      async () => {
        await sync.clearFailed();
        await load();
      }
    );
  };

  const retryEntry = async (entry: SyncQueueEntry) => {
    await resetSyncEntry(entry.id);
    await load();
    await sync.refresh();
    await sync.syncNow();
  };

  const voidEntry = (entry: SyncQueueEntry) => {
    confirmDestructive(
      "Void this bill?",
      "The bill will be cancelled and stock restored. This cannot be undone.",
      "Void Bill",
      async () => {
        await voidBillLocal(entry.entity_id);
        await load();
        await sync.refresh();
      }
    );
  };

  return (
    <SafeAreaView style={[styles.root, isDesktop && styles.rootDesktop]} edges={["top", "bottom"]}>
      <View style={isDesktop ? styles.desktopCol : { flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="outbox-back">
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Offline queue</Text>
        <TouchableOpacity
          onPress={doSync}
          disabled={sync.syncing || pending.length === 0}
          testID="outbox-sync-now"
        >
          {sync.syncing ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : (
            <Feather
              name="refresh-cw"
              size={22}
              color={pending.length > 0 ? COLORS.primary : COLORS.textMuted}
            />
          )}
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.banner,
          { backgroundColor: sync.online ? COLORS.successBg : COLORS.dangerBg },
        ]}
      >
        <Feather
          name={sync.online ? "wifi" : "wifi-off"}
          size={16}
          color={sync.online ? COLORS.success : COLORS.danger}
        />
        <Text
          style={[
            styles.bannerText,
            { color: sync.online ? COLORS.success : COLORS.danger },
          ]}
        >
          {sync.online
            ? "Online — bills will sync automatically"
            : "Offline — bills queued locally"}
        </Text>
      </View>

      <FlatList
        data={[
          ...(pending.length ? [{ _section: "WAITING TO SEND" }] : []),
          ...pending,
          ...(failed.length ? [{ _section: "FAILED (SERVER REJECTED)" }] : []),
          ...failed,
        ]}
        keyExtractor={(item: any) => item._section ?? item.id}
        contentContainerStyle={{ padding: SPACING.lg, gap: 8, paddingBottom: 80 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="inbox" size={36} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Queue is empty</Text>
            <Text style={styles.emptyBody}>
              All bills are synced. Bills made while offline appear here until connectivity returns.
            </Text>
          </View>
        }
        renderItem={({ item }: any) => {
          if (item._section) {
            return (
              <View style={styles.sectionRow}>
                <Text style={styles.sectionLabel}>{item._section}</Text>
                {item._section.startsWith("FAILED") && (
                  <TouchableOpacity
                    onPress={clearFailed}
                    testID="outbox-clear-failed"
                  >
                    <Text style={styles.clearLink}>Clear all</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }

          const entry = item as SyncQueueEntry;
          const isFailed = entry.status === "failed";
          let payload: any = {};
          try { payload = JSON.parse(entry.payload); } catch {}

          return (
            <View
              style={[styles.card, isFailed && styles.cardFailed]}
              testID="outbox-item"
            >
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.localNo}>
                    {entry.entity_type.toUpperCase()} · {entry.entity_id.slice(-8).toUpperCase()}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {new Date(entry.created_at).toLocaleString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "short",
                    })}
                    {entry.retry_count > 0 ? ` · ${entry.retry_count} retr${entry.retry_count === 1 ? "y" : "ies"}` : ""}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.statusRow,
                  isFailed && { backgroundColor: COLORS.dangerBg },
                ]}
              >
                <Feather
                  name={isFailed ? "alert-circle" : "clock"}
                  size={14}
                  color={isFailed ? COLORS.danger : COLORS.warning}
                />
                <Text
                  style={[styles.statusText, isFailed && { color: COLORS.danger }]}
                >
                  {isFailed ? (entry.error ?? "Rejected by server") : "Waiting for connection…"}
                </Text>
              </View>
              {isFailed && (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.retryBtn}
                    onPress={() => retryEntry(entry)}
                  >
                    <Feather name="refresh-cw" size={13} color={COLORS.primary} />
                    <Text style={styles.retryBtnText}>Retry</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.voidBtn}
                    onPress={() => voidEntry(entry)}
                  >
                    <Feather name="x-circle" size={13} color={COLORS.danger} />
                    <Text style={styles.voidBtnText}>Void &amp; Restore Stock</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
      />

      {pending.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.syncBtn,
              (!sync.online || sync.syncing) && { opacity: 0.6 },
            ]}
            onPress={doSync}
            disabled={sync.syncing || !sync.online}
            testID="outbox-sync-footer"
          >
            {sync.syncing ? (
              <>
                <ActivityIndicator color={COLORS.white} />
                <Text style={styles.syncBtnText}>Syncing…</Text>
              </>
            ) : (
              <>
                <Feather name="upload-cloud" size={20} color={COLORS.white} />
                <Text style={styles.syncBtnText}>
                  {sync.online
                    ? `Send ${pending.length} bill${pending.length !== 1 ? "s" : ""}`
                    : "Go online to sync"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  rootDesktop: { backgroundColor: "#F0F2F8" },
  desktopCol: {
    flex: 1,
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    backgroundColor: COLORS.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  title: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
  },
  bannerText: { fontSize: 13, fontWeight: "600" },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: SPACING.md,
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: COLORS.textMuted,
  },
  clearLink: { fontSize: 12, fontWeight: "700", color: COLORS.danger },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  cardFailed: { borderColor: COLORS.danger },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
  },
  localNo: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  cardMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.warningBg,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.warning,
    flex: 1,
  },
  empty: {
    alignItems: "center",
    padding: SPACING.xxl,
    gap: SPACING.md,
    marginTop: SPACING.xxl,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  emptyBody: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  syncBtn: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
  },
  syncBtnText: { color: COLORS.white, fontSize: 15, fontWeight: "800" },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  retryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  retryBtnText: { fontSize: 12, fontWeight: "700", color: COLORS.primary },
  voidBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.dangerBg,
  },
  voidBtnText: { fontSize: 12, fontWeight: "700", color: COLORS.danger },
});
