import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform, useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { COLORS, SPACING, RADIUS } from "@/src/theme";

type PlanFeatures = {
  max_staff: number;
  max_medicines: number;
  analytics: boolean;
  multi_store: boolean;
  api_access: boolean;
  export_csv: boolean;
  schedule_h: boolean;
  two_factor_auth: boolean;
  journal_entries: boolean;
};

type PlanResp = {
  plan: string;
  features: PlanFeatures;
  all_plans: Record<string, PlanFeatures>;
};

const PLAN_LABELS: Record<string, { name: string; price: string; color: string; bg: string }> = {
  starter: { name: "Starter", price: "Free", color: "#16A34A", bg: "#DCFCE7" },
  pro: { name: "Pro", price: "₹999/mo", color: "#7C3AED", bg: "#F5F3FF" },
};

const FEATURE_LABELS: Record<keyof PlanFeatures, string> = {
  max_staff: "Staff accounts",
  max_medicines: "Medicine catalog",
  analytics: "Advanced analytics",
  multi_store: "Multi-store support",
  api_access: "API access",
  export_csv: "CSV export",
  schedule_h: "Schedule H register",
  two_factor_auth: "Two-factor auth",
  journal_entries: "Journal entries",
};

function fmtLimit(key: keyof PlanFeatures, val: number | boolean): string {
  if (typeof val === "boolean") return val ? "✓" : "—";
  if (val === -1) return "Unlimited";
  if (key === "max_staff") return `Up to ${val}`;
  if (key === "max_medicines") return `Up to ${val}`;
  return String(val);
}

export default function SubscriptionPlanScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const [data, setData] = useState<PlanResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api<PlanResp>("/plan/features");
      setData(resp);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const switchPlan = (plan: string) => {
    if (plan === data?.plan) return;
    if (plan === "pro") {
      // Redirect to Razorpay checkout
      router.push({ pathname: "/payment-checkout" as any, params: { plan: "pro", months: "1" } });
      return;
    }
    Alert.alert(
      "Downgrade to Starter?",
      "You'll lose Pro features at the end of your current billing period.",
      [
        { text: "Cancel" },
        {
          text: "Downgrade",
          style: "destructive",
          onPress: async () => {
            setUpgrading(true);
            try {
              await api("/plan/upgrade", { method: "POST", body: { plan } });
              await load();
              Alert.alert("Plan updated to Starter.");
            } catch (e: unknown) {
              Alert.alert("Error", (e as Error).message || "Failed to update plan");
            } finally { setUpgrading(false); }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, isDesktop && styles.rootDesktop]} edges={["top"]}>
        <View style={isDesktop ? styles.desktopCol : { flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <Feather name="arrow-left" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Subscription Plan</Text>
        </View>
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const currentPlan = data?.plan ?? "starter";
  const allPlans = data?.all_plans ?? {};

  return (
    <SafeAreaView style={[styles.root, isDesktop && styles.rootDesktop]} edges={["top"]}>
      <View style={isDesktop ? styles.desktopCol : { flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Subscription Plan</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Current plan badge */}
        {(() => {
          const cfg = PLAN_LABELS[currentPlan];
          return (
            <View style={[styles.currentBadge, { backgroundColor: cfg?.bg ?? COLORS.surface }]}>
              <Feather name="check-circle" size={18} color={cfg?.color ?? COLORS.primary} />
              <Text style={[styles.currentText, { color: cfg?.color ?? COLORS.primary }]}>
                Current Plan: {cfg?.name ?? currentPlan}
              </Text>
            </View>
          );
        })()}

        {/* Plan cards */}
        {Object.entries(PLAN_LABELS).map(([planKey, cfg]) => {
          const features = allPlans[planKey];
          const isActive = planKey === currentPlan;
          return (
            <View key={planKey} style={[styles.planCard, isActive && styles.planCardActive, { borderColor: isActive ? cfg.color : COLORS.border }]}>
              <View style={styles.planHeader}>
                <View style={[styles.planBadge, { backgroundColor: cfg.bg }]}>
                  <Text style={[styles.planName, { color: cfg.color }]}>{cfg.name}</Text>
                </View>
                <Text style={styles.planPrice}>{cfg.price}</Text>
                {isActive && (
                  <View style={[styles.activePill, { backgroundColor: cfg.bg }]}>
                    <Text style={[styles.activePillText, { color: cfg.color }]}>CURRENT</Text>
                  </View>
                )}
              </View>

              {features && (
                <View style={styles.featureList}>
                  {(Object.keys(FEATURE_LABELS) as Array<keyof PlanFeatures>).map((fk) => {
                    const val = features[fk];
                    const enabled = typeof val === "boolean" ? val : (val as number) !== 0;
                    return (
                      <View key={fk} style={styles.featureRow}>
                        <Feather
                          name={enabled ? "check" : "minus"}
                          size={14}
                          color={enabled ? cfg.color : COLORS.border}
                        />
                        <Text style={[styles.featureName, !enabled && styles.featureDisabled]}>
                          {FEATURE_LABELS[fk]}
                        </Text>
                        <Text style={[styles.featureVal, { color: enabled ? cfg.color : COLORS.textMuted }]}>
                          {fmtLimit(fk, val as number | boolean)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {!isActive && (
                <TouchableOpacity
                  style={[styles.switchBtn, { backgroundColor: cfg.color }]}
                  onPress={() => switchPlan(planKey)}
                  disabled={upgrading}
                >
                  {upgrading ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <Text style={styles.switchBtnText}>
                      {planKey === "pro" ? "Upgrade to Pro" : "Downgrade to Starter"}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        <View style={styles.note}>
          <Feather name="credit-card" size={14} color={COLORS.textMuted} />
          <Text style={styles.noteText}>
            Upgrades go through Razorpay — UPI, cards, and net banking accepted. Downgrades to Starter take effect immediately.
          </Text>
        </View>
      </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  rootDesktop: { backgroundColor: "#F0F2F8" },
  desktopCol: {
    flex: 1,
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    backgroundColor: COLORS.surface,
  },
  header: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    padding: SPACING.lg, backgroundColor: COLORS.white,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: COLORS.text },
  scroll: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 },
  currentBadge: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    padding: SPACING.md, borderRadius: RADIUS.md,
  },
  currentText: { fontSize: 14, fontWeight: "700" },
  planCard: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, padding: SPACING.lg, gap: SPACING.md,
  },
  planCardActive: { borderWidth: 2 },
  planHeader: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  planBadge: { borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 4 },
  planName: { fontSize: 15, fontWeight: "800" },
  planPrice: { flex: 1, fontSize: 16, fontWeight: "900", color: COLORS.text, textAlign: "right" },
  activePill: { borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 3 },
  activePillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  featureList: { gap: 8 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  featureName: { flex: 1, fontSize: 13, color: COLORS.text },
  featureDisabled: { color: COLORS.textMuted },
  featureVal: { fontSize: 12, fontWeight: "700", minWidth: 70, textAlign: "right" },
  switchBtn: {
    borderRadius: RADIUS.md, paddingVertical: 12,
    alignItems: "center", justifyContent: "center",
  },
  switchBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 14 },
  note: {
    flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm,
    padding: SPACING.md, backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
  },
  noteText: { flex: 1, fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
});
