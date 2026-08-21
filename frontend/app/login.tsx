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
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

export default function Login() {
  const router = useRouter();
  const { login, loginWithTotp } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [totpTempToken, setTotpTempToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");

  const onSubmit = async () => {
    setError("");
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)/home");
    } catch (e: any) {
      if (e?.message === "totp_required" && e?.temp_token) {
        setTotpTempToken(e.temp_token);
      } else {
        setError(e?.message || "Login failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const onTotpSubmit = async () => {
    if (!totpTempToken || totpCode.length !== 6) return;
    setError("");
    setBusy(true);
    try {
      await loginWithTotp(totpTempToken, totpCode);
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setError(e?.message || "Invalid code");
    } finally {
      setBusy(false);
    }
  };

  if (totpTempToken) {
    return (
      <SafeAreaView style={s.root} edges={["top", "bottom"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <View style={s.brand}>
              <View style={[s.logoWrap, { backgroundColor: "#7C3AED" }]}>
                <Feather name="shield" size={32} color="#fff" />
              </View>
              <Text style={s.appName}>Two-Factor Auth</Text>
              <Text style={s.tagline}>Enter the 6-digit code from your authenticator app.</Text>
            </View>
            <View style={s.card}>
              <Text style={s.fieldLabel}>Authenticator Code</Text>
              <TextInput
                style={[s.input, { textAlign: "center", fontSize: 28, fontWeight: "900", letterSpacing: 8 }]}
                keyboardType="numeric"
                maxLength={6}
                value={totpCode}
                onChangeText={setTotpCode}
                placeholder="000000"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
              />
              {error ? <ErrorBox message={error} /> : null}
              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: "#7C3AED", opacity: totpCode.length !== 6 ? 0.5 : 1 }]}
                onPress={onTotpSubmit}
                disabled={busy || totpCode.length !== 6}
                activeOpacity={0.85}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Verify Code</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setTotpTempToken(null); setTotpCode(""); setError(""); }} style={s.backLink}>
                <Feather name="arrow-left" size={14} color={COLORS.primary} />
                <Text style={s.backLinkText}>Back to login</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[s.scroll, isDesktop && s.scrollDesktop]} keyboardShouldPersistTaps="handled">
          {/* Desktop: center content in a max-width column */}
          <View style={isDesktop ? s.desktopCol : undefined}>

          {/* Brand */}
          <View style={s.brand}>
            <View style={s.logoWrap}>
              <Feather name="activity" size={32} color="#fff" />
            </View>
            <Text style={s.appName} testID="login-title">Pharma Counter</Text>
            <Text style={s.tagline}>Sign in to manage your pharmacy.</Text>
          </View>

          {/* Form Card */}
          <View style={s.card}>
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Email or Username</Text>
              <View style={s.inputWrap}>
                <Feather name="user" size={16} color={COLORS.textMuted} style={s.inputIcon} />
                <TextInput
                  testID="login-email-input"
                  style={s.inputWithIcon}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="owner@pharma.com"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            </View>

            <View style={s.fieldGroup}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={s.fieldLabel}>Password</Text>
                <TouchableOpacity onPress={() => router.push("/forgot-password" as any)}>
                  <Text style={s.forgotLink}>Forgot Password?</Text>
                </TouchableOpacity>
              </View>
              <View style={s.inputWrap}>
                <Feather name="lock" size={16} color={COLORS.textMuted} style={s.inputIcon} />
                <TextInput
                  testID="login-password-input"
                  style={s.inputWithIcon}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.textMuted}
                />
                <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={s.eyeBtn}>
                  <Feather name={showPassword ? "eye" : "eye-off"} size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {error ? <ErrorBox message={error} /> : null}

            <TouchableOpacity
              testID="login-submit-button"
              style={s.primaryBtn}
              onPress={onSubmit}
              disabled={busy}
              activeOpacity={0.85}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Sign In</Text>}
            </TouchableOpacity>

            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>Or continue with</Text>
              <View style={s.dividerLine} />
            </View>

            <TouchableOpacity style={s.biometricBtn} activeOpacity={0.85}>
              <Feather name="cpu" size={18} color={COLORS.primary} />
              <Text style={s.biometricBtnText}>Sign in with Biometrics</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.footer}>Secure connection · v2.4.0</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <View style={s.errorBox} testID="login-error-box">
      <Feather name="alert-circle" size={15} color={COLORS.danger} />
      <Text style={s.errorText}>{message}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  scroll: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl, justifyContent: "center" },
  scrollDesktop: { alignItems: "center", paddingHorizontal: SPACING.xl },
  desktopCol: { width: "100%", maxWidth: 440 },

  brand: { alignItems: "center", marginTop: SPACING.xxl * 1.5, marginBottom: SPACING.xl, gap: SPACING.md },
  logoWrap: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: "center", justifyContent: "center",
    shadowColor: COLORS.primary, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  appName: { fontSize: 24, fontWeight: "700", color: COLORS.primary, letterSpacing: -0.3 },
  tagline: { fontSize: 14, color: COLORS.textSecondary, textAlign: "center" },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.xl,
    gap: SPACING.md,
  },

  fieldGroup: { gap: SPACING.xs },
  fieldLabel: { fontSize: 12, fontWeight: "600", letterSpacing: 0.5, color: COLORS.text },
  forgotLink: { fontSize: 11, fontWeight: "600", color: COLORS.primary },

  inputWrap: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    minHeight: 48,
  },
  inputIcon: { marginLeft: SPACING.md },
  input: {
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    minHeight: 48, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    fontSize: 15, color: COLORS.text,
  },
  inputWithIcon: {
    flex: 1, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
    fontSize: 15, color: COLORS.text,
  },
  eyeBtn: { padding: SPACING.md },

  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: COLORS.dangerBg,
    padding: SPACING.md, borderRadius: RADIUS.md,
  },
  errorText: { color: COLORS.danger, fontSize: 13, flex: 1 },

  primaryBtn: {
    minHeight: 50, backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    alignItems: "center", justifyContent: "center",
    marginTop: SPACING.xs,
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  divider: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { fontSize: 11, color: COLORS.textMuted, fontWeight: "500" },

  biometricBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm,
    minHeight: 48, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  biometricBtnText: { fontSize: 14, fontWeight: "600", color: COLORS.text },

  backLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: SPACING.sm },
  backLinkText: { color: COLORS.primary, fontSize: 13, fontWeight: "600" },

  footer: { textAlign: "center", fontSize: 11, color: COLORS.textMuted, marginTop: SPACING.xl },
});
