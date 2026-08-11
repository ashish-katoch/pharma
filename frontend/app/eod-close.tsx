import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useIsOwner } from "@/src/auth";
import { alertMsg, alertNav } from "@/src/dialog";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type Preview = {
  date: string;
  bill_count: number;
  total_sales: number;
  cash_expected: number;
  upi_total: number;
  card_total: number;
  credit_total: number;
};

type EodRecord = {
  id: string;
  date: string;
  total_sales: number;
  cash_expected: number;
  cash_actual: number;
  upi_total: number;
  card_total: number;
  credit_total: number;
  bill_count: number;
  notes: string;
  closed_by: string;
  created_at: string;
};

export default function EodClose() {
  const router = useRouter();
  const isOwner = useIsOwner();
  const today = new Date().toISOString().slice(0, 10);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<EodRecord[]>([]);
  const [cashActual, setCashActual] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [alreadyClosed, setAlreadyClosed] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [p, hist] = await Promise.all([
          api<Preview>(`/eod/preview?date=${today}`),
          api<EodRecord[]>("/eod?limit=30"),
        ]);
        setPreview(p);
        setHistory(hist);
        const closed = hist.some((r) => r.date === today);
        setAlreadyClosed(closed);
      } catch (e: any) {
        alertMsg("Error", e?.message || "Failed to load EOD data");
      } finally { setLoading(false); }
    }
    load();
  }, [today]);

  async function close() {
    const actual = parseFloat(cashActual);
    if (isNaN(actual) || actual < 0) {
      alertMsg("Required", "Enter the actual cash amount in drawer");
      return;
    }

    const diff = actual - (preview?.cash_expected ?? 0);
    const diffText = diff >= 0 ? `+${rupee(diff)} surplus` : `${rupee(diff)} short`;
    const confirmMsg = `Close day ${today}?\n\nTotal Sales: ${rupee(preview?.total_sales ?? 0)}\nCash Expected: ${rupee(preview?.cash_expected ?? 0)}\nCash Actual: ${rupee(actual)}\n${diffText}`;

    if (Platform.OS === "web") {
      if (!window.confirm(`Confirm EOD Close\n\n${confirmMsg}`)) return;
      setClosing(true);
      try {
        await api("/eod", { method: "POST", body: { date: today, cash_actual: actual, notes } });
        alertNav("Day Closed", `${today} has been reconciled.`, () => router.back());
      } catch (e: any) {
        alertMsg("Error", e?.message || "EOD close failed");
      } finally { setClosing(false); }
      return;
    }

    Alert.alert("Confirm EOD Close", confirmMsg, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Close Day", style: "destructive",
        onPress: async () => {
          setClosing(true);
          try {
            await api("/eod", { method: "POST", body: { date: today, cash_actual: actual, notes } });
            Alert.alert("Day Closed", `${today} has been reconciled.`, [{ text: "OK", onPress: () => router.back() }]);
          } catch (e: any) {
            Alert.alert("Error", e?.message || "EOD close failed");
          } finally { setClosing(false); }
        },
      },
    ]);
  }

  if (!isOwner) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <Feather name="arrow-left" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Close Day</Text>
          <View style={{ width: 30 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 }}>
          <Feather name="lock" size={40} color={COLORS.textMuted} />
          <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.text }}>Owner Only</Text>
          <Text style={{ fontSize: 14, color: COLORS.textMuted, textAlign: "center" }}>EOD close requires owner access.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <ActivityIndicator style={{ marginTop: 80 }} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  const cashDiff = preview ? parseFloat(cashActual || "0") - preview.cash_expected : 0;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>EOD Reconciliation</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Today's summary */}
        <View style={styles.dateRow}>
          <Feather name="calendar" size={16} color={COLORS.primary} />
          <Text style={styles.dateText}>{today}</Text>
          {alreadyClosed && (
            <View style={styles.closedBadge}>
              <Feather name="check-circle" size={12} color={COLORS.success} />
              <Text style={styles.closedText}>Closed</Text>
            </View>
          )}
        </View>

        {preview && (
          <>
            <View style={styles.kpiGrid}>
              <KpiCard label="Total Sales" value={rupee(preview.total_sales)} accent />
              <KpiCard label="Bills" value={String(preview.bill_count)} />
              <KpiCard label="Cash Expected" value={rupee(preview.cash_expected)} />
              <KpiCard label="UPI" value={rupee(preview.upi_total)} />
              <KpiCard label="Card" value={rupee(preview.card_total)} />
              <KpiCard label="Credit" value={rupee(preview.credit_total)} tone="warning" />
            </View>

            {!alreadyClosed && (
              <View style={styles.closeCard}>
                <Text style={styles.closeTitle}>Close Today's Drawer</Text>
                <Text style={styles.closeLabel}>Actual Cash in Drawer (₹) *</Text>
                <TextInput
                  style={styles.field}
                  value={cashActual}
                  onChangeText={setCashActual}
                  keyboardType="numeric"
                  placeholder="Enter counted cash"
                  placeholderTextColor={COLORS.textMuted}
                />
                {cashActual.length > 0 && (
                  <View style={[styles.diffRow, { backgroundColor: cashDiff >= 0 ? COLORS.successBg : COLORS.dangerBg }]}>
                    <Feather name={cashDiff >= 0 ? "trending-up" : "trending-down"} size={16} color={cashDiff >= 0 ? COLORS.success : COLORS.danger} />
                    <Text style={[styles.diffText, { color: cashDiff >= 0 ? COLORS.success : COLORS.danger }]}>
                      {cashDiff >= 0 ? "+" : ""}{rupee(cashDiff)} {cashDiff >= 0 ? "surplus" : "short"}
                    </Text>
                  </View>
                )}
                <Text style={styles.closeLabel}>Notes (optional)</Text>
                <TextInput
                  style={[styles.field, { minHeight: 60, textAlignVertical: "top", paddingTop: 10 }]}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  placeholder="Remarks…"
                  placeholderTextColor={COLORS.textMuted}
                />
                <TouchableOpacity
                  style={[styles.closeBtn, closing && { opacity: 0.6 }]}
                  onPress={close}
                  disabled={closing}
                >
                  {closing ? <ActivityIndicator color={COLORS.white} /> : (
                    <>
                      <Feather name="lock" size={18} color={COLORS.white} />
                      <Text style={styles.closeBtnText}>Close Day</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* History */}
        {history.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>RECENT CLOSINGS</Text>
            {history.map((r) => (
              <View key={r.id} style={styles.historyCard}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={styles.histDate}>{r.date}</Text>
                  <Text style={styles.histSales}>{rupee(r.total_sales)}</Text>
                </View>
                <View style={styles.histRow}>
                  <HistItem label="Bills" value={String(r.bill_count)} />
                  <HistItem label="Cash Exp." value={rupee(r.cash_expected)} />
                  <HistItem label="Cash Actual" value={rupee(r.cash_actual)} tone={r.cash_actual >= r.cash_expected ? "ok" : "warn"} />
                </View>
                {r.notes ? <Text style={styles.histNotes}>{r.notes}</Text> : null}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function KpiCard({ label, value, accent, tone }: { label: string; value: string; accent?: boolean; tone?: string }) {
  return (
    <View style={[styles.kpiCard, accent && { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight }]}>
      <Text style={[styles.kpiLabel, accent && { color: COLORS.primary }]}>{label}</Text>
      <Text style={[styles.kpiValue, accent && { color: COLORS.primary }, tone === "warning" && { color: COLORS.warning }]}>{value}</Text>
    </View>
  );
}

function HistItem({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={styles.histItemLabel}>{label}</Text>
      <Text style={[styles.histItemValue, tone === "warn" && { color: COLORS.danger }, tone === "ok" && { color: COLORS.success }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.lg, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: COLORS.text },
  scroll: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 60 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  dateText: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  closedBadge: { flexDirection: "row", gap: 4, alignItems: "center", backgroundColor: COLORS.successBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill },
  closedText: { fontSize: 12, fontWeight: "700", color: COLORS.success },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  kpiCard: { flex: 1, minWidth: "45%", backgroundColor: COLORS.white, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  kpiLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, color: COLORS.textMuted },
  kpiValue: { fontSize: 16, fontWeight: "800", color: COLORS.text, marginTop: 4 },
  closeCard: { backgroundColor: COLORS.white, padding: SPACING.lg, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm },
  closeTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  closeLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, color: COLORS.textSecondary },
  field: { minHeight: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, backgroundColor: COLORS.surface, fontSize: 15, color: COLORS.text },
  diffRow: { flexDirection: "row", gap: 6, alignItems: "center", padding: SPACING.sm, borderRadius: RADIUS.sm },
  diffText: { fontSize: 15, fontWeight: "800" },
  closeBtn: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 14, marginTop: SPACING.sm },
  closeBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 16 },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: 4 },
  historyCard: { backgroundColor: COLORS.white, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm },
  histDate: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  histSales: { fontSize: 15, fontWeight: "800", color: COLORS.primary },
  histRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.sm },
  histItemLabel: { fontSize: 10, fontWeight: "800", color: COLORS.textMuted, letterSpacing: 0.5 },
  histItemValue: { fontSize: 13, fontWeight: "700", color: COLORS.text, marginTop: 2 },
  histNotes: { fontSize: 12, color: COLORS.textSecondary, fontStyle: "italic" },
});
