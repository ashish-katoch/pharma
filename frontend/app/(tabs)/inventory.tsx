import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
} from "react-native";
import { PageShell } from "@/src/components/PageShell";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { Medicine } from "@/src/cart";
import { requestScan, cancelScan } from "@/src/scanBus";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { useStoreConfig } from "@/src/storeConfig";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const BASE_FILTERS = [
  { id: "all",  label: "All" },
  { id: "low",  label: "Low stock" },
  { id: "otc",  label: "OTC" },
  { id: "h",    label: "Schedule H" },
] as const;
type FilterId = (typeof BASE_FILTERS)[number]["id"];

export default function Inventory() {
  const router = useRouter();
  const storeConfig = useStoreConfig();
  const FILTERS = BASE_FILTERS.filter((f) => f.id !== "h" || storeConfig.schedule_h);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [loading, setLoading] = useState(false);

  useEffect(() => () => cancelScan(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = query ? `?q=${encodeURIComponent(query)}` : "";
      const items = await api<Medicine[]>(`/medicines${q}`);
      setMedicines(items);
    } catch {
      setMedicines([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const scanBarcode = () => {
    requestScan((code) => {
      // Fill search with scanned barcode — the load() effect will fire
      setQuery(code);
    });
    router.push({ pathname: "/scan", params: { mode: "return" } });
  };

  const filtered = medicines.filter((m) => {
    if (filter === "low") return m.total_stock <= (m.reorder_level ?? 10);
    if (filter === "otc") return (m.schedule || "").toUpperCase() === "OTC";
    if (filter === "h") return (m.schedule || "").toUpperCase().startsWith("H");
    return true;
  });

  const totalCount = medicines.length;
  const lowCount = medicines.filter((m) => m.total_stock > 0 && m.total_stock <= (m.reorder_level ?? 10)).length;
  const outCount = medicines.filter((m) => m.total_stock === 0).length;
  const totalValue = medicines.reduce((s, m) => s + (m.total_stock || 0) * (m.mrp || 0), 0);

  return (
    <PageShell scrollable={false} noPadding>
      <View style={styles.header}>
        <Text style={styles.title}>Inventory</Text>
        <View style={{ flexDirection: "row", gap: SPACING.sm }}>
          <TouchableOpacity
            testID="inventory-import-button"
            style={[styles.addBtn, { backgroundColor: COLORS.dark }]}
            onPress={() => router.push("/import-csv")}
            activeOpacity={0.85}
          >
            <Feather name="upload" size={16} color={COLORS.white} />
            <Text style={styles.addBtnText}>Import</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="inventory-add-button"
            style={styles.addBtn}
            onPress={() => router.push("/stock-in")}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={18} color={COLORS.white} />
            <Text style={styles.addBtnText}>Stock In</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bento summary row */}
      <View style={styles.bentoRow}>
        <View style={[styles.bentoCard, styles.bentoHero]}>
          <Text style={styles.bentoHeroValue}>{totalCount}</Text>
          <Text style={styles.bentoHeroLabel}>Total Products</Text>
          <Text style={styles.bentoHeroSub}>{rupee(totalValue)} stock value</Text>
        </View>
        <View style={styles.bentoRight}>
          <View style={[styles.bentoSmall, { borderColor: COLORS.warningBg }]}>
            <Feather name="alert-triangle" size={14} color={COLORS.warning} />
            <Text style={[styles.bentoSmallValue, { color: COLORS.warning }]}>{lowCount}</Text>
            <Text style={styles.bentoSmallLabel}>Low Stock</Text>
          </View>
          <View style={[styles.bentoSmall, { borderColor: COLORS.dangerBg }]}>
            <Feather name="x-circle" size={14} color={COLORS.danger} />
            <Text style={[styles.bentoSmallValue, { color: COLORS.danger }]}>{outCount}</Text>
            <Text style={styles.bentoSmallLabel}>Out of Stock</Text>
          </View>
        </View>
      </View>

      <View style={styles.searchBox}>
        <Feather name="search" size={20} color={COLORS.textMuted} />
        <TextInput
          testID="inventory-search-input"
          style={styles.searchInput}
          placeholder="Search catalogue…"
          placeholderTextColor={COLORS.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery("")} testID="inventory-clear-search">
            <Feather name="x" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={scanBarcode} testID="inventory-scan-btn">
            <Feather name="camera" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.chipsWrap}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTERS as any}
          keyExtractor={(f: any) => f.id}
          contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 8 }}
          renderItem={({ item }: any) => (
            <TouchableOpacity
              testID={`inventory-filter-${item.id}`}
              onPress={() => setFilter(item.id)}
              style={[styles.chip, filter === item.id && styles.chipActive]}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, filter === item.id && styles.chipTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <TouchableOpacity style={styles.locationBar} onPress={() => router.push("/location-browser" as any)}>
        <Feather name="map-pin" size={15} color={COLORS.primary} />
        <Text style={styles.locationBarText}>Location Browser (Block / Row / Shelf)</Text>
        <Feather name="chevron-right" size={15} color={COLORS.textMuted} />
      </TouchableOpacity>

      <FlatList
        data={filtered}
        keyExtractor={(m) => m.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.primary} />}
        contentContainerStyle={{ padding: SPACING.lg, gap: 8, paddingBottom: 100 }}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Feather name="package" size={36} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>No medicines match</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            testID={`inventory-item-${item.id}`}
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => router.push(`/medicine/${item.id}`)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {item.brand ? `${item.brand} · ` : ""}
                {item.pack || ""}
              </Text>
              <View style={styles.tagRow}>
                <Text style={[styles.stockTag, item.total_stock <= item.reorder_level && styles.stockTagLow]}>
                  {item.total_stock} in stock
                </Text>
                {item.schedule ? <Text style={styles.schedTag}>{item.schedule}</Text> : null}
                {item.location ? <Text style={styles.locTag}>{item.location}</Text> : null}
                <Text style={styles.mrpTag}>{rupee(item.mrp)}</Text>
              </View>
            </View>
            <Feather name="chevron-right" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      />
    </PageShell>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  bentoRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  bentoHero: {
    flex: 1,
    backgroundColor: COLORS.dark,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    justifyContent: "flex-end",
    minHeight: 100,
  },
  bentoHeroValue: { fontSize: 32, fontWeight: "800", color: COLORS.white, letterSpacing: -1 },
  bentoHeroLabel: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.6)", letterSpacing: 0.5, textTransform: "uppercase", marginTop: 2 },
  bentoHeroSub: { fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 },
  bentoRight: { gap: SPACING.sm, justifyContent: "space-between" },
  bentoCard: {},
  bentoSmall: {
    width: 110,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.sm,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    padding: SPACING.sm,
    gap: 2,
    flex: 1,
  },
  bentoSmallValue: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  bentoSmallLabel: { fontSize: 10, fontWeight: "600", color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.3 },
  title: { fontSize: 26, fontWeight: "800", color: COLORS.text, letterSpacing: -0.5 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: RADIUS.pill,
  },
  addBtnText: { color: COLORS.white, fontWeight: "700", fontSize: 13 },
  searchBox: {
    marginHorizontal: SPACING.lg,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    minHeight: 52,
    gap: SPACING.sm,
  },
  searchInput: { flex: 1, fontSize: 15, color: COLORS.text },
  chipsWrap: { height: 56, justifyContent: "center" },
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
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, fontWeight: "700", color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.white },
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
  cardTitle: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  cardMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6, alignItems: "center" },
  stockTag: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.success,
    backgroundColor: COLORS.successBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stockTagLow: { color: COLORS.danger, backgroundColor: COLORS.dangerBg },
  schedTag: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.textSecondary,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  locationBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.primaryLight,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  locationBarText: { flex: 1, fontSize: 13, fontWeight: "700", color: COLORS.primary },
  locTag: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6366F1",
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  mrpTag: { fontSize: 12, fontWeight: "800", color: COLORS.text, marginLeft: "auto" },
  empty: { alignItems: "center", padding: SPACING.xxl, gap: 8 },
  emptyText: { color: COLORS.textMuted, fontSize: 14 },
});
