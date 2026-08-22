import { Platform } from "react-native";


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

/**
 * TYPE — a small, consistent type scale for the whole app.
 * Use these instead of hardcoding fontSize/fontWeight/lineHeight per screen so
 * headings and body copy stay consistent across the product. Spread into a
 * Text style, e.g. `style={[TYPE.h2, { color: COLORS.text }]}`.
 */
export const TYPE = {
  // Big numbers / hero figures
  display: { fontSize: 34, fontWeight: "800", lineHeight: 40, letterSpacing: -0.8 },
  // Page + section titles
  h1: { fontSize: 24, fontWeight: "800", lineHeight: 30, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: "700", lineHeight: 26, letterSpacing: -0.3 },
  h3: { fontSize: 17, fontWeight: "700", lineHeight: 23, letterSpacing: -0.2 },
  // Emphasis / list titles
  title: { fontSize: 15, fontWeight: "600", lineHeight: 21, letterSpacing: -0.1 },
  // Body
  body: { fontSize: 15, fontWeight: "400", lineHeight: 22 },
  bodyMedium: { fontSize: 15, fontWeight: "500", lineHeight: 22 },
  bodySmall: { fontSize: 13, fontWeight: "400", lineHeight: 19 },
  // Supporting
  label: { fontSize: 13, fontWeight: "600", lineHeight: 18, letterSpacing: -0.05 },
  caption: { fontSize: 12, fontWeight: "500", lineHeight: 16 },
  // ALL-CAPS section eyebrows
  overline: { fontSize: 10, fontWeight: "800", lineHeight: 14, letterSpacing: 1.4 },
} as const;

/**
 * SHADOWS — subtle, cross-platform elevation tokens. Web uses boxShadow;
 * native uses shadow props / elevation. Spread into a style: `[card, SHADOWS.sm]`.
 */
const elevation = (
  y: number,
  blur: number,
  opacity: number,
  radius: number,
  elev: number,
) =>
  Platform.select({
    web: { boxShadow: `0 ${y}px ${blur}px rgba(16, 24, 64, ${opacity})` },
    default: {
      shadowColor: "#101840",
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: radius,
      elevation: elev,
    },
  }) as object;

export const SHADOWS = {
  none: {},
  sm: elevation(1, 3, 0.06, 2, 1),
  md: elevation(4, 12, 0.08, 6, 3),
  lg: elevation(10, 24, 0.12, 12, 8),
} as const;

/**
 * ACCENT + DARK — modern dark-theme design tokens (warm coral accent).
 * Used by the redesigned mobile screens. Rolls out screen-by-screen.
 */
export const ACCENT = {
  base: "#FF5A3C",
  dark: "#E8461F",
  soft: "rgba(255,90,60,0.16)",
  on: "#FFFFFF",
} as const;

export const DARK = {
  bg: "#0E1012",
  surface: "#17191D",
  surfaceHigh: "#1F2227",
  surfaceHigher: "#282C32",
  border: "#2B2F36",
  borderSoft: "rgba(255,255,255,0.07)",
  text: "#F5F6F8",
  textSecondary: "#A9AFB8",
  textMuted: "#71777F",
  success: "#34D399",
  successSoft: "rgba(52,211,153,0.15)",
  warning: "#FBBF24",
  warningSoft: "rgba(251,191,36,0.15)",
  danger: "#F87171",
  dangerSoft: "rgba(248,113,113,0.15)",
  info: "#60A5FA",
  infoSoft: "rgba(96,165,250,0.15)",
} as const;


export function expiryTone(expiry: string): { bg: string; fg: string; label: string } {
  const days = Math.floor(
    (new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (days <= 30) return { bg: COLORS.dangerBg, fg: COLORS.danger, label: `${days}d left` };
  if (days <= 90) return { bg: COLORS.warningBg, fg: COLORS.warning, label: `${days}d left` };
  return { bg: COLORS.successBg, fg: COLORS.success, label: `${days}d left` };
}
