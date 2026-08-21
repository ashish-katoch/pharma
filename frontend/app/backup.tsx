import { useState, useCallback } from "react";
import {View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Platform} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { Share } from "react-native";
import { api } from "@/src/api";
import { COLORS, SPACING, RADIUS } from "@/src/theme";
import { PageShell } from "@/src/components/PageShell";
import { EmptyState } from "@/src/components/ui/EmptyState";

type ShopResp = { data_retention_months?: number; plan?: string };

const RETENTION_OPTIONS = [12, 24, 36, 60, 84];

export default function BackupScreen() {
  const router = useRouter();
  const [shop, setShop] = useState<ShopResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [purging, setPurging] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api<ShopResp>("/shop");
      setShop(s);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doBackup = async () => {
    setBackingUp(true);
    try {
      const data = await api<object>("/admin/backup");
      const json = JSON.stringify(data, null, 2);
      const filename = `pharma_backup_${new Date().toISOString().slice(0, 10)}.json`;

      if (Platform.OS === "web") {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        await Share.share({ message: json, title: filename });
      }
    } catch (e: unknown) {
      Alert.alert("Backup failed", (e as Error).message || "Unknown error");
    } finally { setBackingUp(false); }
  };

  const doPurge = () => {
    const months = shop?.data_retention_months ?? 60;
    Alert.alert(
      "Purge Old Records?",
      `This will permanently delete audit logs and shift records older than ${months} months. This cannot be undone.`,
      [
        { text: "Cancel" },
        {
          text: "Purge",
          style: "destructive",
          onPress: async () => {
            setPurging(true);
            try {
              const r = await api<{ cutoff: string; deleted: Record<string, number> }>("/admin/purge-old-data", { method: "POST" });
              const total = Object.values(r.deleted).reduce((a, b) => a + b, 0);
              Alert.alert("Done", `Deleted ${total} records older than ${r.cutoff}`);
            } catch (e: unknown) {
              Alert.alert("Error", (e as Error).message);
            } finally { setPurging(false); }
          },
        },
      ]
    );
  };

  const setRetention = async (months: number) => {
    try {
      await api("/shop", { method: "PUT", body: JSON.stringify({ data_retention_months: months }) });
      setShop((s) => s ? { ...s, data_retention_months: months } : s);
    } catch (e: unknown) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const retention = shop?.data_retention_months ?? 60;

  return (
        <PageShell title="Backup & Data" showBack scrollable={false} noPadding>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Backup card */}
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={[styles.iconCircle, { backgroundColor: "#EFF6FF" }]}>
                <Feather name="download" size={22} color="#2563EB" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Export Backup</Text>
                <Text style={styles.cardDesc}>
                  Downloads all collections (bills, medicines, purchases, customers, etc.) as a JSON file.
                </Text>
              </View>
            </View>
            <View style={styles.infoList}>
              {["All bill and billing line records",
                "Inventory and batch data",
                "Customer and supplier records",
                "Journal entries and audit log"].map((item, i) => (
                <View key={i} style={styles.infoRow}>
                  <Feather name="check" size={13} color="#16A34A" />
                  <Text style={styles.infoText}>{item}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={doBackup} disabled={backingUp}>
              {backingUp ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <>
                  <Feather name="download-cloud" size={16} color={COLORS.white} />
                  <Text style={styles.primaryBtnText}>Export Backup Now</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Data retention card */}
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={[styles.iconCircle, { backgroundColor: "#FEF3C7" }]}>
                <Feather name="clock" size={22} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Data Retention</Text>
                <Text style={styles.cardDesc}>
                  Audit logs and shift records older than the selected period can be purged to save storage.
                </Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>KEEP RECORDS FOR</Text>
            <View style={styles.retentionChips}>
              {RETENTION_OPTIONS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.retentionChip, retention === m && styles.retentionChipActive]}
                  onPress={() => setRetention(m)}
                >
                  <Text style={[styles.retentionChipText, retention === m && styles.retentionChipTextActive]}>
                    {m >= 12 ? `${m / 12}yr${m >= 24 ? "s" : ""}` : `${m}mo`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.retentionInfo}>
              <Feather name="info" size={13} color={COLORS.textMuted} />
              <Text style={styles.retentionInfoText}>
                Current setting: keep {retention} months ({Math.round(retention / 12 * 10) / 10} years).
                Indian GST rules require 6 years of bill records — only logs and shift data are purged, never bills.
              </Text>
            </View>

            <TouchableOpacity style={styles.dangerBtn} onPress={doPurge} disabled={purging}>
              {purging ? (
                <ActivityIndicator size="small" color={COLORS.danger} />
              ) : (
                <>
                  <Feather name="trash-2" size={15} color={COLORS.danger} />
                  <Text style={styles.dangerBtnText}>Purge Records Older Than {retention} Months</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Strategy notes */}
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={[styles.iconCircle, { backgroundColor: "#F5F3FF" }]}>
                <Feather name="book-open" size={22} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Backup Strategy</Text>
              </View>
            </View>
            <View style={styles.strategyList}>
              {[
                { icon: "repeat" as const, text: "Daily: Export backup manually or schedule via cron/systemd on server" },
                { icon: "hard-drive" as const, text: "Weekly: Copy to external storage (S3, Google Drive, local NAS)" },
                { icon: "shield" as const, text: "Monthly: Full MongoDB dump using mongodump on the server" },
                { icon: "alert-triangle" as const, text: "Test restore quarterly: import backup JSON into a test environment" },
              ].map(({ icon, text }, i) => (
                <View key={i} style={styles.strategyRow}>
                  <Feather name={icon} size={14} color={COLORS.primary} />
                  <Text style={styles.strategyText}>{text}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: COLORS.text },
  scroll: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 },
  card: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, gap: SPACING.md,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.md },
  iconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  cardDesc: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18, marginTop: 2 },
  infoList: { gap: 6 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  infoText: { fontSize: 13, color: COLORS.text },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 12,
  },
  primaryBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 14 },
  sectionLabel: { fontSize: 10, fontWeight: "800", color: COLORS.textMuted, letterSpacing: 1 },
  retentionChips: { flexDirection: "row", gap: SPACING.sm, flexWrap: "wrap" },
  retentionChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.pill,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  retentionChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  retentionChipText: { fontSize: 13, fontWeight: "700", color: COLORS.textSecondary },
  retentionChipTextActive: { color: COLORS.white },
  retentionInfo: {
    flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm,
    backgroundColor: COLORS.surface, padding: SPACING.md, borderRadius: RADIUS.sm,
  },
  retentionInfoText: { flex: 1, fontSize: 12, color: COLORS.textMuted, lineHeight: 17 },
  dangerBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: SPACING.sm, borderWidth: 1, borderColor: COLORS.danger,
    borderRadius: RADIUS.md, paddingVertical: 12,
  },
  dangerBtnText: { color: COLORS.danger, fontWeight: "800", fontSize: 13 },
  strategyList: { gap: 10 },
  strategyRow: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm },
  strategyText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 18 },
});
