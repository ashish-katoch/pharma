import { useCallback, useState } from "react";
import { useDebounce } from "@/src/hooks/useDebounce";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal,
  KeyboardAvoidingView, Platform, ScrollView,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { alertMsg } from "@/src/dialog";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type Customer = {
  id: string;
  name: string;
  phone: string;
  address: string;
  credit_limit: number;
  outstanding: number;
};

const EMPTY_FORM = { name: "", phone: "", address: "", credit_limit: "0" };

export default function Customers() {
  const router = useRouter();
  const [list, setList] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  const load = useCallback(async (query = q) => {
    setLoading(true);
    try {
      const data = await api<Customer[]>(`/customers${query ? `?q=${encodeURIComponent(query)}` : ""}`);
      setList(data);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [q]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const debouncedLoad = useDebounce(load);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone, address: c.address, credit_limit: String(c.credit_limit) });
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim()) { alertMsg("Required", "Customer name is required"); return; }
    setSaving(true);
    try {
      const body = { name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim(), credit_limit: parseFloat(form.credit_limit) || 0 };
      if (editing) {
        await api(`/customers/${editing.id}`, { method: "PUT", body });
      } else {
        await api("/customers", { method: "POST", body });
      }
      setShowForm(false);
      load(q);
    } catch (e: any) {
      alertMsg("Error", e?.message || "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <SafeAreaView style={[styles.root, isDesktop && styles.rootDesktop]} edges={["top"]}>
      <View style={isDesktop ? styles.desktopCol : { flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Customers</Text>
        <TouchableOpacity onPress={openAdd} style={styles.addBtn}>
          <Feather name="user-plus" size={20} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <Feather name="search" size={16} color={COLORS.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search name or phone…"
          placeholderTextColor={COLORS.textMuted}
          value={q}
          onChangeText={(v) => { setQ(v); debouncedLoad(v); }}
        />
      </View>

      {loading && list.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No customers yet. Tap + to add one.</Text>}
          renderItem={({ item: c }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push({ pathname: "/customer/[id]", params: { id: c.id } })}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(c.name?.[0] ?? "?").toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{c.name}</Text>
                {c.phone ? <Text style={styles.meta}>{c.phone}</Text> : null}
              </View>
              {c.outstanding > 0 && (
                <View style={styles.outstandingBadge}>
                  <Text style={styles.outstandingText}>{rupee(c.outstanding)}</Text>
                </View>
              )}
              <TouchableOpacity onPress={() => openEdit(c)} style={styles.editBtn}>
                <Feather name="edit-2" size={15} color={COLORS.textMuted} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editing ? "Edit Customer" : "New Customer"}</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Feather name="x" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.sheetBody}>
              <Field label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} keyboard="phone-pad" />
              <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} multiline />
              <Field label="Credit Limit (₹)" value={form.credit_limit} onChange={(v) => setForm({ ...form, credit_limit: v })} keyboard="numeric" />
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      </View>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, keyboard, multiline }: { label: string; value: string; onChange: (v: string) => void; keyboard?: import("react-native").KeyboardTypeOptions; multiline?: boolean }) {
  return (
    <View style={{ gap: 4, marginBottom: SPACING.md }}>
      <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.textSecondary }}>{label}</Text>
      <TextInput
        style={[{ minHeight: 46, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, backgroundColor: COLORS.surface, fontSize: 15, color: COLORS.text }, multiline && { minHeight: 80, textAlignVertical: "top", paddingTop: 10 }]}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboard || "default"}
        multiline={!!multiline}
        placeholderTextColor={COLORS.textMuted}
      />
    </View>
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
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.lg, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  back: { padding: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: COLORS.text },
  addBtn: { width: 36, height: 36, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  searchRow: { flexDirection: "row", alignItems: "center", margin: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.sm },
  searchIcon: { marginRight: 4 },
  searchInput: { flex: 1, height: 44, fontSize: 15, color: COLORS.text },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: 40, gap: 8 },
  empty: { textAlign: "center", color: COLORS.textMuted, marginTop: 40 },
  card: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.white, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontWeight: "800", color: COLORS.primary },
  name: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  outstandingBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.sm, backgroundColor: COLORS.dangerBg },
  outstandingText: { fontSize: 12, fontWeight: "700", color: COLORS.danger },
  editBtn: { padding: 6 },
  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "85%" },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  sheetBody: { padding: SPACING.lg, paddingBottom: 32 },
  saveBtn: { minHeight: 52, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", marginTop: SPACING.md },
  saveBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 16 },
});
