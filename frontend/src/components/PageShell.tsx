/**
 * PageShell — standard desktop-aware wrapper for every screen.
 *
 * Desktop (web ≥ 768 px):
 *   • Sticky top bar: back button, title, optional right action
 *   • Content centred at maxWidth (default 860 px) with generous padding
 *   • Surface tint on the outer background so content "floats"
 *
 * Mobile:
 *   • SafeAreaView + optional ScrollView, same header pattern
 */

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  useWindowDimensions,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

interface PageShellProps {
  title?: string;
  children: React.ReactNode;
  /** Show a ← back button (default true if title is given) */
  showBack?: boolean;
  onBack?: () => void;
  /** Element rendered in the right slot of the header */
  rightAction?: React.ReactNode;
  /** Wrap children in a ScrollView (default true) */
  scrollable?: boolean;
  /** Max content width for desktop (default 860) */
  maxWidth?: number;
  /** Extra style on the content area */
  contentStyle?: ViewStyle;
  /** Sticky element pinned above the safe-area bottom (e.g. a CTA button) */
  footer?: React.ReactNode;
  /** Skip the default horizontal padding (e.g. for full-bleed lists) */
  noPadding?: boolean;
}

export function PageShell({
  title,
  children,
  showBack = !!title,
  onBack,
  rightAction,
  scrollable = true,
  maxWidth = 860,
  contentStyle,
  footer,
  noPadding = false,
}: PageShellProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  const handleBack = onBack ?? (() => router.back());

  const header = (title || showBack || rightAction) ? (
    <View style={[s.header, isDesktop && s.headerDesktop]}>
      <View style={s.headerInner}>
        {showBack && (
          <TouchableOpacity style={s.backBtn} onPress={handleBack} activeOpacity={0.7}>
            <Feather name="arrow-left" size={20} color={COLORS.text} />
          </TouchableOpacity>
        )}
        {title ? (
          <Text style={[s.headerTitle, isDesktop && s.headerTitleDesktop]} numberOfLines={1}>
            {title}
          </Text>
        ) : <View style={{ flex: 1 }} />}
        {rightAction ? (
          <View style={s.rightSlot}>{rightAction}</View>
        ) : (
          <View style={s.rightSlot} />
        )}
      </View>
    </View>
  ) : null;

  const content = (
    <View
      style={[
        s.contentWrap,
        isDesktop && { alignItems: "center" },
      ]}
    >
      <View
        style={[
          s.contentCol,
          isDesktop && { maxWidth },
          !noPadding && s.contentPad,
          contentStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );

  const inner = scrollable ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[s.scrollContent]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {content}
    </ScrollView>
  ) : (
    <View style={{ flex: 1 }}>{content}</View>
  );

  return (
    <SafeAreaView
      style={[s.root, isDesktop && s.rootDesktop]}
      edges={["top", "bottom"]}
    >
      {header}
      {inner}
      {footer && (
        <View style={[s.footer, isDesktop && s.footerDesktop]}>
          <View style={[isDesktop && { maxWidth, width: "100%", alignSelf: "center" }]}>
            {footer}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  rootDesktop: {
    backgroundColor: COLORS.bg,
  },

  /* ── HEADER ── */
  header: {
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerDesktop: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 32,
  },
  headerInner: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  headerTitleDesktop: {
    fontSize: 20,
    fontWeight: "800",
  },
  rightSlot: {
    minWidth: 36,
    alignItems: "flex-end",
  },

  /* ── CONTENT ── */
  contentWrap: {
    flex: 1,
  },
  contentCol: {
    flex: 1,
    width: "100%",
  },
  contentPad: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  scrollContent: {
    flexGrow: 1,
  },

  /* ── FOOTER ── */
  footer: {
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    padding: SPACING.md,
  },
  footerDesktop: {
    paddingHorizontal: 32,
  },
});
