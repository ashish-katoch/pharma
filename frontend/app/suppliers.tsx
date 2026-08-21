import { useCallback, useState } from "react";
import { useDebounce } from "@/src/hooks/useDebounce";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { confirmDestructive } from "@/src/confirm";
import { alertMsg } from "@/src/dialog";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { PageShell } from "@/src/components/PageShell";
import { SearchBar } from "@/src/components/ui/SearchBar";
import { EmptyState } from "@/src/components/ui/EmptyState";

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

const EMPTY: Omit<Supplier, "id"> = { name: "", phone: "", email: "", address: "", gstin: "", dl_no: "", credit_limit: 0 };

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

  function openAdd() { setEditing(null); setForm(EMPTY); setShowForm(true); }
  function openEdit(sup: Supplier) {
    setEditing(sup);
    setForm({ name: sup.name, phone: sup.phone, email: sup.email, address: sup.address, gstin: sup.gstin, dl_no: sup.dl_no, credit_limit: sup.credit_limit });
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

  function remove(sup: Supplier) {
    confirmDestructive(
      `Delete "${sup.name}"?`, "This cannot be undone.", "Delete",
      async () => {
        try { await api(`/suppliers/${sup.id}`, { method: "DELETE" }); load(q); }
        catch (e: any) { alertMsg("Error", e?.message || "Delete failed"); }
      },
    );
  }

  const f = (key: keyof typeof form, label: string, opts?: { keyboard?: any; multiline?: boolean }) => (
    <View style={s.field} key={key}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.fieldInput, opts?.multiline && { minHeight: 70, textAlignVertical: "top", paddingTop: 10 }]}
        value={String(form[key])}
        onChangeText={(v) => setForm({ ...form, [key]: v })}
        keyboardType={opts?.keyboard ?? "default"}
        multiline={opts?.multiline}
        placeholderTextColor={COLORS.textMuted}
        autoCapitalize="none"
      />
    </View>
  );

  const AddBtn = (
    <TouchableOpacity onPress={openAdd} style={s.addBtn} activeOpacity={0.85}>
      <Feather name="plus" size={18} color={COLORS.white} />
    </TouchableOpacity>
  );

  return (
    <PageShell title="Suppliers" rightAction={AddBtn} scrollable={false} noPadding>
      <View style={s.searchWrap}>
        <SearchBar
          value={q}
          onChangeText={(v) => { setQ(v); debouncedLoad(v); }}
          placeholder="Search suppliers…"
        />
      </View>

      <TouchableOpacity style={s.newPurchaseBar} onPress={() => router.push("/purchase-new")} activeOpacity={0.85}>
        <View style={s.newPurchaseIcon}>
          <Feather name="shopping-bag" size={16} color={COLORS.primary} />
        </View>
        <Text style={s.newPurchaseText}>New Purchase Entry</Text>
        <Feather name="chevron-right" size={16} color={COLORS.primary} />
      </TouchableOpacity>

      {loading && list.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(sup) => sup.id}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <EmptyState
              icon="truck"
              title="No suppliers yet"
              subtitle="Add suppliers to track purchases and payments."
            />
          }
          renderItem={({ item: sup }) => (
            <TouchableOpacity style={s.card} onPress={() => router.push(`/supplier/${sup.id}` as any)} activeOpacity={0.85}>
              <View style={s.avatar}>
                <Feather name="truck" size={17} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.supplierName} numberOfLines={1}>{sup.name}</Text>
                <Text style={s.meta} numberOfLines={1}>
                  {[sup.phone, sup.gstin && `GST: ${sup.gstin}`].filter(Boolean).join("  ·  ") || "No contact info"}
                </Text>
              </View>
              <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); openEdit(sup); }} style={s.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="edit-2" size={15} color={COLORS.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); remove(sup); }} style={s.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="trash-2" size={15} color={COLORS.danger} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <View style={s.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>{editing ? "Edit Supplier" : "New Supplier"}</Text>
              <TouchableOpacity onPress={() => setShowForm(false)} style={s.closeBtn}>
                <Feather name="x" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.sheetBody} keyboardShouldPersistTaps="handled">
              {f("name", "Name *")}
              {f("phone", "Phone", { keyboard: "phone-pad" })}
              {f("email", "Email", { keyboard: "email-address" })}
              {f("gstin", "GSTIN")}
              {f("dl_no", "Drug License No.")}
              {f("address", "Address", { multiline: true })}
              {f("credit_limit", "Credit Limit (₹)", { keyboard: "numeric" })}
              <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.saveBtnText}>Save Supplier</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </PageShell>
  );
}

const s = StyleSheet.create({
  searchWrap: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  newPurchaseBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: COLORS.primaryLight,
    marginHorizontal: SPACING.lg, marginBottom: SPACING.sm,
    padding: 14, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.primaryFixedDim,
  },
  newPurchaseIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center" },
  newPurchaseText: { flex: 1, fontSize: 14, fontWeight: "600", color: COLORS.primary },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: 40, gap: 8 },
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.white, padding: 14,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
  },
  avatar: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  supplierName: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  addBtn: { width: 36, height: 36, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  iconBtn: { padding: 6 },
  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "90%" },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: SPACING.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: COLORS.text },
  closeBtn: { width: 32, height: 32, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceContainerLow, alignItems: "center", justifyContent: "center" },
  sheetBody: { padding: SPACING.lg, paddingBottom: 40 },
  field: { gap: 6, marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, color: COLORS.textSecondary, textTransform: "uppercase" },
  fieldInput: { minHeight: 46, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, backgroundColor: COLORS.surface, fontSize: 15, color: COLORS.text },
  saveBtn: { minHeight: 52, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", marginTop: 8 },
  saveBtnText: { color: COLORS.white, fontWeight: "700", fontSize: 16 },
});
