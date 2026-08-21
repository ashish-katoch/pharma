import { useState, useCallback } from "react";
import {View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, ScrollView, Platform} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { COLORS, SPACING, RADIUS } from "@/src/theme";
import { PageShell } from "@/src/components/PageShell";
import { EmptyState } from "@/src/components/ui/EmptyState";

type SetupResp = { secret: string; otpauth_url: string };
type StatusResp = { enabled: boolean; pyotp_available: boolean };

export default function Setup2FA() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [setup, setSetup] = useState<SetupResp | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"check" | "scan" | "verify" | "done" | "disable">("check");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api<StatusResp>("/auth/2fa/status");
      setStatus(s);
      setStep(s.enabled ? "disable" : "check");
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useState(() => { load(); });

  const startSetup = async () => {
    setLoading(true);
    try {
      const resp = await api<SetupResp>("/auth/2fa/setup", { method: "POST" });
      setSetup(resp);
      setStep("scan");
    } catch (e: unknown) {
      Alert.alert("Error", (e as Error).message || "Failed to start 2FA setup");
    } finally { setLoading(false); }
  };

  const verifyEnable = async () => {
    if (code.length !== 6) { Alert.alert("Enter 6-digit code"); return; }
    setLoading(true);
    try {
      await api("/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code }) });
      setStep("done");
      setStatus((s) => s ? { ...s, enabled: true } : s);
    } catch (e: unknown) {
      Alert.alert("Invalid code", (e as Error).message || "Try again");
    } finally { setLoading(false); }
  };

  const disableTotp = async () => {
    if (code.length !== 6) { Alert.alert("Enter 6-digit code to confirm"); return; }
    setLoading(true);
    try {
      await api("/auth/2fa/disable", { method: "POST", body: JSON.stringify({ code }) });
      setStatus((s) => s ? { ...s, enabled: false } : s);
      setStep("check");
      setCode("");
      Alert.alert("2FA disabled");
    } catch (e: unknown) {
      Alert.alert("Failed", (e as Error).message || "Invalid code");
    } finally { setLoading(false); }
  };

  return (
        <PageShell title="Two-Factor Auth" showBack scrollable={false} noPadding>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Status badge */}
          <View style={[styles.statusBadge, { backgroundColor: status?.enabled ? "#DCFCE7" : "#FEF3C7" }]}>
            <Feather name={status?.enabled ? "shield" : "shield-off"} size={18}
              color={status?.enabled ? "#16A34A" : "#D97706"} />
            <Text style={[styles.statusText, { color: status?.enabled ? "#16A34A" : "#D97706" }]}>
              {status?.enabled ? "2FA is ENABLED" : "2FA is DISABLED"}
            </Text>
          </View>

          {!status?.pyotp_available && (
            <View style={styles.warnCard}>
              <Feather name="alert-triangle" size={16} color={COLORS.warning} />
              <Text style={styles.warnText}>
                pyotp not installed on server. Run: pip install pyotp
              </Text>
            </View>
          )}

          {/* DISABLE flow */}
          {step === "disable" && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Disable Two-Factor Auth</Text>
              <Text style={styles.cardDesc}>Enter the 6-digit code from your authenticator app to confirm.</Text>
              <TextInput
                style={styles.codeInput}
                value={code}
                onChangeText={setCode}
                keyboardType="numeric"
                maxLength={6}
                placeholder="000000"
                placeholderTextColor={COLORS.textMuted}
              />
              <TouchableOpacity style={styles.dangerBtn} onPress={disableTotp}>
                <Text style={styles.dangerBtnText}>Disable 2FA</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ENABLE — step check */}
          {step === "check" && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Enable Two-Factor Auth</Text>
              <Text style={styles.cardDesc}>
                Adds a one-time password (OTP) step on every login using Google Authenticator, Authy, or any TOTP app.
              </Text>
              <View style={styles.stepList}>
                {["Install Google Authenticator or Authy on your phone",
                  "Tap 'Begin Setup' and scan the QR code",
                  "Enter the 6-digit code to confirm"].map((s, i) => (
                  <View key={i} style={styles.stepRow}>
                    <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                    <Text style={styles.stepDesc}>{s}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity style={styles.primaryBtn} onPress={startSetup} disabled={!status?.pyotp_available}>
                <Feather name="shield" size={16} color={COLORS.white} />
                <Text style={styles.primaryBtnText}>Begin Setup</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* SCAN step */}
          {step === "scan" && setup && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Scan QR Code</Text>
              <Text style={styles.cardDesc}>Open your authenticator app and scan this QR code.</Text>

              {/* QR rendered via Google Charts API — works without native QR library */}
              <View style={styles.qrWrap}>
                <View style={styles.qrFallback}>
                  <Feather name="smartphone" size={32} color={COLORS.textMuted} />
                  <Text style={styles.qrFallbackText}>Open your authenticator app and add account manually:</Text>
                  <View style={styles.secretBox}>
                    <Text style={styles.secretText} selectable>{setup.secret}</Text>
                  </View>
                  <Text style={styles.secretHint}>Tap and hold to copy the secret key</Text>
                </View>
              </View>

              <View style={styles.manualEntry}>
                <Text style={styles.manualLabel}>Or enter manually:</Text>
                <Text style={styles.manualURL} selectable numberOfLines={2}>{setup.otpauth_url}</Text>
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={() => { setStep("verify"); setCode(""); }}>
                <Text style={styles.primaryBtnText}>I've scanned it →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* VERIFY step */}
          {step === "verify" && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Verify Code</Text>
              <Text style={styles.cardDesc}>Enter the 6-digit code shown in your authenticator app.</Text>
              <TextInput
                style={styles.codeInput}
                value={code}
                onChangeText={setCode}
                keyboardType="numeric"
                maxLength={6}
                placeholder="000000"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
              />
              <TouchableOpacity style={styles.primaryBtn} onPress={verifyEnable}>
                <Feather name="check" size={16} color={COLORS.white} />
                <Text style={styles.primaryBtnText}>Enable 2FA</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.backLink} onPress={() => setStep("scan")}>
                <Text style={styles.backLinkText}>← Back to QR code</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* DONE */}
          {step === "done" && (
            <View style={[styles.card, styles.doneCard]}>
              <Feather name="check-circle" size={40} color="#16A34A" />
              <Text style={styles.doneTitle}>2FA Enabled!</Text>
              <Text style={styles.doneDesc}>
                Your account is now protected with two-factor authentication.{"\n"}
                You'll need your authenticator app every time you log in.
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
                <Text style={styles.primaryBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: COLORS.text },
  scroll: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 },
  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    padding: SPACING.md, borderRadius: RADIUS.md,
  },
  statusText: { fontSize: 14, fontWeight: "700" },
  warnCard: {
    flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm,
    backgroundColor: "#FEF3C7", borderRadius: RADIUS.md, padding: SPACING.md,
  },
  warnText: { flex: 1, fontSize: 13, color: "#92400E" },
  card: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, gap: SPACING.md,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  cardDesc: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20 },
  stepList: { gap: SPACING.sm },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm },
  stepNum: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.primary,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  stepNumText: { fontSize: 11, fontWeight: "800", color: COLORS.white },
  stepDesc: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 20 },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
    paddingVertical: 12,
  },
  primaryBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 14 },
  dangerBtn: {
    backgroundColor: COLORS.danger, borderRadius: RADIUS.md, paddingVertical: 12,
    alignItems: "center",
  },
  dangerBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 14 },
  qrWrap: { alignItems: "center" },
  qrFallback: { alignItems: "center", gap: SPACING.sm, padding: SPACING.md },
  qrFallbackText: { fontSize: 13, color: COLORS.textSecondary, textAlign: "center" },
  secretBox: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.sm,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
    width: "100%",
  },
  secretText: { fontFamily:Platform.OS === "ios" ? "Courier New" : "monospace", fontSize: 14, color: COLORS.text, textAlign: "center", letterSpacing: 2 },
  secretHint: { fontSize: 11, color: COLORS.textMuted },
  manualEntry: { gap: 4 },
  manualLabel: { fontSize: 11, fontWeight: "700", color: COLORS.textMuted, letterSpacing: 0.5 },
  manualURL: { fontSize: 10, color: COLORS.textSecondary, fontFamily:Platform.OS === "ios" ? "Courier New" : "monospace" },
  codeInput: {
    height: 56, borderWidth: 2, borderColor: COLORS.primary, borderRadius: RADIUS.md,
    textAlign: "center", fontSize: 28, fontWeight: "900", color: COLORS.text,
    letterSpacing: 8,
  },
  backLink: { alignItems: "center" },
  backLinkText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },
  doneCard: { alignItems: "center" },
  doneTitle: { fontSize: 20, fontWeight: "800", color: "#16A34A" },
  doneDesc: { fontSize: 14, color: COLORS.textSecondary, textAlign: "center", lineHeight: 22 },
});
