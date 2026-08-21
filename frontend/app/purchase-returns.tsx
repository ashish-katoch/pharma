import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type SupplierReturn = {
  id: string;
  debit_note_no: string;
  supplier_name: string;
  return_date: string;
  total_amount: number;
  lines: Array<{ medicine_name: string; batch_no: string; quantity: number; reason: string }>;
  notes?: string;
  status: string;
  created_by: string;
  created_at: string;
};

export default function PurchaseReturns() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const [list, setList] = useState<SupplierReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setList(await api<SupplierReturn[]>("/supplier-returns?limit=200"));
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = list.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.debit_note_no.toLowerCase().includes(q) ||
      r.supplier_name.toLowerCase().includes(q) ||
      r.lines.some((l) => l.medicine_name.toLowerCase().includes(q))
    );
  });

  const totalReturned = list.reduce((s, r) => s + r.total_amount, 0);

  return (
    <SafeAreaView style={[styles.root, isDesktop && styles.rootDesktop]} edges={["top"]}>
      <View style={isDesktop ? styles.desktopCol : { flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Purchase Returns</Text>
        <TouchableOpacity onPress={() => router.push("/supplier-return" as any)} style={styles.newBtn}>
          <Feather name="plus" size={18} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <Feather name="search" size={15} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by supplier, debit note or medicine…"
          placeholderTextColor={COLORS.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Feather name="x" size={15} color={COLORS.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Feather name="rotate-ccw" size={40} color={COLORS.border} />
              <Text style={styles.empty}>
                {search ? `No returns matching "${search}"` : "No purchase returns yet.\nTap + to create a supplier return."}
              </Text>
            </View>
          }
          ListHeaderComponent={
            list.length > 0 ? (
              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{list.length}</Text>
                  <Text style={styles.summaryLabel}>Returns</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{rupee(totalReturned)}</Text>
                  <Text style={styles.summaryLabel}>Total Debit Value</Text>
                </View>
              </View>
            ) : null
          }
          renderItem={({ item: r }) => {
            const isOpen = expanded === r.id;
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => setExpanded(isOpen ? null : r.id)}
                activeOpacity={0.85}
              >
                <View style={styles.cardTop}>
                  <View style={styles.cardIcon}>
                    <Feather name="rotate-ccw" size={16} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.cardTitleRow}>
                      <Text style={styles.debitNo}>{r.debit_note_no}</Text>
                      <Text style={styles.cardAmt}>{rupee(r.total_amount)}</Text>
                    </View>
                    <Text style={styles.cardMeta}>{r.supplier_name} · {r.return_date}</Text>
                    <Text style={styles.cardMeta2}>
                      {r.lines.length} item{r.lines.length !== 1 ? "s" : ""}{r.notes ? ` · ${r.notes}` : ""}
                    </Text>
                  </View>
                  <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={16} color={COLORS.textMuted} />
                </View>

                {isOpen && (
                  <View style={styles.linesWrap}>
                    {r.lines.map((l, i) => (
                      <View key={i} style={styles.line}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.lineName}>{l.medicine_name}</Text>
                          <Text style={styles.lineMeta}>Batch {l.batch_no} · {l.reason}</Text>
                        </View>
                        <Text style={styles.lineQty}>{l.quantity} units</Text>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}
      </View>
    </SafeAreaView>
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
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: COLORS.text },
  newBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: 40, gap: 8 },
  emptyWrap: { alignItems: "center", marginTop: 60, gap: 12 },
  empty: { textAlign: "center", color: COLORS.textMuted, lineHeight: 22 },
  summaryRow: { flexDirection: "row", gap: SPACING.md, marginBottom: SPACING.md },
  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    alignItems: "center",
  },
  summaryValue: { fontSize: 18, fontWeight: "900", color: COLORS.text },
  summaryLabel: { fontSize: 11, fontWeight: "700", color: COLORS.textMuted, marginTop: 2 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm, padding: SPACING.md },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  debitNo: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  cardAmt: { fontSize: 14, fontWeight: "800", color: COLORS.primary },
  cardMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  cardMeta2: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  linesWrap: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm },
  line: { flexDirection: "row", alignItems: "center", paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border + "40" },
  lineName: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  lineMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  lineQty: { fontSize: 13, fontWeight: "700", color: COLORS.text },
});
