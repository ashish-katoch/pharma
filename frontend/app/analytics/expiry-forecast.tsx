import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

export default function Screen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  return (
    <SafeAreaView style={[s.root, isDesktop && s.rootDesktop]} edges={["top"]}>
      <View style={isDesktop ? s.desktopCol : { flex: 1 }}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Analytics</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={s.body}>
        <View style={s.placeholderCard}>
          <Feather name="bar-chart-2" size={40} color={COLORS.primaryFixed} />
          <Text style={s.placeholderTitle}>Analytics</Text>
          <Text style={s.placeholderSub}>Coming soon.</Text>
        </View>
      </ScrollView>
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
    maxWidth: 900,
    alignSelf: "center",
    backgroundColor: COLORS.surface,
  },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  body: { padding: SPACING.lg, alignItems: "center", paddingTop: 60 },
  placeholderCard: {
    alignItems: "center", gap: SPACING.md, backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl, padding: SPACING.xxl, borderWidth: 1, borderColor: COLORS.border, width: "100%",
  },
  placeholderTitle: { fontSize: 18, fontWeight: "700", color: COLORS.text },
  placeholderSub: { fontSize: 13, color: COLORS.textSecondary, textAlign: "center" },
});
