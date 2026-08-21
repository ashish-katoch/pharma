import { useState, useRef } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator, Keyboard, Platform, useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { COLORS, SPACING, RADIUS } from "@/src/theme";

type Medicine = {
  id: string;
  name: string;
  generic?: string;
  brand?: string;
  mrp: number;
  strength?: string;
  total_stock: number;
};

const QUICK_SYMPTOMS = [
  "Headache", "Fever", "Cold", "Cough", "Acidity",
  "Vomiting", "Diarrhea", "Pain", "Allergy", "Diabetes",
  "Blood Pressure", "Asthma", "Thyroid", "Cholesterol", "Vitamins",
];

export default function MedicineSuggestScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState("");
  const inputRef = useRef<TextInput>(null);

  const search = async (symptom: string) => {
    const q = symptom.trim();
    if (!q) return;
    Keyboard.dismiss();
    setLoading(true);
    setSearched(q);
    try {
      const data = await api<{ suggestions: Medicine[] }>(`/medicines/suggest?symptom=${encodeURIComponent(q)}&limit=20`);
      setResults(data.suggestions);
    } catch { setResults([]); } finally { setLoading(false); }
  };

  const renderMed = ({ item }: { item: Medicine }) => (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <Text style={styles.medName} numberOfLines={1}>{item.name}</Text>
        {item.generic ? <Text style={styles.medGeneric} numberOfLines={1}>{item.generic}</Text> : null}
        <View style={styles.tagRow}>
          {item.brand ? <View style={styles.tag}><Text style={styles.tagText}>{item.brand}</Text></View> : null}
          {item.strength ? <View style={styles.tag}><Text style={styles.tagText}>{item.strength}</Text></View> : null}
        </View>
      </View>
      <View style={styles.rightCol}>
        <Text style={styles.mrp}>₹{item.mrp.toFixed(2)}</Text>
        <View style={[styles.stockBadge, { backgroundColor: item.total_stock > 0 ? "#DCFCE7" : "#FEE2E2" }]}>
          <Text style={[styles.stockText, { color: item.total_stock > 0 ? "#16A34A" : "#DC2626" }]}>
            {item.total_stock > 0 ? `${item.total_stock} in stock` : "Out of stock"}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.root, isDesktop && styles.rootDesktop]} edges={["top"]}>
      <View style={isDesktop ? styles.desktopCol : { flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Medicine Suggestions</Text>
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchRow}>
          <Feather name="activity" size={18} color={COLORS.textMuted} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Enter symptom or condition…"
            placeholderTextColor={COLORS.textMuted}
            returnKeyType="search"
            onSubmitEditing={() => search(query)}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(""); setResults([]); setSearched(""); }}>
              <Feather name="x" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.searchBtn} onPress={() => search(query)}>
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      {!searched && (
        <View style={styles.quickWrap}>
          <Text style={styles.quickLabel}>COMMON SYMPTOMS</Text>
          <View style={styles.chips}>
            {QUICK_SYMPTOMS.map((s) => (
              <TouchableOpacity
                key={s}
                style={styles.quickChip}
                onPress={() => { setQuery(s); search(s); }}
              >
                <Text style={styles.quickChipText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {loading && <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />}

      {searched && !loading && (
        <FlatList
          data={results}
          keyExtractor={(m) => m.id}
          renderItem={renderMed}
          contentContainerStyle={{ padding: SPACING.md, gap: SPACING.sm, paddingBottom: 40 }}
          ListHeaderComponent={
            <Text style={styles.resultsHeader}>
              {results.length} medicine{results.length !== 1 ? "s" : ""} for "{searched}"
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="search" size={36} color={COLORS.border} />
              <Text style={styles.emptyText}>No suggestions found</Text>
              <Text style={styles.emptyHint}>Try a different symptom or search by medicine name in Inventory.</Text>
            </View>
          }
        />
      )}
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
  searchWrap: {
    flexDirection: "row", gap: SPACING.sm, padding: SPACING.md,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  searchRow: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, height: 44, backgroundColor: COLORS.surface,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text },
  searchBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, height: 44, justifyContent: "center",
  },
  searchBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 14 },
  quickWrap: { padding: SPACING.lg, gap: SPACING.md },
  quickLabel: { fontSize: 10, fontWeight: "800", color: COLORS.textMuted, letterSpacing: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  quickChip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  quickChipText: { fontSize: 13, fontWeight: "600", color: COLORS.text },
  resultsHeader: {
    fontSize: 12, color: COLORS.textMuted, fontWeight: "700",
    marginBottom: SPACING.sm, letterSpacing: 0.5,
  },
  card: {
    flexDirection: "row", alignItems: "flex-start", gap: SPACING.md,
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
  },
  medName: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  medGeneric: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  tagRow: { flexDirection: "row", gap: 4, marginTop: 6, flexWrap: "wrap" },
  tag: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 2,
  },
  tagText: { fontSize: 10, fontWeight: "700", color: COLORS.textSecondary },
  rightCol: { alignItems: "flex-end", gap: 6 },
  mrp: { fontSize: 15, fontWeight: "800", color: COLORS.text },
  stockBadge: { borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 3 },
  stockText: { fontSize: 10, fontWeight: "700" },
  empty: { alignItems: "center", paddingTop: 40, gap: SPACING.sm },
  emptyText: { fontSize: 16, fontWeight: "700", color: COLORS.textSecondary },
  emptyHint: { fontSize: 13, color: COLORS.textMuted, textAlign: "center", maxWidth: 280 },
});
