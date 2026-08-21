import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS, RADIUS } from "@/src/theme";

interface EmptyStateProps {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  tone?: "neutral" | "success" | "warning";
}

export function EmptyState({ icon = "inbox", title, subtitle, action, tone = "neutral" }: EmptyStateProps) {
  const iconColor = tone === "success" ? COLORS.success : tone === "warning" ? COLORS.warning : COLORS.textMuted;
  const iconBg = tone === "success" ? COLORS.successBg : tone === "warning" ? COLORS.warningBg : COLORS.surfaceContainerLow;

  return (
    <View style={s.wrap}>
      <View style={[s.iconCircle, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={28} color={iconColor} />
      </View>
      <Text style={s.title}>{title}</Text>
      {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      {action ? <View style={s.action}>{action}</View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 56,
    paddingHorizontal: 32,
    gap: 8,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
    textAlign: "center",
    letterSpacing: -0.1,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 280,
  },
  action: {
    marginTop: 8,
  },
});
