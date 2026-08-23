import { Platform } from "react-native";

// ─── Core palette ────────────────────────────────────────────────────────────
export const COLORS = {
  // Backgrounds
  bg:              "#F7F7FB",   // page background
  surface:         "#FFFFFF",   // card / white surface
  surfaceSubtle:   "#F0F1F8",   // slightly elevated surface
  // Text
  text:            "#181B24",   // primary dark text
  textSecondary:   "#73798A",   // secondary text
  textMuted:       "#9BA3B0",   // placeholder / hint
  textInverse:     "#FFFFFF",   // text on dark surfaces
  // Brand – primary blue
  primary:         "#2864E8",
  primaryLight:    "#EEF2FD",   // blue tint background
  primaryDim:      "#B8CDFF",   // soft blue chip
  // Hero dark card
  dark:            "#20232C",
  darkSurface:     "#2B2F3C",
  darkBorder:      "rgba(255,255,255,0.08)",
  // Borders & dividers
  border:          "#E4E6ED",
  borderStrong:    "#C8CAD4",
  // Status — green
  success:         "#159A70",
  successBg:       "#E7F7F2",
  successDark:     "#0D6B4E",
  // Status — amber
  warning:         "#D98216",
  warningBg:       "#FEF3E2",
  warningDark:     "#9B5C10",
  // Status — red
  danger:          "#D64545",
  dangerBg:        "#FDEAEA",
  dangerDark:      "#9B2020",
  // Aliases kept for backward compat with screens not yet migrated
  white:           "#FFFFFF",
  // Legacy COLORS aliases — screens still importing these won't break
  surfaceContainer:    "#F0F1F8",
  surfaceContainerLow: "#F5F5FB",
  surfaceContainerHigh:"#E8EAF3",
  surfaceDim:          "#DFE1EC",
  borderDark:          "#C8CAD4",
  text2:               "#73798A",      // alias → textSecondary
  textSecond:          "#73798A",
  primaryContainer:    "#2864E8",
  primaryFixed:        "#EEF2FD",
  primaryFixedDim:     "#B8CDFF",
  inverseSurface:      "#20232C",
  inverseOnSurface:    "#FFFFFF",
  inversePrimary:      "#B8CDFF",
  secondary:           "#73798A",
  secondaryContainer:  "#E8EAF3",
  onSecondaryContainer:"#73798A",
  info:                "#2864E8",
  infoBg:              "#EEF2FD",
  successBgLegacy:     "#E7F7F2",
  dangerBgLegacy:      "#FDEAEA",
  warningBgLegacy:     "#FEF3E2",
  successDarkLegacy:   "#0D6B4E",
  dangerDarkLegacy:    "#9B2020",
  warningDarkLegacy:   "#9B5C10",
} as const;

// ─── Spacing ─────────────────────────────────────────────────────────────────
export const SPACING = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  xxl: 32,
  xxxl: 40,
} as const;

// ─── Border radius ────────────────────────────────────────────────────────────
export const RADIUS = {
  xs:   8,    // inputs, tight chips
  sm:   12,   // small cards, tags
  md:   16,   // standard cards
  lg:   20,   // large cards
  xl:   24,   // hero cards
  xxl:  28,   // super hero
  pill: 999,
} as const;

// ─── Typography ───────────────────────────────────────────────────────────────
export const FONTS = {
  regular:  "System",
  medium:   "System",
  semibold: "System",
  bold:     "System",
} as const;

export const TYPE = {
  display:     { fontSize: 48, fontWeight: "900", lineHeight: 54, letterSpacing: -1.5 },
  h1:          { fontSize: 28, fontWeight: "800", lineHeight: 34, letterSpacing: -0.6 },
  h2:          { fontSize: 22, fontWeight: "700", lineHeight: 28, letterSpacing: -0.4 },
  h3:          { fontSize: 18, fontWeight: "700", lineHeight: 24, letterSpacing: -0.2 },
  title:       { fontSize: 16, fontWeight: "600", lineHeight: 22, letterSpacing: -0.1 },
  body:        { fontSize: 15, fontWeight: "400", lineHeight: 22 },
  bodyMedium:  { fontSize: 15, fontWeight: "500", lineHeight: 22 },
  bodySmall:   { fontSize: 13, fontWeight: "400", lineHeight: 19 },
  label:       { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  caption:     { fontSize: 12, fontWeight: "500", lineHeight: 16 },
  overline:    { fontSize: 11, fontWeight: "800", lineHeight: 14, letterSpacing: 1.2 },
} as const;

// ─── Shadows ──────────────────────────────────────────────────────────────────
const elev = (y: number, blur: number, opacity: number, radius: number, e: number) =>
  Platform.select({
    web:     { boxShadow: `0 ${y}px ${blur}px rgba(30, 35, 50, ${opacity})` },
    default: { shadowColor: "#1E2332", shadowOffset: { width: 0, height: y }, shadowOpacity: opacity, shadowRadius: radius, elevation: e },
  }) as object;

export const SHADOWS = {
  none: {},
  sm:   elev(2,  8,  0.05, 3,  2),
  md:   elev(4,  16, 0.07, 6,  4),
  lg:   elev(8,  28, 0.10, 12, 8),
} as const;

// ─── Legacy dark-mode tokens (kept so old screens compile) ───────────────────
export const DARK = {
  bg:              "#0E1012",
  surface:         "#17191D",
  surfaceHigh:     "#1F2227",
  surfaceHigher:   "#282C32",
  border:          "#2B2F36",
  borderSoft:      "rgba(255,255,255,0.07)",
  text:            "#F5F6F8",
  textSecondary:   "#A9AFB8",
  textMuted:       "#71777F",
  success:         "#34D399",
  successSoft:     "rgba(52,211,153,0.15)",
  warning:         "#FBBF24",
  warningSoft:     "rgba(251,191,36,0.15)",
  danger:          "#F87171",
  dangerSoft:      "rgba(248,113,113,0.15)",
  info:            "#60A5FA",
  infoSoft:        "rgba(96,165,250,0.15)",
} as const;

// ─── Legacy accent token ──────────────────────────────────────────────────────
export const ACCENT = {
  base:  "#2864E8",
  dark:  "#1A4EC4",
  soft:  "rgba(40,100,232,0.12)",
  on:    "#FFFFFF",
} as const;

// ─── Expiry helper ────────────────────────────────────────────────────────────
export function expiryTone(expiry: string): { bg: string; fg: string; label: string } {
  const days = Math.floor(
    (new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (days <= 30) return { bg: COLORS.dangerBg,  fg: COLORS.danger,  label: `${days}d left` };
  if (days <= 90) return { bg: COLORS.warningBg, fg: COLORS.warning, label: `${days}d left` };
  return { bg: COLORS.successBg, fg: COLORS.success, label: `${days}d left` };
}
