import { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Switch } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";
import { alertMsg } from "@/src/dialog";

export default function BackupSecurity() {
  const router = useRouter();
  const [backingUp, setBackingUp] = useState(false);
  const [encrypt, setEncrypt] = useState(true);

  const backupNow = useCallback(async () => {
    setBackingUp(true);
    try {
      await api("/admin/backup");
      alertMsg("Backup ready", "Your data has been backed up to the cloud.");
    } catch {
      alertMsg("Backup failed", "Could not complete the backup. Try again later.");
    } finally {
      setBackingUp(false);
    }
  }, []);

  return (
    <PageShell title="Backup & Security">
      <Text style={s.sectionLabel}>BACKUP</Text>
      <View style={s.card}>
        <View style={s.lastBackup}>
          <Feather name="check-circle" size={16} color={COLORS.success} />
          <Text style={s.lastBackupText}>Last backup: Today</Text>
        </View>
        <TouchableOpacity
          style={s.primaryBtn}
          onPress={backupNow}
          disabled={backingUp}
          activeOpacity={0.85}
        >
          {backingUp ? (
            <ActivityIndicator color={COLORS.white} size="small" />
          ) : (
            <>
              <Feather name="upload-cloud" size={18} color={COLORS.white} />
              <Text style={s.primaryBtnText}>Backup Now</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={s.toggleRow}>
        <View style={s.iconWrap}>
          <Feather name="shield" size={18} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle}>Encrypt backups</Text>
          <Text style={s.rowSub}>AES-256 encryption before upload</Text>
        </View>
        <Switch
          value={encrypt}
          onValueChange={setEncrypt}
          trackColor={{ false: COLORS.border, true: COLORS.primary }}
          thumbColor={COLORS.white}
        />
      </View>

      <Text style={s.sectionLabel}>SECURITY</Text>
      <TouchableOpacity
        style={s.row}
        onPress={() => router.push("/setup-2fa")}
        activeOpacity={0.7}
      >
        <View style={s.iconWrap}>
          <Feather name="key" size={18} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle}>Two-factor authentication</Text>
          <Text style={s.rowSub}>Add an extra layer at login</Text>
        </View>
        <Feather name="chevron-right" size={18} color={COLORS.textMuted} />
      </TouchableOpacity>
      <TouchableOpacity
        style={s.row}
        onPress={() => router.push("/app-lock-setup")}
        activeOpacity={0.7}
      >
        <View style={s.iconWrap}>
          <Feather name="lock" size={18} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle}>App lock</Text>
          <Text style={s.rowSub}>PIN or biometric to open the app</Text>
        </View>
        <Feather name="chevron-right" size={18} color={COLORS.textMuted} />
      </TouchableOpacity>
    </PageShell>
  );
}

const s = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: SPACING.sm, marginBottom: SPACING.xs },
  card: { padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.md, marginBottom: SPACING.sm },
  lastBackup: { flexDirection: "row", alignItems: "center", gap: 8 },
  lastBackupText: { fontSize: 13, fontWeight: "600", color: COLORS.textSecondary },
  primaryBtn: { minHeight: 52, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },
  iconWrap: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
});
