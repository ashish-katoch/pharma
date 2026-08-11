import { useCallback, useState } from "react";
import { useDebounce } from "@/src/hooks/useDebounce";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal,
  KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { confirmDestructive } from "@/src/confirm";
import { alertMsg } from "@/src/dialog";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

type Supplier = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  dl_no: string;
  credit_limit: number;
};

const EMPTY: Supplier = { id: "", name: "", phone: "", email: "", address: "", gstin: "", dl_no: "", credit_limit: 0 };

export default function Suppliers() {
  const router = useRouter();
  const [list, setList] = useState<Supplier[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<Omit<Supplier, "id">>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (query = q) => {
    setLoading(true);
    try {
      const data = await api<Supplier[]>(`/suppliers${query ? `?q=${encodeURIComponent(query)}` : ""}`);
      setList(data);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [q]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const debouncedLoad = useDebounce(load);

  function openAdd() {
    setEditing(null);
    setForm({ name: "", phone: "", email: "", address: "", gstin: "", dl_no: "", credit_limit: 0 });
    setShowForm(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({ name: s.name, phone: s.phone, email: s.email, address: s.address, gstin: s.gstin, dl_no: s.dl_no, credit_limit: s.credit_limit });
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim()) { alertMsg("Required", "Supplier name is required"); return; }
    setSaving(true);
    const body = { ...form, credit_limit: parseFloat(String(form.credit_limit)) || 0 };
    try {
      if (editing) {
        await api(`/suppliers/${editing.id}`, { method: "PUT", body });
      } else {
        await api("/suppliers", { method: "POST", body });
      }
      setShowForm(false);
      load(q);
    } catch (e: any) {
      alertMsg("Error", e?.message || "Save failed");
    } finally { setSaving(false); }
  }

  function remove(s: Supplier) {
    confirmDestructive(
      `Delete "${s.name}"?`,
      "This cannot be undone.",
      "Delete",
      async () => {
        try {
          await api(`/suppliers/${s.id}`, { method: "DELETE" });
          load(q);
        } catch (e: any) {
          alertMsg("Error", e?.message || "Delete failed");
        }
      },
    );
  }

  const f = (key: keyof typeof form, label: string, opts?: { keyboard?: any; multiline?: boolean }) => (
    <View style={{ gap: 4, marginBottom: SPACING.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.field, opts?.multiline && { minHeight: 70, textAlignVertical: "top", paddingTop: 10 }]}
        value={String(form[key])}
        onChangeText={(v) => setForm({ ...form, [key]: v })}
        keyboardType={opts?.keyboard || "default"}
        multiline={opts?.multiline}
        placeholderTextColor={COLORS.textMuted}
        autoCapitalize="none"
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Suppliers</Text>
        <TouchableOpacity onPress={openAdd} style={styles.addBtn}>
          <Feather name="plus" size={20} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <Feather name="search" size={16} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search suppliers…"
          placeholderTextColor={COLORS.textMuted}
          value={q}
          onChangeText={(v) => { setQ(v); debouncedLoad(v); }}
        />
      </View>

      <TouchableOpacity style={styles.newPurchaseBar} onPress={() => router.push("/purchase-new")}>
        <Feather name="shopping-bag" size={16} color={COLORS.primary} />
        <Text style={styles.newPurchaseText}>New Purchase Entry</Text>
        <Feather name="chevron-right" size={16} color={COLORS.textMuted} />
      </TouchableOpacity>

      {loading && list.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No suppliers yet. Tap + to add.</Text>}
          renderItem={({ item: s }) => (
            <TouchableOpacity style={styles.card} onPress={() => router.push(`/supplier/${s.id}` as any)} activeOpacity={0.85}>
              <View style={styles.avatar}>
                <Feather name="truck" size={18} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.supplierName}>{s.name}</Text>
                {s.phone ? <Text style={styles.meta}>{s.phone}</Text> : null}
                {s.gstin ? <Text style={styles.meta}>GSTIN: {s.gstin}</Text> : null}
              </View>
              <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); openEdit(s); }} style={styles.iconBtn}>
                <Feather name="edit-2" size={15} color={COLORS.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); remove(s); }} style={styles.iconBtn}>
                <Feather name="trash-2" size={15} color={COLORS.danger} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editing ? "Edit Supplier" : "New Supplier"}</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Feather name="x" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 40 }}>
              {f("name", "Name *")}
              {f("phone", "Phone", { keyboard: "phone-pad" })}
              {f("email", "Email", { keyboard: "email-address" })}
              {f("gstin", "GSTIN")}
              {f("dl_no", "Drug License No.")}
              {f("address", "Address", { multiline: true })}
              {f("credit_limit", "Credit Limit (₹)", { keyboard: "numeric" })}
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.lg, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: COLORS.text },
  addBtn: { width: 36, height: 36, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 6, margin: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.sm },
  searchInput: { flex: 1, height: 44, fontSize: 15, color: COLORS.text },
  newPurchaseBar: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.primaryLight, marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary },
  newPurchaseText: { flex: 1, fontSize: 14, fontWeight: "700", color: COLORS.primary },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: 40, gap: 8 },
  empty: { textAlign: "center", color: COLORS.textMuted, marginTop: 40 },
  card: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.white, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  supplierName: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  iconBtn: { padding: 6 },
  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "90%" },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  fieldLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.textSecondary },
  field: { minHeight: 46, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, backgroundColor: COLORS.surface, fontSize: 15, color: COLORS.text },
  saveBtn: { minHeight: 52, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", marginTop: SPACING.md },
  saveBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 16 },
});
