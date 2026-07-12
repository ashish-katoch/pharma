import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type BillRow = {
  id: string;
  bill_no: string;
  customer_name: string;
  grand_total: number;
  status: string;
  created_at: string;
  lines: any[];
  payment_mode: string;
};

export default function History() {
  const router = useRouter();
  const [bills, setBills] = useState<BillRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await api<BillRow[]>("/bills");
      setBills(items);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="history-back">
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bill History</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading && bills.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={bills}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: SPACING.lg, gap: 8, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="clock" size={36} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>No bills yet</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`history-item-${item.id}`}
              style={[styles.card, item.status === "cancelled" && { opacity: 0.6 }]}
              onPress={() => router.push(`/bill/${item.id}`)}
              activeOpacity={0.85}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.billNo}>{item.bill_no}</Text>
                  {item.status === "cancelled" ? (
                    <View style={styles.cancelBadge}>
                      <Text style={styles.cancelBadgeText}>CANCELLED</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.meta}>
                  {new Date(item.created_at).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                  {" · "}
                  {item.customer_name || "Walk-in"}
                  {" · "}
                  {item.lines.length} items
                </Text>
              </View>
              <Text style={styles.amt}>{rupee(item.grand_total)}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  headerTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  billNo: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  amt: { fontSize: 15, fontWeight: "900", color: COLORS.text },
  cancelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: COLORS.dangerBg,
    borderRadius: 4,
  },
  cancelBadgeText: { color: COLORS.danger, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  empty: { alignItems: "center", padding: SPACING.xxl, gap: 8 },
  emptyText: { color: COLORS.textMuted, fontSize: 14 },
});
