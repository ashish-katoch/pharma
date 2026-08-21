import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { COLORS, SPACING, RADIUS } from "@/src/theme";

type NotifPrefs = {
  low_stock_alerts: boolean;
  expiry_alerts: boolean;
  expiry_days_ahead: number;
  daily_summary: boolean;
};

const DEFAULT_PREFS: NotifPrefs = {
  low_stock_alerts: true,
  expiry_alerts: true,
  expiry_days_ahead: 90,
  daily_summary: false,
};

const EXPIRY_OPTIONS = [30, 60, 90, 180];

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ notification_prefs?: NotifPrefs }>("/shop")
      .then((shop) => {
        if (shop.notification_prefs) {
          setPrefs({ ...DEFAULT_PREFS, ...shop.notification_prefs });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await api("/shop", {
        method: "PUT",
        body: JSON.stringify({ notification_prefs: prefs }),
      });
      Alert.alert("Saved", "Notification preferences updated.");
    } catch {
      Alert.alert("Error", "Could not save preferences.");
    } finally {
      setSaving(false);
    }
  }, [prefs]);

  const toggle = (key: keyof NotifPrefs) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, isDesktop && styles.rootDesktop]} edges={["top"]}>
        <View style={isDesktop ? styles.desktopCol : { flex: 1 }}>
          <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, isDesktop && styles.rootDesktop]} edges={["top"]}>
      <View style={isDesktop ? styles.desktopCol : { flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Notification Settings</Text>
        <TouchableOpacity onPress={save} disabled={saving} style={styles.saveBtn}>
          {saving ? (
            <ActivityIndicator color={COLORS.white} size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md }}>
        <Text style={styles.sectionLabel}>STOCK ALERTS</Text>
        <View style={styles.card}>
          <ToggleRow
            label="Low stock alerts"
            description="Push notification when medicine falls below reorder level"
            value={prefs.low_stock_alerts}
            onToggle={() => toggle("low_stock_alerts")}
          />
        </View>

        <Text style={styles.sectionLabel}>EXPIRY ALERTS</Text>
        <View style={styles.card}>
          <ToggleRow
            label="Expiry alerts"
            description="Alert when batches approach expiry date"
            value={prefs.expiry_alerts}
            onToggle={() => toggle("expiry_alerts")}
          />
          {prefs.expiry_alerts && (
            <View style={styles.subSection}>
              <Text style={styles.subLabel}>Alert me when expiry is within</Text>
              <View style={styles.chipRow}>
                {EXPIRY_OPTIONS.map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.chip, prefs.expiry_days_ahead === d && styles.chipActive]}
                    onPress={() => setPrefs((p) => ({ ...p, expiry_days_ahead: d }))}
                  >
                    <Text style={[styles.chipText, prefs.expiry_days_ahead === d && styles.chipTextActive]}>
                      {d} days
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>DAILY SUMMARY</Text>
        <View style={styles.card}>
          <ToggleRow
            label="Daily business summary"
            description="End-of-day summary: total sales, bills, and top medicines"
            value={prefs.daily_summary}
            onToggle={() => toggle("daily_summary")}
          />
        </View>
      </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onToggle,
}: {
  label: string;
  description: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, paddingRight: SPACING.sm }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDesc}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: COLORS.border, true: COLORS.primary }}
        thumbColor={COLORS.white}
      />
    </View>
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
    backgroundColor: COLORS.surface,
  },
  title: { fontSize: 17, fontWeight: "700", color: COLORS.text },
  saveBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    minWidth: 56,
    alignItems: "center",
  },
  saveBtnText: { color: COLORS.white, fontWeight: "700", fontSize: 14 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
  },
  toggleLabel: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  toggleDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  subSection: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    padding: SPACING.md,
  },
  subLabel: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs },
  chip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.white, fontWeight: "700" },
});
