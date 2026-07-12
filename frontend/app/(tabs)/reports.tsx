import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { COLORS, RADIUS, SPACING, expiryTone } from "@/src/theme";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type LowStockItem = {
  id: string;
  name: string;
  pack?: string;
  total_stock: number;
  reorder_level: number;
};

type ExpiringBatch = {
  id: string;
  medicine_name: string;
  strength: string;
  batch_no: string;
  expiry: string;
  quantity: number;
  mrp: number;
};

export default function Reports() {
  const [tab, setTab] = useState<"expiring" | "low">("expiring");
  const [window, setWindow] = useState<30 | 60 | 90>(30);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [expiring, setExpiring] = useState<ExpiringBatch[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "low") {
        const items = await api<LowStockItem[]>("/reports/low-stock");
        setLowStock(items);
      } else {
        const items = await api<ExpiringBatch[]>(`/reports/expiring?window=${window}`);
        setExpiring(items);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [tab, window]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Reports</Text>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          testID="reports-tab-expiring"
          style={[styles.tab, tab === "expiring" && styles.tabActive]}
          onPress={() => setTab("expiring")}
        >
          <Feather name="calendar" size={16} color={tab === "expiring" ? COLORS.white : COLORS.textSecondary} />
          <Text style={[styles.tabText, tab === "expiring" && styles.tabTextActive]}>Expiring</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="reports-tab-low"
          style={[styles.tab, tab === "low" && styles.tabActive]}
          onPress={() => setTab("low")}
        >
          <Feather name="alert-triangle" size={16} color={tab === "low" ? COLORS.white : COLORS.textSecondary} />
          <Text style={[styles.tabText, tab === "low" && styles.tabTextActive]}>Low stock</Text>
        </TouchableOpacity>
      </View>

      {tab === "expiring" && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.windowRow}
        >
          {[30, 60, 90].map((w) => (
            <TouchableOpacity
              key={w}
              testID={`reports-window-${w}`}
              style={[styles.chip, window === w && styles.chipActive]}
              onPress={() => setWindow(w as any)}
            >
              <Text style={[styles.chipText, window === w && styles.chipTextActive]}>{w} days</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100, gap: 8 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.primary} />}
      >
        {loading && !expiring.length && !lowStock.length ? (
          <ActivityIndicator style={{ marginTop: 20 }} color={COLORS.primary} />
        ) : tab === "expiring" ? (
          expiring.length === 0 ? (
            <EmptyBlock icon="check-circle" label={`No batches expiring in ${window} days`} tone="success" />
          ) : (
            expiring.map((b) => {
              const tone = expiryTone(b.expiry);
              return (
                <View key={b.id} style={styles.card}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{b.medicine_name}</Text>
                    <Text style={styles.cardMeta}>
                      Batch {b.batch_no} · Qty {b.quantity} · {rupee(b.mrp)}
                    </Text>
                    <View style={styles.tagRow}>
                      <View style={[styles.expiryBadge, { backgroundColor: tone.bg }]}>
                        <Text style={[styles.expiryBadgeText, { color: tone.fg }]}>
                          {b.expiry} · {tone.label}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })
          )
        ) : lowStock.length === 0 ? (
          <EmptyBlock icon="check-circle" label="All stock is above reorder level" tone="success" />
        ) : (
          lowStock.map((m) => (
            <View key={m.id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>{m.name}</Text>
                <Text style={styles.cardMeta}>{m.pack}</Text>
                <View style={styles.tagRow}>
                  <View style={[styles.expiryBadge, { backgroundColor: COLORS.dangerBg }]}>
                    <Text style={[styles.expiryBadgeText, { color: COLORS.danger }]}>
                      {m.total_stock} left · reorder at {m.reorder_level}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function EmptyBlock({ icon, label, tone }: any) {
  const fg = tone === "success" ? COLORS.success : COLORS.textMuted;
  return (
    <View style={styles.emptyBlock}>
      <Feather name={icon} size={40} color={fg} />
      <Text style={{ color: fg, fontSize: 15, fontWeight: "600", marginTop: 8 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.lg },
  title: { fontSize: 26, fontWeight: "800", color: COLORS.text, letterSpacing: -0.5 },
  tabs: {
    flexDirection: "row",
    marginHorizontal: SPACING.lg,
    padding: 4,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: RADIUS.sm,
  },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { fontSize: 13, fontWeight: "700", color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.white },
  windowRow: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: 8 },
  chip: {
    flexShrink: 0,
    height: 36,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, fontWeight: "700", color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.white },
  card: {
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  cardMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  tagRow: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  expiryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
  },
  expiryBadgeText: { fontSize: 12, fontWeight: "700" },
  emptyBlock: {
    padding: SPACING.xxl,
    alignItems: "center",
    justifyContent: "center",
  },
});
