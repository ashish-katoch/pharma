import { View, Text, StyleSheet } from "react-native";
import { COLORS, RADIUS } from "@/src/theme";

type Tone = "default" | "primary" | "success" | "warning" | "danger" | "info" | "neutral";

interface BadgeProps {
  label: string;
  tone?: Tone;
  size?: "sm" | "md";
  dot?: boolean;
}

const TONE_MAP: Record<Tone, { bg: string; text: string; dot: string }> = {
  default:  { bg: COLORS.surfaceContainerLow, text: COLORS.textSecondary, dot: COLORS.textMuted },
  neutral:  { bg: COLORS.surfaceContainerLow, text: COLORS.textSecondary, dot: COLORS.textMuted },
  primary:  { bg: COLORS.primaryLight,        text: COLORS.primary,       dot: COLORS.primary },
  success:  { bg: COLORS.successBg,           text: COLORS.successDark,   dot: COLORS.success },
  warning:  { bg: COLORS.warningBg,           text: COLORS.warningDark,   dot: COLORS.warning },
  danger:   { bg: COLORS.dangerBg,            text: COLORS.dangerDark,    dot: COLORS.danger },
  info:     { bg: COLORS.infoBg,              text: COLORS.primary,       dot: COLORS.primary },
};

export function Badge({ label, tone = "default", size = "sm", dot = false }: BadgeProps) {
  const colors = TONE_MAP[tone] ?? TONE_MAP.default;
  const isSmall = size === "sm";

  return (
    <View style={[s.badge, { backgroundColor: colors.bg }, isSmall ? s.badgeSm : s.badgeMd]}>
      {dot && <View style={[s.dot, { backgroundColor: colors.dot }]} />}
      <Text style={[s.label, { color: colors.text }, isSmall ? s.labelSm : s.labelMd]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    borderRadius: RADIUS.pill,
  },
  badgeSm: { paddingHorizontal: 8,  paddingVertical: 3  },
  badgeMd: { paddingHorizontal: 10, paddingVertical: 5  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: { fontWeight: "600" },
  labelSm: { fontSize: 11, letterSpacing: 0.2 },
  labelMd: { fontSize: 12, letterSpacing: 0.1 },
});
