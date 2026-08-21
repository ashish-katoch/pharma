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
import { alertMsg } from "@/src/dialog";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { PageShell } from "@/src/components/PageShell";
import { SearchBar } from "@/src/components/ui/SearchBar";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { Badge } from "@/src/components/ui/Badge";

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

  const load = useCallback(async (query = q) => {
    setLoading(true);
    try {
      const data = await api<Customer[]>(`/customers${query ? `?q=${encodeURIComponent(query)}` : ""}`);
      setList(data);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [q]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const debouncedLoad = useDebounce(load);

  function openAdd() { setEditing(null); setForm(EMPTY_FORM); setShowForm(true); }
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

  const AddBtn = (
    <TouchableOpacity onPress={openAdd} style={s.addBtn} activeOpacity={0.85}>
      <Feather name="user-plus" size={18} color={COLORS.white} />
    </TouchableOpacity>
  );

  return (
    <PageShell title="Customers" rightAction={AddBtn} scrollable={false} noPadding>
      {/* Search */}
      <View style={s.searchWrap}>
        <SearchBar
          value={q}
          onChangeText={(v) => { setQ(v); debouncedLoad(v); }}
          placeholder="Search name or phone…"
        />
      </View>

      {loading && list.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(c) => c.id}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <EmptyState
              icon="users"
              title="No customers yet"
              subtitle="Add your first customer to track credit and purchase history."
            />
          }
          renderItem={({ item: c }) => (
            <TouchableOpacity
              style={s.card}
              onPress={() => router.push({ pathname: "/customer/[id]", params: { id: c.id } })}
              activeOpacity={0.85}
            >
              <View style={s.avatar}>
                <Text style={s.avatarText}>{(c.name?.[0] ?? "?").toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.name} numberOfLines={1}>{c.name}</Text>
                {c.phone ? <Text style={s.meta} numberOfLines={1}>{c.phone}</Text> : null}
              </View>
              {c.outstanding > 0 && (
                <Badge label={rupee(c.outstanding)} tone="danger" />
              )}
              <TouchableOpacity onPress={() => openEdit(c)} style={s.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="edit-2" size={15} color={COLORS.textMuted} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <View style={s.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>{editing ? "Edit Customer" : "New Customer"}</Text>
              <TouchableOpacity onPress={() => setShowForm(false)} style={s.closeBtn}>
                <Feather name="x" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.sheetBody} keyboardShouldPersistTaps="handled">
              <Field label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} keyboard="phone-pad" />
              <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} multiline />
              <Field label="Credit Limit (₹)" value={form.credit_limit} onChange={(v) => setForm({ ...form, credit_limit: v })} keyboard="numeric" />
              <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.saveBtnText}>Save Customer</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </PageShell>
  );
}

function Field({ label, value, onChange, keyboard, multiline }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboard?: import("react-native").KeyboardTypeOptions;
  multiline?: boolean;
}) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.fieldInput, multiline && { minHeight: 80, textAlignVertical: "top", paddingTop: 10 }]}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboard ?? "default"}
        multiline={!!multiline}
        placeholderTextColor={COLORS.textMuted}
      />
    </View>
  );
}

const s = StyleSheet.create({
  searchWrap: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: 40, gap: 8 },
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.white, padding: 14,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 16, fontWeight: "800", color: COLORS.primary },
  name: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  addBtn: { width: 36, height: 36, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  iconBtn: { padding: 6 },
  // Modal
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
