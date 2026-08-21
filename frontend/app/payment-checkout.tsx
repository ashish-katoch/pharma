import { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { api } from "@/src/api";
import { COLORS, SPACING, RADIUS } from "@/src/theme";
import { PageShell } from "@/src/components/PageShell";

type OrderResp = {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  checkout_url: string;
};
type VerifyResp = { ok: boolean; plan: string; message?: string };

const PLAN_LABELS: Record<string, string> = {
  pro: "Pro Plan",
};
const MONTHS_LABELS: Record<string, string> = {
  "1": "1 Month",
  "6": "6 Months",
  "12": "12 Months",
};

export default function PaymentCheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ plan?: string; months?: string }>();
  const plan = params.plan ?? "pro";
  const months = params.months ?? "1";

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderResp | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const resp = await api<OrderResp>("/payments/create-order", {
          method: "POST",
          body: { plan, months: parseInt(months, 10) },
        });
        setOrder(resp);
      } catch (e: unknown) {
        setError((e as Error).message || "Could not create payment order");
      } finally {
        setLoading(false);
      }
    })();
  }, [plan, months]);

  const pay = async () => {
    if (!order) return;
    setPaying(true);
    try {
      const result = await WebBrowser.openAuthSessionAsync(
        order.checkout_url,
        "pharmacounter://payment-return"
      );

      if (result.type === "cancel" || result.type === "dismiss") {
        Alert.alert("Payment Cancelled", "You cancelled the payment.");
        return;
      }

      // Deep link returns with razorpay_payment_id + razorpay_signature in URL
      if (result.type === "success") {
        const url = result.url;
        const paymentId = extractParam(url, "razorpay_payment_id");
        const signature = extractParam(url, "razorpay_signature");

        if (!paymentId || !signature) {
          Alert.alert("Verify Payment", "Payment ID or signature missing. Please contact support.");
          return;
        }

        const verifyResp = await api<VerifyResp>("/payments/verify", {
          method: "POST",
          body: {
            razorpay_order_id: order.order_id,
            razorpay_payment_id: paymentId,
            razorpay_signature: signature,
          },
        });

        if (verifyResp.ok) {
          Alert.alert(
            "Payment Successful!",
            `Your plan has been upgraded to ${verifyResp.plan.toUpperCase()}.`,
            [{ text: "Great!", onPress: () => router.replace("/subscription-plan" as any) }]
          );
        } else {
          Alert.alert("Verification Failed", verifyResp.message || "Payment could not be verified.");
        }
      }
    } catch (e: unknown) {
      Alert.alert("Payment Error", (e as Error).message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <PageShell title="Checkout" showBack scrollable={false}>
      <View style={styles.content}>
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Setting up payment…</Text>
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={32} color={COLORS.danger} />
            <Text style={styles.errorTitle}>Could not initiate payment</Text>
            <Text style={styles.errorMsg}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
              <Text style={styles.retryBtnText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        ) : order ? (
          <>
            {/* Order summary */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryIconRow}>
                <View style={styles.planIcon}>
                  <Feather name="zap" size={28} color={COLORS.white} />
                </View>
              </View>
              <Text style={styles.planName}>{PLAN_LABELS[plan] ?? plan}</Text>
              <Text style={styles.durationText}>{MONTHS_LABELS[months] ?? `${months} months`}</Text>
              <View style={styles.divider} />
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Total</Text>
                <Text style={styles.priceValue}>
                  ₹{(order.amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 0 })}
                </Text>
              </View>
              <Text style={styles.orderIdText}>Order: {order.order_id}</Text>
            </View>

            {/* Payment method note */}
            <View style={styles.noteCard}>
              <Feather name="shield" size={16} color="#059669" />
              <Text style={styles.noteText}>
                Payments are processed securely by Razorpay. UPI, cards, net banking, and wallets accepted.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.payBtn, paying && { opacity: 0.6 }]}
              onPress={pay}
              disabled={paying}
            >
              {paying ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Feather name="credit-card" size={20} color={COLORS.white} />
                  <Text style={styles.payBtnText}>
                    Pay ₹{(order.amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 0 })}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()} style={styles.cancelLink}>
              <Text style={styles.cancelLinkText}>Cancel</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </PageShell>
  );
}

function extractParam(url: string, key: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get(key);
  } catch {
    const match = url.match(new RegExp(`[?&]${key}=([^&]+)`));
    return match ? decodeURIComponent(match[1]) : null;
  }
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: SPACING.lg },
  centerBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: SPACING.md },
  loadingText: { fontSize: 15, color: COLORS.textSecondary },
  errorBox: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: SPACING.md,
    padding: SPACING.xl,
  },
  errorTitle: { fontSize: 17, fontWeight: "700", color: COLORS.text },
  errorMsg: { fontSize: 14, color: COLORS.textSecondary, textAlign: "center" },
  retryBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, marginTop: SPACING.md,
  },
  retryBtnText: { color: COLORS.white, fontWeight: "700", fontSize: 15 },
  summaryCard: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.xl, alignItems: "center", gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  summaryIconRow: { marginBottom: SPACING.sm },
  planIcon: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center",
    shadowColor: COLORS.primary, shadowOpacity: 0.25, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  planName: { fontSize: 22, fontWeight: "800", color: COLORS.text },
  durationText: { fontSize: 14, color: COLORS.textSecondary },
  divider: { width: "100%", height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm },
  priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" },
  priceLabel: { fontSize: 15, fontWeight: "600", color: COLORS.textSecondary },
  priceValue: { fontSize: 28, fontWeight: "900", color: COLORS.text },
  orderIdText: { fontSize: 11, color: COLORS.textMuted, marginTop: SPACING.sm },
  noteCard: {
    flexDirection: "row", gap: SPACING.sm, alignItems: "flex-start",
    backgroundColor: "#ECFDF5", borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: "#A7F3D0",
    padding: SPACING.md, marginBottom: SPACING.lg,
  },
  noteText: { flex: 1, fontSize: 13, color: "#065F46", lineHeight: 18 },
  payBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
    minHeight: 56, alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 10,
  },
  payBtnText: { color: COLORS.white, fontSize: 18, fontWeight: "800" },
  cancelLink: { alignItems: "center", marginTop: SPACING.lg },
  cancelLinkText: { fontSize: 14, color: COLORS.textMuted, fontWeight: "600" },
});
