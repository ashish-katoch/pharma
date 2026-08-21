import { useRef, useState } from "react";
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

export default function Otp() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const inputs = useRef<Array<TextInput | null>>([]);

  const setDigit = (index: number, value: string) => {
    const clean = value.replace(/[^0-9]/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = clean;
      return next;
    });
    if (clean && index < 5) inputs.current[index + 1]?.focus();
  };

  const onKeyPress = (index: number, key: string) => {
    if (key === "Backspace" && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const onVerify = () => {
    if (digits.every((d) => d !== "")) {
      alertMsg("Verified", "Your phone number has been verified.");
      router.replace("/(tabs)/home");
    } else {
      alertMsg("Incomplete", "Enter all 6 digits");
    }
  };

  const onResend = () => {
    alertMsg("Code sent", "A new 6-digit code is on its way to your phone.");
  };

  return (
    <SafeAreaView style={[s.root, isDesktop && s.rootDesktop]} edges={["top", "bottom"]}>
      <View style={isDesktop ? s.desktopCol : { flex: 1, padding: SPACING.lg }}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Feather name="arrow-left" size={20} color={COLORS.text} />
        </TouchableOpacity>

        <View style={s.iconWrap}>
          <Feather name="smartphone" size={28} color={COLORS.primary} />
        </View>
        <Text style={s.title}>Verify OTP</Text>
        <Text style={s.subtitle}>Enter the 6-digit code sent to your phone</Text>

        <View style={s.otpRow}>
          {digits.map((digit, i) => (
            <TextInput
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              style={[s.otpBox, digit ? s.otpBoxFilled : null]}
              value={digit}
              onChangeText={(v) => setDigit(i, v)}
              onKeyPress={({ nativeEvent }) => onKeyPress(i, nativeEvent.key)}
              keyboardType="number-pad"
              maxLength={1}
              textAlign="center"
              autoFocus={i === 0}
            />
          ))}
        </View>

        <TouchableOpacity style={s.primaryBtn} activeOpacity={0.85} onPress={onVerify}>
          <Text style={s.primaryBtnText}>Verify</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.resendLink} onPress={onResend} activeOpacity={0.7}>
          <Text style={s.resendText}>Didn't get it? </Text>
          <Text style={s.resendLinkText}>Resend code</Text>
        </TouchableOpacity>
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
    marginBottom: SPACING.xl,
  },

  otpRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  otpBox: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 56,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    fontSize: 24,
    fontWeight: "900",
    color: COLORS.text,
  },
  otpBoxFilled: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },

  primaryBtn: {
    minHeight: 52,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },

  resendLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACING.lg,
  },
  resendText: { fontSize: 13, color: COLORS.textMuted },
  resendLinkText: { fontSize: 13, color: COLORS.primary, fontWeight: "700" },
});
