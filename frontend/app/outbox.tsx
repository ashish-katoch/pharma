import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { confirmDestructive } from "@/src/confirm";
import { useSync } from "@/src/sync";
import { getFailed, getOutbox, OutboxBill, FailedBill } from "@/src/outbox";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function OutboxScreen() {
  const router = useRouter();
  const sync = useSync();
  const [pending, setPending] = useState<OutboxBill[]>([]);
  const [failed, setFailed] = useState<FailedBill[]>([]);

  const load = useCallback(async () => {
    const [p, f] = await Promise.all([getOutbox(), getFailed()]);
    setPending(p);
    setFailed(f);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doSync = async () => {
    await sync.syncNow();
    await load();
  };

  const clearFailed = () => {
    if (failed.length === 0) return;
    confirmDestructive(
      "Clear failed bills?",
      "These bills could not be sent. Stock was never deducted. You should recreate them manually.",
      "Clear",
      async () => {
        await sync.clearFailed();
        await load();
      },
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
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
            <Feather name="refresh-cw" size={22} color={pending.length > 0 ? COLORS.primary : COLORS.textMuted} />
          )}
        </TouchableOpacity>
      </View>

      {/* status banner */}
      <View style={[styles.banner, { backgroundColor: sync.online ? COLORS.successBg : COLORS.dangerBg }]}>
        <Feather
          name={sync.online ? "wifi" : "wifi-off"}
          size={16}
          color={sync.online ? COLORS.success : COLORS.danger}
        />
        <Text style={[styles.bannerText, { color: sync.online ? COLORS.success : COLORS.danger }]}>
          {sync.online ? "Online — bills will sync automatically" : "Offline — bills queued locally"}
        </Text>
      </View>

      <FlatList
        data={[
          ...(pending.length ? [{ section: "WAITING TO SEND" as const }] : []),
          ...pending,
          ...(failed.length ? [{ section: "FAILED (NOT SENT)" as const }] : []),
          ...failed,
        ]}
        keyExtractor={(item: any) => item.section ?? item.id}
        contentContainerStyle={{ padding: SPACING.lg, gap: 8, paddingBottom: 80 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="inbox" size={36} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Queue is empty</Text>
            <Text style={styles.emptyBody}>
              All bills have been sent to the server. Bills made while offline will appear here.
            </Text>
          </View>
        }
        renderItem={({ item }: any) => {
          if (item.section) {
            return (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SPACING.md, marginBottom: 4 }}>
                <Text style={styles.sectionLabel}>{item.section}</Text>
                {item.section === "FAILED (NOT SENT)" && (
                  <TouchableOpacity onPress={clearFailed} testID="outbox-clear-failed">
                    <Text style={styles.clearLink}>Clear all</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }

          const isFailed = "reason" in item;
          return (
            <View style={[styles.card, isFailed && styles.cardFailed]} testID="outbox-item">
              <View style={styles.cardTop}>
                <View>
                  <Text style={styles.localNo}>{item.localBillNo}</Text>
                  <Text style={styles.cardMeta}>
                    {item.itemsCount} item{item.itemsCount !== 1 ? "s" : ""} ·{" "}
                    {new Date(item.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                <Text style={styles.total}>{rupee(item.total)}</Text>
              </View>

              <View style={[styles.statusRow, isFailed && { backgroundColor: COLORS.dangerBg }]}>
                <Feather
                  name={isFailed ? "alert-circle" : "clock"}
                  size={14}
                  color={isFailed ? COLORS.danger : COLORS.warning}
                />
                <Text style={[styles.statusText, isFailed && { color: COLORS.danger }]}>
                  {isFailed ? item.reason : "Waiting for connection"}
                </Text>
              </View>
            </View>
          );
        }}
      />

      {pending.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.syncBtn, (!sync.online || sync.syncing) && { opacity: 0.6 }]}
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
                  {sync.online ? `Send ${pending.length} bill${pending.length !== 1 ? "s" : ""}` : "Go online to sync"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
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
  title: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
  },
  bannerText: { fontSize: 13, fontWeight: "600" },
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
    justifyContent: "space-between",
    padding: SPACING.md,
  },
  localNo: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  cardMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  total: { fontSize: 18, fontWeight: "900", color: COLORS.text },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.warningBg,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
  },
  statusText: { fontSize: 12, fontWeight: "600", color: COLORS.warning, flex: 1 },
  empty: {
    alignItems: "center",
    padding: SPACING.xxl,
    gap: SPACING.md,
    marginTop: SPACING.xxl,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  emptyBody: { fontSize: 14, color: COLORS.textSecondary, textAlign: "center", lineHeight: 20 },
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
});
