export const COLORS = {
  // base
  white: "#FFFFFF",
  surface: "#FAF8FF",
  surfaceContainer: "#EDEDF9",
  surfaceContainerLow: "#F3F3FE",
  surfaceContainerHigh: "#E7E7F3",
  surfaceDim: "#D9D9E5",
  border: "#C3C6D7",
  borderDark: "#737686",
  // text
  text: "#191B23",
  textSecondary: "#434655",
  textMuted: "#737686",
  textInverse: "#F0F0FB",
  // brand
  primary: "#004AC6",
  primaryContainer: "#2563EB",
  primaryFixed: "#DBE1FF",
  primaryFixedDim: "#B4C5FF",
  primaryLight: "#EFF6FF",
  // inverse (for dark hero cards)
  inverseSurface: "#2E3039",
  inverseOnSurface: "#F0F0FB",
  inversePrimary: "#B4C5FF",
  // secondary
  secondary: "#515F74",
  secondaryContainer: "#D5E3FC",
  onSecondaryContainer: "#57657A",
  // status
  success: "#059669",
  successBg: "#D1FAE5",
  successDark: "#065F46",
  warning: "#D97706",
  warningBg: "#FEF3C7",
  warningDark: "#92400E",
  danger: "#BA1A1A",
  dangerBg: "#FFDAD6",
  dangerDark: "#93000A",
  info: "#2563EB",
  infoBg: "#DBE1FF",
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

export const FONTS = {
  regular: "System",
  medium: "System",
  semibold: "System",
  bold: "System",
} as const;

export function expiryTone(expiry: string): { bg: string; fg: string; label: string } {
  const days = Math.floor(
    (new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (days <= 30) return { bg: COLORS.dangerBg, fg: COLORS.danger, label: `${days}d left` };
  if (days <= 90) return { bg: COLORS.warningBg, fg: COLORS.warning, label: `${days}d left` };
  return { bg: COLORS.successBg, fg: COLORS.success, label: `${days}d left` };
}
