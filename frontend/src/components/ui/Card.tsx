import React from "react";
import { View, Text, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { COLORS, RADIUS, SPACING, SHADOWS, TYPE } from "@/src/theme";

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /** padding preset */
  padding?: "none" | "sm" | "md" | "lg";
  /** elevation preset */
  elevation?: "none" | "sm" | "md" | "lg";
  /** show a hairline border (default true) */
  bordered?: boolean;
}

const PAD = { none: 0, sm: SPACING.md, md: SPACING.lg, lg: SPACING.xl };

/** Standard surface container used across the app. */
export function Card({ children, style, padding = "md", elevation = "sm", bordered = true }: CardProps) {
  return (
    <View
      style={[
        s.card,
        { padding: PAD[padding] },
        bordered && s.bordered,
        SHADOWS[elevation] as ViewStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Optional card header with title + optional subtitle + right slot. */
export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={s.header}>
      <View style={{ flex: 1 }}>
        <Text style={[TYPE.h3, { color: COLORS.text }]}>{title}</Text>
        {subtitle ? <Text style={[TYPE.caption, { color: COLORS.textMuted, marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** ALL-CAPS eyebrow used before a group of cards. */
export function SectionLabel({ children, style }: { children: string; style?: TextStyle }) {
  return <Text style={[TYPE.overline, s.sectionLabel, style]}>{children}</Text>;
}

const s = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
  },
  bordered: {
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  sectionLabel: {
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
});
