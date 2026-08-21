import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { alertMsg } from "@/src/dialog";

export default function ForgotPassword() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const [email, setEmail] = useState("");

  const onSubmit = () => {
    if (!email.trim()) {
      alertMsg("Email required", "Enter the email linked to your account.");
      return;
    }
    alertMsg("Check your email", "If an account exists we sent a reset link.");
    router.back();
  };

  return (
    <SafeAreaView style={[s.root, isDesktop && s.rootDesktop]} edges={["top", "bottom"]}>
      <View style={isDesktop ? s.desktopCol : { flex: 1, padding: SPACING.lg }}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Feather name="arrow-left" size={20} color={COLORS.text} />
        </TouchableOpacity>

        <View style={s.iconWrap}>
          <Feather name="lock" size={28} color={COLORS.primary} />
        </View>
        <Text style={s.title}>Reset Password</Text>
        <Text style={s.subtitle}>
          Enter your account email and we'll send you a link to reset your password.
        </Text>

        <View style={s.form}>
          <Text style={s.fieldLabel}>EMAIL</Text>
          <TextInput
            style={s.field}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="owner@pharma.com"
            placeholderTextColor={COLORS.textMuted}
          />

          <TouchableOpacity style={s.primaryBtn} activeOpacity={0.85} onPress={onSubmit}>
            <Feather name="mail" size={18} color={COLORS.white} />
            <Text style={s.primaryBtnText}>Send Reset Link</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.backLink} onPress={() => router.back()} activeOpacity={0.7}>
            <Feather name="arrow-left" size={14} color={COLORS.primary} />
            <Text style={s.backLinkText}>Back to login</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  rootDesktop: { backgroundColor: "#F0F2F8" },
  desktopCol: {
    flex: 1,
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    padding: SPACING.lg,
  },

  backBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.xl,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.lg,
  },
  title: { fontSize: 26, fontWeight: "800", color: COLORS.text, letterSpacing: -0.4 },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    lineHeight: 20,
    marginBottom: SPACING.xl,
  },

  form: { gap: SPACING.sm },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    fontSize: 15,
    color: COLORS.text,
  },
  primaryBtn: {
    minHeight: 52,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: SPACING.md,
  },
  backLinkText: { color: COLORS.primary, fontSize: 13, fontWeight: "700" },
});
