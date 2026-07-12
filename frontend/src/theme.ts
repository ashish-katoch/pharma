export const COLORS = {
  // base
  white: "#FFFFFF",
  surface: "#F8FAFC",
  border: "#E2E8F0",
  borderDark: "#CBD5E1",
  // text
  text: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#94A3B8",
  textInverse: "#FFFFFF",
  // brand
  primary: "#2563EB",
  primaryHover: "#1D4ED8",
  primaryLight: "#EFF6FF",
  // status
  success: "#10B981",
  successBg: "#D1FAE5",
  warning: "#F59E0B",
  warningBg: "#FEF3C7",
  danger: "#EF4444",
  dangerBg: "#FEE2E2",
  info: "#3B82F6",
  infoBg: "#DBEAFE",
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
