import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, Platform, useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

const rupee = (n: number) =>
  `₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

type CatRow = { category: string; amount: number };

type PnlData = {
  month: string;
  revenue: number;
  gross_revenue: number;
  discounts_given: number;
  cogs: number;
  gross_profit: number;
  total_expenses: number;
  net_profit: number;
  margin_pct: number;
  bill_count: number;
  purchase_count: number;
  expenses_by_category?: CatRow[];
};

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function prevMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
}
function nextMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}
function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

const CAT_COLORS: Record<string, string> = {
  rent:        "#6366F1",
  salary:      "#0EA5E9",
  electricity: "#F59E0B",
  supplies:    "#10B981",
  maintenance: "#EF4444",
  other:       "#94A3B8",
};
const CAT_ICONS: Record<string, string> = {
  rent:        "home",
  salary:      "users",
  electricity: "zap",
  supplies:    "package",
  maintenance: "tool",
  other:       "more-horizontal",
};

function catColor(c: string) { return CAT_COLORS[c] ?? "#64748B"; }
function catIcon(c: string)  { return (CAT_ICONS[c] ?? "tag") as any; }

export default function PnlBreakdown() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const today = currentMonth();
  const [month, setMonth] = useState(today);
  const [data, setData] = useState<PnlData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<PnlData>(`/analytics/pnl?month=${month}`));
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [month]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cats: CatRow[] = data?.expenses_by_category ?? [];
  const total = data?.total_expenses ?? 0;
  const maxCat = Math.max(...cats.map((c) => c.amount), 1);
  const netProfit = data?.net_profit ?? data?.gross_profit ?? 0;

  return (
    <SafeAreaView style={[styles.root, isDesktop && styles.rootDesktop]} edges={["top"]}>
      <View style={isDesktop ? styles.desktopCol : { flex: 1 }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>P&amp;L Breakdown</Text>
        <TouchableOpacity onPress={load} style={{ padding: 4 }}>
          <Feather name="refresh-cw" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Month nav */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => setMonth(prevMonth(month))} style={styles.monthBtn}>
          <Feather name="chevron-left" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel(month)}</Text>
        <TouchableOpacity
          onPress={() => setMonth(nextMonth(month))}
          disabled={month >= today}
          style={[styles.monthBtn, month >= today && { opacity: 0.3 }]}
        >
          <Feather name="chevron-right" size={20} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={COLORS.primary} />
      ) : !data ? (
        <View style={styles.emptyWrap}>
          <Feather name="alert-circle" size={36} color={COLORS.border} />
          <Text style={styles.emptyText}>Could not load data.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>

          {/* Hero — Net Profit */}
          <View style={[styles.heroCard, { backgroundColor: netProfit >= 0 ? "#0F172A" : "#7F1D1D" }]}>
            <Text style={styles.heroEyebrow}>NET PROFIT · {monthLabel(month).toUpperCase()}</Text>
            <Text style={[styles.heroAmount, { color: netProfit >= 0 ? "#86EFAC" : "#FCA5A5" }]}>
              {netProfit < 0 ? "–" : ""}{rupee(netProfit)}
            </Text>
            <Text style={styles.heroMargin}>{data.margin_pct}% margin</Text>
          </View>

          {/* Summary cards */}
          <View style={styles.summaryRow}>
            <_SummaryCard label="Revenue" value={rupee(data.revenue)} color="#16A34A" icon="arrow-down-circle" />
            <_SummaryCard label="COGS" value={rupee(data.cogs)} color="#DC2626" icon="package" />
            <_SummaryCard label="Gross Profit" value={rupee(data.gross_profit)} color="#1D4ED8" icon="trending-up" />
          </View>

          {/* P&L waterfall */}
          <Text style={styles.sectionLabel}>PROFIT & LOSS STATEMENT</Text>
          <View style={styles.card}>
            <_PnlRow label="Gross Revenue" value={rupee(data.gross_revenue)} />
            {data.discounts_given > 0 && (
              <_PnlRow label="Discounts Given" value={`– ${rupee(data.discounts_given)}`} negative />
            )}
            <_PnlRow label="Net Revenue" value={rupee(data.revenue)} bold />
            <View style={styles.divider} />
            <_PnlRow label="Cost of Goods (COGS)" value={`– ${rupee(data.cogs)}`} negative />
            <_PnlRow label="Gross Profit" value={rupee(data.gross_profit)} bold accent={data.gross_profit >= 0} />
            {total > 0 && (
              <>
                <View style={styles.divider} />
                <_PnlRow label="Operating Expenses" value={`– ${rupee(total)}`} negative />
                <_PnlRow
                  label="Net Profit"
                  value={rupee(netProfit)}
                  bold
                  accent={netProfit >= 0}
                  negative={netProfit < 0}
                />
              </>
            )}
          </View>

          {/* Expense breakdown */}
          {total > 0 && (
            <>
              <Text style={styles.sectionLabel}>EXPENSE BREAKDOWN</Text>

              {/* Total expenses header */}
              <View style={styles.expHeader}>
                <Text style={styles.expHeaderLabel}>Total Operating Expenses</Text>
                <Text style={styles.expHeaderAmt}>{rupee(total)}</Text>
              </View>

              {cats.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>No category data available.</Text>
                </View>
              ) : (
                cats
                  .slice()
                  .sort((a, b) => b.amount - a.amount)
                  .map((cat, idx) => {
                    const pct = total > 0 ? (cat.amount / total) * 100 : 0;
                    const barPct = maxCat > 0 ? (cat.amount / maxCat) * 100 : 0;
                    const color = catColor(cat.category);
                    return (
                      <View key={cat.category} style={styles.catCard}>
                        <View style={styles.catHeader}>
                          <View style={[styles.catIcon, { backgroundColor: color + "1A" }]}>
                            <Feather name={catIcon(cat.category)} size={15} color={color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.catName}>
                              {cat.category.charAt(0).toUpperCase() + cat.category.slice(1)}
                            </Text>
                            <Text style={styles.catPct}>{pct.toFixed(1)}% of expenses</Text>
                          </View>
                          <View style={{ alignItems: "flex-end" }}>
                            <Text style={[styles.catAmt, { color }]}>{rupee(cat.amount)}</Text>
                            <Text style={styles.catRank}>#{idx + 1}</Text>
                          </View>
                        </View>
                        <View style={styles.catBarTrack}>
                          <View style={[styles.catBarFill, { width: `${barPct}%` as any, backgroundColor: color }]} />
                        </View>
                      </View>
                    );
                  })
              )}

              {/* Visual share chart */}
              {cats.length > 1 && (
                <>
                  <Text style={styles.sectionLabel}>SHARE OF EXPENSES</Text>
                  <View style={styles.shareCard}>
                    <View style={styles.shareBar}>
                      {cats
                        .slice()
                        .sort((a, b) => b.amount - a.amount)
                        .map((cat) => {
                          const pct = total > 0 ? (cat.amount / total) * 100 : 0;
                          return (
                            <View
                              key={cat.category}
                              style={[styles.shareSegment, { flex: pct, backgroundColor: catColor(cat.category) }]}
                            />
                          );
                        })}
                    </View>
                    <View style={styles.shareLegend}>
                      {cats
                        .slice()
                        .sort((a, b) => b.amount - a.amount)
                        .map((cat) => (
                          <View key={cat.category} style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: catColor(cat.category) }]} />
                            <Text style={styles.legendText}>
                              {cat.category.charAt(0).toUpperCase() + cat.category.slice(1)}
                            </Text>
                          </View>
                        ))}
                    </View>
                  </View>
                </>
              )}
            </>
          )}

          {total === 0 && (
            <View style={styles.infoNote}>
              <Feather name="info" size={14} color={COLORS.textMuted} />
              <Text style={styles.infoNoteText}>
                No operating expenses recorded for this month. Add expenses to see the full P&L breakdown.
              </Text>
            </View>
          )}

          {/* Footer stats */}
          <Text style={styles.sectionLabel}>ACTIVITY</Text>
          <View style={styles.kpiRow}>
            <_Kpi label="Bills Issued" value={String(data.bill_count)} />
            <_Kpi label="Purchases" value={String(data.purchase_count)} />
            <_Kpi label="Gross Margin" value={`${data.margin_pct}%`} />
          </View>
        </ScrollView>
      )}
      </View>
    </SafeAreaView>
  );
}

function _SummaryCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: any }) {
  return (
    <View style={[styles.summaryCard, { borderColor: color + "40" }]}>
      <Feather name={icon} size={16} color={color} />
      <Text style={[styles.summaryVal, { color }]}>{value}</Text>
      <Text style={styles.summaryLbl}>{label}</Text>
    </View>
  );
}

function _PnlRow({ label, value, bold, accent, negative }: {
  label: string; value: string; bold?: boolean; accent?: boolean; negative?: boolean;
}) {
  return (
    <View style={styles.pnlRow}>
      <Text style={[styles.pnlLabel, bold && styles.pnlLabelBold]}>{label}</Text>
      <Text style={[
        styles.pnlVal,
        bold && styles.pnlValBold,
        accent && { color: COLORS.success },
        negative && { color: COLORS.danger },
      ]}>
        {value}
      </Text>
    </View>
  );
}

function _Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiVal}>{value}</Text>
      <Text style={styles.kpiLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rootDesktop: { backgroundColor: "#F0F2F8" },
  desktopCol: {
    flex: 1,
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    backgroundColor: COLORS.surface,
  },
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    padding: SPACING.lg, backgroundColor: COLORS.white,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: COLORS.text },
  monthNav: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: SPACING.md, paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  monthBtn: { padding: 6 },
  monthLabel: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  scroll: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 48 },
  heroCard: {
    borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: "center", gap: 6,
  },
  heroEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: "#94A3B8" },
  heroAmount: { fontSize: 36, fontWeight: "900", letterSpacing: -1 },
  heroMargin: { fontSize: 13, fontWeight: "700", color: "#94A3B8" },
  summaryRow: { flexDirection: "row", gap: SPACING.sm },
  summaryCard: {
    flex: 1, borderRadius: RADIUS.md, borderWidth: 1,
    backgroundColor: COLORS.white, padding: SPACING.sm, alignItems: "center", gap: 3,
  },
  summaryVal: { fontSize: 12, fontWeight: "900" },
  summaryLbl: { fontSize: 9, fontWeight: "700", color: COLORS.textMuted, letterSpacing: 0.3 },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: 4 },
  card: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, overflow: "hidden",
  },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },
  pnlRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingHorizontal: SPACING.md, paddingVertical: 10,
  },
  pnlLabel: { fontSize: 13, color: COLORS.textSecondary, flex: 1, fontWeight: "500" },
  pnlLabelBold: { fontWeight: "700", color: COLORS.text },
  pnlVal: { fontSize: 13, fontWeight: "600", color: COLORS.text },
  pnlValBold: { fontSize: 14, fontWeight: "800" },
  expHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
  },
  expHeaderLabel: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  expHeaderAmt: { fontSize: 16, fontWeight: "900", color: COLORS.danger },
  catCard: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md, gap: SPACING.sm,
  },
  catHeader: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  catIcon: { width: 36, height: 36, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  catName: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  catPct: { fontSize: 11, fontWeight: "600", color: COLORS.textMuted, marginTop: 1 },
  catAmt: { fontSize: 15, fontWeight: "900" },
  catRank: { fontSize: 11, fontWeight: "700", color: COLORS.textMuted },
  catBarTrack: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: "hidden" },
  catBarFill: { height: 6, borderRadius: 3 },
  shareCard: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, gap: SPACING.md,
  },
  shareBar: { flexDirection: "row", height: 20, borderRadius: RADIUS.sm, overflow: "hidden" },
  shareSegment: { minWidth: 4 },
  shareLegend: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, fontWeight: "600", color: COLORS.textSecondary },
  infoNote: {
    flexDirection: "row", gap: 8, padding: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  infoNoteText: { flex: 1, fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
  kpiRow: { flexDirection: "row", gap: SPACING.sm },
  kpiCard: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md, alignItems: "center", gap: 4,
  },
  kpiVal: { fontSize: 16, fontWeight: "900", color: COLORS.text, letterSpacing: -0.5 },
  kpiLbl: { fontSize: 10, fontWeight: "700", color: COLORS.textMuted, letterSpacing: 0.5, textAlign: "center" },
  emptyWrap: { alignItems: "center", marginTop: 40, gap: 12 },
  emptyText: { color: COLORS.textMuted, fontSize: 14 },
});
