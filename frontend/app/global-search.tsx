import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";

type Result = Record<string, any>;

function resultName(r: Result): string {
  return r?.name ?? r?.brand_name ?? r?.title ?? r?.full_name ?? "Untitled";
}

function medicineSub(r: Result): string {
  const parts = [r?.manufacturer, r?.category, r?.pack]
    .filter(Boolean)
    .map(String);
  if (r?.mrp != null) parts.push(`MRP ₹${r.mrp}`);
  return parts.join(" · ") || "Medicine";
}

function customerSub(r: Result): string {
  const parts = [r?.phone ?? r?.mobile, r?.email].filter(Boolean).map(String);
  return parts.join(" · ") || "Customer";
}

export default function GlobalSearchScreen() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [medicines, setMedicines] = useState<Result[]>([]);
  const [customers, setCustomers] = useState<Result[]>([]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setSearched(true);
    const [meds, custs] = await Promise.all([
      api<Result[]>("/medicines?q=" + encodeURIComponent(q)).catch(() => []),
      api<Result[]>("/customers?q=" + encodeURIComponent(q)).catch(() => []),
    ]);
    setMedicines(Array.isArray(meds) ? meds : []);
    setCustomers(Array.isArray(custs) ? custs : []);
    setLoading(false);
  }, [query]);

  const noResults =
    searched && !loading && medicines.length === 0 && customers.length === 0;

  return (
    <PageShell title="Search">
      <View style={s.searchBar}>
        <Feather name="search" size={18} color={COLORS.textMuted} />
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={runSearch}
          placeholder="Search medicines & customers"
          placeholderTextColor={COLORS.textMuted}
          autoFocus
          autoCapitalize="none"
          returnKeyType="search"
        />
        <TouchableOpacity style={s.goBtn} activeOpacity={0.8} onPress={runSearch}>
          <Text style={s.goBtnText}>Go</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={COLORS.primary} />
      ) : !searched ? (
        <View style={s.empty}>
          <Feather name="search" size={40} color={COLORS.textMuted} />
          <Text style={s.emptyText}>Type a term and press Go to search</Text>
        </View>
      ) : noResults ? (
        <View style={s.empty}>
          <Feather name="inbox" size={40} color={COLORS.textMuted} />
          <Text style={s.emptyText}>No matches for "{query.trim()}"</Text>
        </View>
      ) : (
        <>
          {medicines.length > 0 && (
            <>
              <Text style={s.sectionLabel}>MEDICINES</Text>
              {medicines.map((r, i) => (
                <View key={r?.id ?? `m-${i}`} style={s.row}>
                  <View style={s.iconWrap}>
                    <Feather name="package" size={16} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle}>{resultName(r)}</Text>
                    <Text style={s.rowSub}>{medicineSub(r)}</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {customers.length > 0 && (
            <>
              <Text style={s.sectionLabel}>CUSTOMERS</Text>
              {customers.map((r, i) => (
                <View key={r?.id ?? `c-${i}`} style={s.row}>
                  <View style={s.iconWrap}>
                    <Feather name="user" size={16} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle}>{resultName(r)}</Text>
                    <Text style={s.rowSub}>{customerSub(r)}</Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </>
      )}
    </PageShell>
  );
}

const s = StyleSheet.create({
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    marginBottom: SPACING.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    paddingVertical: 8,
  },
  goBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
  },
  goBtnText: { color: COLORS.white, fontSize: 14, fontWeight: "700" },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  empty: { alignItems: "center", justifyContent: "center", padding: 48, gap: 10 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontWeight: "600", textAlign: "center" },
});
