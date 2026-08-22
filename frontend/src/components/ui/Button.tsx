import React, { useState } from "react";
import {
  Text,
  ActivityIndicator,
  Pressable,
  Platform,
  ViewStyle,
  TextStyle,
  PressableStateCallbackType,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS, RADIUS } from "@/src/theme";

type Variant = "primary" | "secondary" | "destructive" | "ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Feather.glyphMap;
  iconRight?: keyof typeof Feather.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  testID?: string;
}

const SIZES: Record<Size, { h: number; px: number; font: number; icon: number; gap: number }> = {
  sm: { h: 36, px: 12, font: 13, icon: 15, gap: 6 },
  md: { h: 46, px: 16, font: 15, icon: 17, gap: 8 },
  lg: { h: 54, px: 20, font: 16, icon: 19, gap: 10 },
};

const VARIANTS: Record<Variant, { bg: string; bgPressed: string; fg: string; border?: string }> = {
  primary: { bg: COLORS.primaryContainer, bgPressed: COLORS.primary, fg: "#FFFFFF" },
  secondary: { bg: COLORS.white, bgPressed: COLORS.surfaceContainerLow, fg: COLORS.text, border: COLORS.border },
  destructive: { bg: COLORS.danger, bgPressed: COLORS.dangerDark, fg: "#FFFFFF" },
  ghost: { bg: "transparent", bgPressed: COLORS.surfaceContainerLow, fg: COLORS.primary },
};

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  testID,
}: ButtonProps) {
  const [hovered, setHovered] = useState(false);
  const sz = SIZES[size];
  const v = VARIANTS[variant];
  const isDisabled = disabled || loading;

  const containerStyle = (state: PressableStateCallbackType): ViewStyle => {
    const pressed = state.pressed;
    return {
      height: sz.h,
      paddingHorizontal: sz.px,
      borderRadius: RADIUS.md,
      backgroundColor: pressed || hovered ? v.bgPressed : v.bg,
      borderWidth: v.border ? 1 : 0,
      borderColor: v.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: sz.gap,
      alignSelf: fullWidth ? "stretch" : "flex-start",
      opacity: isDisabled ? 0.5 : 1,
      width: fullWidth ? "100%" : undefined,
      ...(Platform.OS === "web" ? ({ cursor: isDisabled ? "not-allowed" : "pointer", transitionDuration: "120ms" } as any) : {}),
    };
  };

  const textStyle: TextStyle = { color: v.fg, fontSize: sz.font, fontWeight: "700", letterSpacing: -0.1 };

  const webHover =
    Platform.OS === "web"
      ? { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) }
      : {};

  return (
    <Pressable
      testID={testID}
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={(state) => [containerStyle(state), style as ViewStyle]}
      {...(webHover as object)}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.fg} />
      ) : (
        <>
          {icon && <Feather name={icon} size={sz.icon} color={v.fg} />}
          <Text style={textStyle} numberOfLines={1}>
            {title}
          </Text>
          {iconRight && <Feather name={iconRight} size={sz.icon} color={v.fg} />}
        </>
      )}
    </Pressable>
  );
}

/** Compact icon-only button (square). */
export function IconButton({
  icon,
  onPress,
  variant = "secondary",
  size = "md",
  disabled = false,
  testID,
  accessibilityLabel,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel: string;
}) {
  const [hovered, setHovered] = useState(false);
  const sz = SIZES[size];
  const v = VARIANTS[variant];
  const webHover =
    Platform.OS === "web"
      ? { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) }
      : {};
  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        {
          width: sz.h,
          height: sz.h,
          borderRadius: RADIUS.md,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed || hovered ? v.bgPressed : v.bg,
          borderWidth: v.border ? 1 : 0,
          borderColor: v.border,
          opacity: disabled ? 0.5 : 1,
          ...(Platform.OS === "web" ? ({ cursor: disabled ? "not-allowed" : "pointer" } as any) : {}),
        },
      ]}
      {...(webHover as object)}
    >
      <Feather name={icon} size={sz.icon} color={v.fg} />
    </Pressable>
  );
}
