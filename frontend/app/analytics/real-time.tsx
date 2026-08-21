import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { PageShell } from "@/src/components/PageShell";

export default function Screen() {
  return (
    <PageShell title="Real-Time Sales" showBack>
      <View style={s.card}>
        <Feather name="bar-chart-2" size={40} color={COLORS.primaryFixed} />
        <Text style={s.title}>Real-Time Sales</Text>
        <Text style={s.sub}>Coming soon.</Text>
      </View>
    </PageShell>
  );
}

const s = StyleSheet.create({
  card: {
    alignItems: "center", gap: SPACING.md, backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl, padding: SPACING.xxl, borderWidth: 1, borderColor: COLORS.border,
    marginTop: SPACING.xl,
  },
  title: { fontSize: 18, fontWeight: "700", color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.textSecondary, textAlign: "center" },
});
