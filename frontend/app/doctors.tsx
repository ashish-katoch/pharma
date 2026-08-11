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
  const router = useRouter();
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
  const openEdit = (d: Doctor) => { setEditing(d); setForm({ name: d.name, phone: d.phone, clinic: d.clinic, speciality: d.speciality, address: d.address }); setShowForm(true); };

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
    <View style={{ gap: 4, marginBottom: SPACING.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.field, opts?.multiline && { minHeight: 70, textAlignVertical: "top", paddingTop: 10 }]}
        value={form[key]}
        onChangeText={(v) => setForm({ ...form, [key]: v })}
        keyboardType={opts?.keyboard || "default"}
        multiline={opts?.multiline}
        placeholderTextColor={COLORS.textMuted}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Doctor Referrals</Text>
        <TouchableOpacity onPress={openAdd} style={styles.addBtn}>
          <Feather name="user-plus" size={20} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <Feather name="search" size={16} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search doctors or clinics…"
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
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No doctors yet. Tap + to add referral sources.</Text>}
          renderItem={({ item: d }) => (
            <View style={styles.card}>
              <View style={styles.avatar}>
                <Feather name="user" size={18} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.doctorName}>Dr. {d.name}</Text>
                {d.speciality ? <Text style={styles.meta}>{d.speciality}</Text> : null}
                {d.clinic ? <Text style={styles.meta}>{d.clinic}</Text> : null}
                {d.phone ? <Text style={styles.meta}>{d.phone}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => openEdit(d)} style={styles.iconBtn}>
                <Feather name="edit-2" size={15} color={COLORS.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => remove(d)} style={styles.iconBtn}>
                <Feather name="trash-2" size={15} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editing ? "Edit Doctor" : "New Doctor"}</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Feather name="x" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 40 }}>
              {f("name", "Name *")}
              {f("speciality", "Speciality")}
              {f("clinic", "Clinic / Hospital")}
              {f("phone", "Phone", { keyboard: "phone-pad" })}
              {f("address", "Address", { multiline: true })}
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
  list: { paddingHorizontal: SPACING.lg, paddingBottom: 40, gap: 8 },
  empty: { textAlign: "center", color: COLORS.textMuted, marginTop: 40 },
  card: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.white, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  doctorName: { fontSize: 15, fontWeight: "700", color: COLORS.text },
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
