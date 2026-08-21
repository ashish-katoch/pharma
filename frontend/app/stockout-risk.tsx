import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { COLORS, SPACING, RADIUS } from "@/src/theme";
import { PageShell } from "@/src/components/PageShell";
import { EmptyState } from "@/src/components/ui/EmptyState";

type RiskItem = {
  medicine_id: string;
  name: string;
  brand: string;
  current_stock: number;
  daily_velocity: number;
  days_remaining: number | null;
  reorder_level: number;
  risk_level: "critical" | "high" | "medium" | "low_stock";
};

const RISK_CONFIG = {
  critical: { label: "CRITICAL", bg: "#FEE2E2", text: "#DC2626", border: "#FCA5A5" },
  high: { label: "HIGH", bg: "#FEF3C7", text: "#D97706", border: "#FDE68A" },
  medium: { label: "MEDIUM", bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE" },
  low_stock: { label: "LOW", bg: "#F5F3FF", text: "#7C3AED", border: "#DDD6FE" },
};

const FILTERS = ["all", "critical", "high", "medium"] as const;
type Filter = typeof FILTERS[number];

export default function StockoutRiskScreen() {
  const router = useRouter();
  const [items, setItems] = useState<RiskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ items: RiskItem[]; count: number }>("/analytics/stockout-risk");
      setItems(data.items);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = filter === "all" ? items : items.filter((i) => i.risk_level === filter);

  const critCount = items.filter((i) => i.risk_level === "critical").length;
  const highCount = items.filter((i) => i.risk_level === "high").length;
  const medCount = items.filter((i) => i.risk_level === "medium").length;

  const renderItem = ({ item }: { item: RiskItem }) => {
    const cfg = RISK_CONFIG[item.risk_level] || RISK_CONFIG.medium;
    return (
      <View style={[styles.card, { borderColor: cfg.border }]}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.medName} numberOfLines={1}>{item.name}</Text>
            {item.brand ? <Text style={styles.medBrand} numberOfLines={1}>{item.brand}</Text> : null}
          </View>
          <View style={[styles.badge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
            <Text style={[styles.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{item.current_stock}</Text>
            <Text style={styles.statLbl}>IN STOCK</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statVal}>{item.daily_velocity > 0 ? item.daily_velocity.toFixed(1) : "—"}</Text>
            <Text style={styles.statLbl}>UNITS/DAY</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: cfg.text }]}>
              {item.days_remaining !== null ? `${item.days_remaining}d` : "—"}
            </Text>
            <Text style={styles.statLbl}>DAYS LEFT</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statVal}>{item.reorder_level}</Text>
            <Text style={styles.statLbl}>REORDER</Text>
          </View>
        </View>

        {item.days_remaining !== null && item.days_remaining <= 14 && (
          <View style={[styles.urgentBanner, { backgroundColor: cfg.bg }]}>
            <Feather name="alert-triangle" size={12} color={cfg.text} />
            <Text style={[styles.urgentText, { color: cfg.text }]}>
              {item.days_remaining <= 7
                ? `Reorder NOW — only ${item.days_remaining} day${item.days_remaining !== 1 ? "s" : ""} of stock left`
                : `Reorder soon — ${item.days_remaining} days remaining`}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
        <PageShell title="Stock-Out Risk" showBack scrollable={false} noPadding>
      {/* Summary cards */}
      {!loading && (
        <View style={styles.summaryRow}>
          <TouchableOpacity style={[styles.summaryCard, { borderColor: "#FCA5A5" }]} onPress={() => setFilter("critical")}>
            <Text style={[styles.summaryNum, { color: "#DC2626" }]}>{critCount}</Text>
            <Text style={styles.summaryLbl}>Critical</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.summaryCard, { borderColor: "#FDE68A" }]} onPress={() => setFilter("high")}>
            <Text style={[styles.summaryNum, { color: "#D97706" }]}>{highCount}</Text>
            <Text style={styles.summaryLbl}>High</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.summaryCard, { borderColor: "#BFDBFE" }]} onPress={() => setFilter("medium")}>
            <Text style={[styles.summaryNum, { color: "#2563EB" }]}>{medCount}</Text>
            <Text style={styles.summaryLbl}>Medium</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.summaryCard, { borderColor: COLORS.border }]} onPress={() => setFilter("all")}>
            <Text style={[styles.summaryNum, { color: COLORS.text }]}>{items.length}</Text>
            <Text style={styles.summaryLbl}>Total</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.medicine_id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.primary} />}
          contentContainerStyle={{ padding: SPACING.md, gap: SPACING.sm, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="check-circle" size={40} color="#16A34A" />
              <Text style={styles.emptyText}>No {filter !== "all" ? filter : ""} risk items</Text>
              <Text style={styles.emptyHint}>
                {filter === "all"
                  ? "All medicines have sufficient stock (30+ days)."
                  : `No ${filter}-risk items right now.`}
              </Text>
            </View>
          }
        />
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: COLORS.text },
  summaryRow: {
    flexDirection: "row", gap: SPACING.sm, padding: SPACING.md,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  summaryCard: {
    flex: 1, alignItems: "center", padding: SPACING.sm,
    borderRadius: RADIUS.md, borderWidth: 1, backgroundColor: COLORS.surface,
  },
  summaryNum: { fontSize: 20, fontWeight: "900" },
  summaryLbl: { fontSize: 9, fontWeight: "800", color: COLORS.textMuted, letterSpacing: 0.5, marginTop: 2 },
  filterRow: {
    flexDirection: "row", gap: SPACING.sm, padding: SPACING.sm, paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.white },
  card: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, padding: SPACING.md, gap: SPACING.sm,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm },
  medName: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  medBrand: { fontSize: 12, color: COLORS.textMuted },
  badge: {
    borderWidth: 1, borderRadius: RADIUS.sm,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  statsRow: { flexDirection: "row", alignItems: "center" },
  stat: { flex: 1, alignItems: "center" },
  statVal: { fontSize: 16, fontWeight: "900", color: COLORS.text, fontVariant: ["tabular-nums"] },
  statLbl: { fontSize: 8, fontWeight: "800", color: COLORS.textMuted, letterSpacing: 0.5, marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: COLORS.border },
  urgentBanner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: RADIUS.sm, padding: SPACING.sm,
  },
  urgentText: { flex: 1, fontSize: 11, fontWeight: "700" },
  empty: { alignItems: "center", paddingTop: 60, gap: SPACING.sm },
  emptyText: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  emptyHint: { fontSize: 13, color: COLORS.textMuted, textAlign: "center" },
});
