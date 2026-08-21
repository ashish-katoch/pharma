import { Platform, View, useWindowDimensions, StyleSheet } from "react-native";
import { COLORS } from "@/src/theme";

const DESKTOP_MAX = 480;
const WIDE_MAX = 960;

/** Wraps page content to a centered max-width column on web/desktop */
export function DesktopCard({ children, maxWidth = DESKTOP_MAX }: { children: React.ReactNode; maxWidth?: number }) {
  const { width } = useWindowDimensions();
  if (Platform.OS !== "web" || width < 768) return <>{children}</>;
  return (
    <View style={s.outer}>
      <View style={[s.inner, { maxWidth }]}>{children}</View>
    </View>
  );
}

/** Full-width desktop shell with optional left sidebar space */
export function DesktopWide({ children, maxWidth = WIDE_MAX }: { children: React.ReactNode; maxWidth?: number }) {
  const { width } = useWindowDimensions();
  if (Platform.OS !== "web" || width < 768) return <>{children}</>;
  return (
    <View style={s.outer}>
      <View style={[s.inner, { maxWidth }]}>{children}</View>
    </View>
  );
}

export function useIsDesktop() {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= 768;
}

const s = StyleSheet.create({
  outer: {
    flex: 1,
    alignItems: "center",
    backgroundColor: COLORS.surface,
    width: "100%",
  },
  inner: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
  },
});
