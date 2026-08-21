import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

export default function Welcome() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  return (
    <SafeAreaView style={[s.root, isDesktop && s.rootDesktop]} edges={["top", "bottom"]}>
      <View style={isDesktop ? s.desktopCol : { flex: 1, padding: SPACING.lg }}>
        <View style={s.hero}>
          <View style={s.logoWrap}>
            <Feather name="activity" size={40} color={COLORS.white} />
          </View>
          <Text style={s.title}>Pharma Counter</Text>
          <Text style={s.tagline}>Pharmacy billing & inventory, simplified.</Text>
        </View>

        <View style={s.actions}>
          <TouchableOpacity
            style={s.primaryBtn}
            activeOpacity={0.85}
            onPress={() => router.push("/login")}
          >
            <Text style={s.primaryBtnText}>Get Started</Text>
            <Feather name="arrow-right" size={18} color={COLORS.white} />
          </TouchableOpacity>

          <TouchableOpacity
            style={s.ghostBtn}
            activeOpacity={0.7}
            onPress={() => router.push("/login")}
          >
            <Text style={s.ghostBtnText}>I already have an account</Text>
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

  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.md,
  },
  logoWrap: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: "900",
    color: COLORS.primary,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingHorizontal: SPACING.lg,
  },

  actions: { gap: SPACING.sm, paddingBottom: SPACING.lg },
  primaryBtn: {
    minHeight: 54,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: SPACING.sm,
  },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
  ghostBtn: {
    minHeight: 52,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  ghostBtnText: { color: COLORS.text, fontSize: 15, fontWeight: "700" },
});
