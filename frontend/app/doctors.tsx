import { useCallback, useState } from "react";
import { useDebounce } from "@/src/hooks/useDebounce";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { confirmDestructive } from "@/src/confirm";
import { alertMsg } from "@/src/dialog";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { PageShell } from "@/src/components/PageShell";
import { SearchBar } from "@/src/components/ui/SearchBar";
import { EmptyState } from "@/src/components/ui/EmptyState";

type Doctor = {
  id: string;
  name: string;
  phone: string;
  clinic: string;
  speciality: string;
  address: string;
};

const EMPTY: Omit<Doctor, "id"> = { name: "", phone: "", clinic: "", speciality: "", address: "" };

export default function Doctors() {
  const [list, setList] = useState<Doctor[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [form, setForm] = useState<Omit<Doctor, "id">>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (query = q) => {
    setLoading(true);
    try {
      setList(await api<Doctor[]>(`/doctors${query ? `?q=${encodeURIComponent(query)}` : ""}`));
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [q]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const debouncedLoad = useDebounce(load);

  const openAdd = () => { setEditing(null); setForm(EMPTY); setShowForm(true); };
  const openEdit = (d: Doctor) => {
    setEditing(d);
    setForm({ name: d.name, phone: d.phone, clinic: d.clinic, speciality: d.speciality, address: d.address });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) { alertMsg("Required", "Doctor name is required"); return; }
    setSaving(true);
    try {
      if (editing) {
        await api(`/doctors/${editing.id}`, { method: "PUT", body: form });
      } else {
        await api("/doctors", { method: "POST", body: form });
      }
      setShowForm(false);
      load(q);
    } catch (e: any) {
      alertMsg("Error", e?.message || "Save failed");
    } finally { setSaving(false); }
  };

  const remove = (d: Doctor) => confirmDestructive(
    `Remove Dr. ${d.name}?`, "Existing bills will keep the reference.", "Remove",
    async () => {
      try { await api(`/doctors/${d.id}`, { method: "DELETE" }); load(q); }
      catch (e: any) { alertMsg("Error", e?.message || "Delete failed"); }
    }
  );

  const f = (key: keyof typeof form, label: string, opts?: { keyboard?: any; multiline?: boolean }) => (
    <View style={s.field} key={key}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.fieldInput, opts?.multiline && { minHeight: 70, textAlignVertical: "top", paddingTop: 10 }]}
        value={form[key]}
        onChangeText={(v) => setForm({ ...form, [key]: v })}
        keyboardType={opts?.keyboard ?? "default"}
        multiline={opts?.multiline}
        placeholderTextColor={COLORS.textMuted}
      />
    </View>
  );

  const AddBtn = (
    <TouchableOpacity onPress={openAdd} style={s.addBtn} activeOpacity={0.85}>
      <Feather name="user-plus" size={18} color={COLORS.white} />
    </TouchableOpacity>
  );

  return (
    <PageShell title="Doctor Referrals" rightAction={AddBtn} scrollable={false} noPadding>
      <View style={s.searchWrap}>
        <SearchBar
          value={q}
          onChangeText={(v) => { setQ(v); debouncedLoad(v); }}
          placeholder="Search doctors or clinics…"
        />
      </View>

      {loading && list.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(d) => d.id}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <EmptyState
              icon="user"
              title="No referral sources yet"
              subtitle="Add doctors to track referrals and prescription sources."
            />
          }
          renderItem={({ item: d }) => (
            <View style={s.card}>
              <View style={s.avatar}>
                <Feather name="user" size={17} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.doctorName} numberOfLines={1}>Dr. {d.name}</Text>
                <Text style={s.meta} numberOfLines={1}>
                  {[d.speciality, d.clinic, d.phone].filter(Boolean).join("  ·  ")}
                </Text>
              </View>
              <TouchableOpacity onPress={() => openEdit(d)} style={s.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="edit-2" size={15} color={COLORS.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => remove(d)} style={s.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="trash-2" size={15} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <View style={s.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>{editing ? "Edit Doctor" : "New Doctor"}</Text>
              <TouchableOpacity onPress={() => setShowForm(false)} style={s.closeBtn}>
                <Feather name="x" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.sheetBody} keyboardShouldPersistTaps="handled">
              {f("name", "Name *")}
              {f("speciality", "Speciality")}
              {f("clinic", "Clinic / Hospital")}
              {f("phone", "Phone", { keyboard: "phone-pad" })}
              {f("address", "Address", { multiline: true })}
              <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.saveBtnText}>Save Doctor</Text>}
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
  list: { paddingHorizontal: SPACING.lg, paddingBottom: 40, gap: 8 },
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.white, padding: 14,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
  },
  avatar: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  doctorName: { fontSize: 14, fontWeight: "600", color: COLORS.text },
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
