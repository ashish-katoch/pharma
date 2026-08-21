import { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Switch } from "react-native";
import { Feather } from "@expo/vector-icons";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";
import { alertMsg } from "@/src/dialog";

const SERVER_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "Not configured";

export default function NetworkSettings() {
  const [testing, setTesting] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [autoSync, setAutoSync] = useState(true);

  const testConnection = useCallback(async () => {
    setTesting(true);
    try {
      await api("/shop");
      alertMsg("Connected", "Server reachable. Everything looks good.");
    } catch {
      alertMsg("Connection failed", "Could not reach the server. Check the URL and your network.");
    } finally {
      setTesting(false);
    }
  }, []);

  return (
    <PageShell title="Network">
      <Text style={s.sectionLabel}>SERVER</Text>
      <View style={s.card}>
        <Text style={s.fieldLabel}>SERVER URL</Text>
        <View style={s.urlBox}>
          <Feather name="server" size={16} color={COLORS.textMuted} />
          <Text style={s.urlText} numberOfLines={1}>{SERVER_URL}</Text>
        </View>
        <TouchableOpacity
          style={s.testBtn}
          onPress={testConnection}
          disabled={testing}
          activeOpacity={0.85}
        >
          {testing ? (
            <ActivityIndicator color={COLORS.primary} size="small" />
          ) : (
            <>
              <Feather name="wifi" size={16} color={COLORS.primary} />
              <Text style={s.testBtnText}>Test Connection</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Text style={s.sectionLabel}>SYNC</Text>
      <View style={s.toggleRow}>
        <View style={s.iconWrap}>
          <Feather name="cloud-off" size={18} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle}>Offline mode</Text>
          <Text style={s.rowSub}>Queue writes locally and sync later</Text>
        </View>
        <Switch
          value={offlineMode}
          onValueChange={setOfflineMode}
          trackColor={{ false: COLORS.border, true: COLORS.primary }}
          thumbColor={COLORS.white}
        />
      </View>
      <View style={s.toggleRow}>
        <View style={s.iconWrap}>
          <Feather name="refresh-cw" size={18} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle}>Auto-sync</Text>
          <Text style={s.rowSub}>Push queued changes when back online</Text>
        </View>
        <Switch
          value={autoSync}
          onValueChange={setAutoSync}
          trackColor={{ false: COLORS.border, true: COLORS.primary }}
          thumbColor={COLORS.white}
        />
      </View>
    </PageShell>
  );
}

const s = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: SPACING.sm, marginBottom: SPACING.xs },
  card: { padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm, marginBottom: SPACING.sm },
  fieldLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.textSecondary, marginBottom: 6 },
  urlBox: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, minHeight: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, backgroundColor: COLORS.surface },
  urlText: { flex: 1, fontSize: 14, color: COLORS.text },
  testBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 46, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  testBtnText: { color: COLORS.primary, fontSize: 15, fontWeight: "800" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },
  iconWrap: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
});
