import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

type Med = {
  id: string;
  name: string;
  brand: string;
  strength: string;
  total_stock: number;
  location?: string;
};

type ParsedLoc = { block: string; row: string; shelf: string; raw: string };

function parseLocation(loc: string): ParsedLoc {
  const parts = loc.split("-");
  return {
    block: parts[0] ?? "",
    row: parts[1] ?? "",
    shelf: parts[2] ?? "",
    raw: loc,
  };
}

export default function LocationBrowser() {
  const router = useRouter();
  const [all, setAll] = useState<Med[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [block, setBlock] = useState<string | null>(null);
  const [row, setRow] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Med[]>("/medicines?limit=2000");
      setAll(data.filter((m) => m.location && m.location.trim()));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const locs = all.map((m) => ({ med: m, loc: parseLocation(m.location!) }));

  const blocks = [...new Set(locs.map((x) => x.loc.block))].sort();

  const rows = block
    ? [...new Set(locs.filter((x) => x.loc.block === block).map((x) => x.loc.row))].sort()
    : [];

  const shelves = block && row
    ? [...new Set(locs.filter((x) => x.loc.block === block && x.loc.row === row).map((x) => x.loc.shelf))].sort()
    : [];

  const medicines = block && row
    ? locs
        .filter((x) => x.loc.block === block && x.loc.row === row)
        .map((x) => x.med)
        .filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.location!.toLowerCase().includes(search.toLowerCase()))
    : [];

  const searchResults = search && !block
    ? all.filter((m) =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.location!.toLowerCase().includes(search.toLowerCase())
      )
    : null;

  const levelLabel = !block ? "Select Block" : !row ? `Block ${block} — Select Row` : `Block ${block} · Row ${row}`;

  const goBack = () => {
    if (row) { setRow(null); return; }
    if (block) { setBlock(null); return; }
    router.back();
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: SPACING.sm }}>
          <Text style={styles.title}>Location Browser</Text>
          <Text style={styles.subtitle}>{levelLabel}</Text>
        </View>
        {(block || row) && (
          <TouchableOpacity onPress={() => { setBlock(null); setRow(null); }} style={styles.resetBtn}>
            <Feather name="home" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.searchRow}>
        <Feather name="search" size={15} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search medicine or location (A-1-B)…"
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
      ) : searchResults ? (
        <FlatList
          data={searchResults}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No medicines found for "{search}"</Text>}
          renderItem={({ item: m }) => (
            <TouchableOpacity style={styles.medCard} onPress={() => router.push(`/medicine/${m.id}` as any)} activeOpacity={0.8}>
              <View style={styles.medIcon}>
                <Feather name="package" size={16} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.medName}>{m.name}</Text>
                {m.strength ? <Text style={styles.medMeta}>{m.strength}</Text> : null}
              </View>
              <View style={styles.locBadge}>
                <Feather name="map-pin" size={11} color={COLORS.primary} />
                <Text style={styles.locBadgeText}>{m.location}</Text>
              </View>
              <View style={[styles.stockBadge, m.total_stock === 0 && styles.stockBadgeOut]}>
                <Text style={[styles.stockText, m.total_stock === 0 && styles.stockTextOut]}>
                  {m.total_stock}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      ) : !block ? (
        <FlatList
          data={blocks}
          keyExtractor={(b) => b}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No medicines with locations yet. Assign locations in medicine settings.</Text>}
          ListHeaderComponent={
            <View style={styles.statRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{all.length}</Text>
                <Text style={styles.statLabel}>Located</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{blocks.length}</Text>
                <Text style={styles.statLabel}>Blocks</Text>
              </View>
            </View>
          }
          renderItem={({ item: b }) => {
            const count = locs.filter((x) => x.loc.block === b).length;
            const rowCount = [...new Set(locs.filter((x) => x.loc.block === b).map((x) => x.loc.row))].length;
            return (
              <TouchableOpacity style={styles.blockCard} onPress={() => { setBlock(b); setRow(null); }} activeOpacity={0.85}>
                <View style={styles.blockIcon}>
                  <Text style={styles.blockLetter}>{b}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.blockLabel}>Block {b}</Text>
                  <Text style={styles.blockMeta}>{rowCount} row{rowCount !== 1 ? "s" : ""} · {count} item{count !== 1 ? "s" : ""}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            );
          }}
        />
      ) : !row ? (
        <FlatList
          data={rows}
          keyExtractor={(r) => r}
          contentContainerStyle={styles.list}
          renderItem={({ item: r }) => {
            const count = locs.filter((x) => x.loc.block === block && x.loc.row === r).length;
            const shelfCount = [...new Set(locs.filter((x) => x.loc.block === block && x.loc.row === r).map((x) => x.loc.shelf))].length;
            return (
              <TouchableOpacity style={styles.rowCard} onPress={() => setRow(r)} activeOpacity={0.85}>
                <Feather name="layers" size={18} color={COLORS.primary} />
                <View style={{ flex: 1, marginLeft: SPACING.md }}>
                  <Text style={styles.rowLabel}>Row {r}</Text>
                  <Text style={styles.rowMeta}>{shelfCount} shelf/shelves · {count} item{count !== 1 ? "s" : ""}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            );
          }}
        />
      ) : (
        <>
          {shelves.length > 1 && (
            <View style={styles.shelfTabs}>
              {shelves.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.shelfTab, ]}
                  onPress={() => setSearch(`${block}-${row}-${s}`)}
                >
                  <Text style={styles.shelfTabText}>Shelf {s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <FlatList
            data={medicines}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>No medicines here.</Text>}
            renderItem={({ item: m }) => (
              <TouchableOpacity style={styles.medCard} onPress={() => router.push(`/medicine/${m.id}` as any)} activeOpacity={0.8}>
                <View style={styles.medIcon}>
                  <Feather name="package" size={16} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.medName}>{m.name}</Text>
                  {m.strength ? <Text style={styles.medMeta}>{m.strength} · {m.brand}</Text> : null}
                </View>
                <View style={styles.locBadge}>
                  <Feather name="map-pin" size={11} color={COLORS.primary} />
                  <Text style={styles.locBadgeText}>{m.location}</Text>
                </View>
                <View style={[styles.stockBadge, m.total_stock === 0 && styles.stockBadgeOut]}>
                  <Text style={[styles.stockText, m.total_stock === 0 && styles.stockTextOut]}>
                    {m.total_stock}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { fontSize: 17, fontWeight: "800", color: COLORS.text },
  subtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  resetBtn: { padding: 8, marginLeft: SPACING.sm },
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
  empty: { textAlign: "center", color: COLORS.textMuted, marginTop: 40, paddingHorizontal: SPACING.xl },
  statRow: {
    flexDirection: "row",
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  stat: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    alignItems: "center",
  },
  statValue: { fontSize: 22, fontWeight: "900", color: COLORS.text },
  statLabel: { fontSize: 11, fontWeight: "700", color: COLORS.textMuted, marginTop: 2, letterSpacing: 0.5 },
  blockCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  blockIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  blockLetter: { fontSize: 20, fontWeight: "900", color: COLORS.primary },
  blockLabel: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  blockMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  rowLabel: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  rowMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  shelfTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  shelfTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  shelfTabText: { fontSize: 12, fontWeight: "700", color: COLORS.text },
  medCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  medIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  medName: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  medMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  locBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  locBadgeText: { fontSize: 11, fontWeight: "700", color: COLORS.primary },
  stockBadge: {
    minWidth: 36,
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    backgroundColor: "#DCFCE7",
  },
  stockBadgeOut: { backgroundColor: "#FEE2E2" },
  stockText: { fontSize: 12, fontWeight: "800", color: "#166534" },
  stockTextOut: { color: "#991B1B" },
});
