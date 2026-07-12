import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("owner@pharma.com");
  const [password, setPassword] = useState("Owner@123");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async () => {
    setError("");
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setError(e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Feather name="plus" size={36} color={COLORS.white} />
            </View>
            <Text style={styles.title} testID="login-title">Pharma Counter</Text>
            <Text style={styles.subtitle}>Bill fast. Track batch & expiry. Sell smart.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="login-email-input"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              placeholder="owner@pharma.com"
              placeholderTextColor={COLORS.textMuted}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              testID="login-password-input"
              style={styles.input}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password"
              placeholderTextColor={COLORS.textMuted}
            />

            {error ? (
              <View style={styles.errorBox} testID="login-error-box">
                <Feather name="alert-circle" size={16} color={COLORS.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              testID="login-submit-button"
              style={styles.primaryBtn}
              onPress={onSubmit}
              disabled={busy}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Feather name="log-in" size={20} color={COLORS.white} />
                  <Text style={styles.primaryBtnText}>Sign In</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.hint} testID="login-hint">
            <Text style={styles.hintLabel}>Demo credentials</Text>
            <Text style={styles.hintText}>Owner  · owner@pharma.com / Owner@123</Text>
            <Text style={styles.hintText}>Staff  · staff@pharma.com / Staff@123</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  scroll: { padding: SPACING.xl, gap: SPACING.xl },
  brand: { alignItems: "center", marginTop: SPACING.xxl, gap: SPACING.md },
  logo: {
    width: 68,
    height: 68,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  title: { fontSize: 28, fontWeight: "800", color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: "center" },
  card: {
    backgroundColor: COLORS.white,
    padding: SPACING.xl,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    fontSize: 16,
    color: COLORS.text,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.dangerBg,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginTop: SPACING.md,
  },
  errorText: { color: COLORS.danger, fontSize: 13, flex: 1 },
  primaryBtn: {
    minHeight: 56,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: SPACING.lg,
  },
  primaryBtnText: { color: COLORS.white, fontSize: 17, fontWeight: "700" },
  hint: {
    padding: SPACING.lg,
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.md,
    gap: 4,
  },
  hintLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: COLORS.primary,
    marginBottom: 4,
  },
  hintText: { fontSize: 13, color: COLORS.text, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
});
