import { useCallback, useState } from "react";
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform, Modal,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useIsOwner } from "@/src/auth";
import { confirmDestructive } from "@/src/confirm";
import { alertMsg } from "@/src/dialog";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { PageShell } from "@/src/components/PageShell";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { Badge } from "@/src/components/ui/Badge";

type StaffUser = { id: string; email: string; name: string; role: "owner" | "staff"; created_at: string };

export default function StaffScreen() {
  const router = useRouter();
  const isOwner = useIsOwner();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "" });
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [editForm, setEditForm] = useState({ name: "", password: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await api<StaffUser[]>("/auth/staff"));
    } catch (e: any) {
      alertMsg("Access denied", e?.message || "Only owners can view staff.");
      router.back();
    } finally { setLoading(false); }
  }, [router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addStaff = async () => {
    if (!form.email.trim() || !form.password.trim() || !form.name.trim()) { alertMsg("Missing", "Enter name, email and password"); return; }
    setSaving(true);
    try {
      await api("/auth/staff", { method: "POST", body: form });
      setForm({ email: "", name: "", password: "" });
      setShowAdd(false);
      await load();
    } catch (e: any) { alertMsg("Failed", e?.message || ""); }
    finally { setSaving(false); }
  };

  const openEdit = (u: StaffUser) => { setEditing(u); setEditForm({ name: u.name, password: "" }); };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editForm.name.trim() && !editForm.password.trim()) { alertMsg("Nothing to save", "Enter a new name or password"); return; }
    if (editForm.password && editForm.password.length < 8) { alertMsg("Password too short", "Minimum 8 characters"); return; }
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (editForm.name.trim()) body.name = editForm.name.trim();
      if (editForm.password) body.password = editForm.password;
      await api(`/auth/staff/${editing.id}`, { method: "PUT", body });
      setEditing(null);
      await load();
    } catch (e: any) { alertMsg("Failed", e?.message || ""); }
    finally { setSaving(false); }
  };

  const removeStaff = (u: StaffUser) => {
    if (u.role === "owner") return;
    confirmDestructive("Remove staff?", `Delete ${u.email}?`, "Delete", async () => {
      try { await api(`/auth/staff/${u.id}`, { method: "DELETE" }); await load(); }
      catch (e: any) { alertMsg("Failed", e?.message || ""); }
    });
  };

  if (!isOwner) {
    return (
      <PageShell title="Team" showBack scrollable={false}>
        <EmptyState icon="lock" title="Owner Only" subtitle="Staff management requires owner access." />
      </PageShell>
    );
  }

  const AddBtn = (
    <TouchableOpacity onPress={() => setShowAdd(true)} style={s.addBtn} testID="staff-add">
      <Feather name="user-plus" size={16} color={COLORS.white} />
    </TouchableOpacity>
  );

  return (
    <PageShell title="Team" rightAction={AddBtn} showBack scrollable={false} noPadding>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {/* Quick nav links */}
          <NavLink icon="bar-chart-2" label="Staff Sales Report" onPress={() => router.push("/staff-report" as any)} />
          <NavLink icon="clock" label="Shift Tracking" onPress={() => router.push("/shifts" as any)} />
          <NavLink icon="printer" label="Printer Settings" onPress={() => router.push("/printer-settings")} />

          {users.length === 0 ? (
            <EmptyState icon="users" title="No staff yet" subtitle="Add team members to get started." />
          ) : (
            users.map((u) => (
              <View key={u.id} style={s.card}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>{(u.name?.[0] ?? "U").toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{u.name}</Text>
                  <Text style={s.email}>{u.email}</Text>
                </View>
                <Badge label={u.role.toUpperCase()} tone={u.role === "owner" ? "warning" : "info"} />
                {u.role !== "owner" && (
                  <>
                    <TouchableOpacity testID={`staff-edit-${u.id}`} onPress={() => openEdit(u)} style={s.iconBtn}>
                      <Feather name="edit-2" size={15} color={COLORS.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity testID={`staff-delete-${u.id}`} onPress={() => removeStaff(u)} style={s.iconBtn}>
                      <Feather name="trash-2" size={16} color={COLORS.danger} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Add staff modal */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <View style={s.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Add Staff</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)} style={s.closeBtn}><Feather name="x" size={20} color={COLORS.textSecondary} /></TouchableOpacity>
            </View>
            <View style={s.sheetBody}>
              <FieldRow label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Full name" testID="staff-form-name" />
              <FieldRow label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="staff@pharma.com" keyboard="email-address" autoCapitalize="none" testID="staff-form-email" />
              <FieldRow label="Password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} placeholder="Temporary password" secure testID="staff-form-password" />
              <TouchableOpacity testID="staff-form-save" style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={addStaff} disabled={saving}>
                {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.saveBtnText}>Add Staff Member</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Edit staff modal */}
      <Modal visible={!!editing} animationType="slide" transparent onRequestClose={() => setEditing(null)}>
        <View style={s.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Edit {editing?.name}</Text>
              <TouchableOpacity onPress={() => setEditing(null)} style={s.closeBtn}><Feather name="x" size={20} color={COLORS.textSecondary} /></TouchableOpacity>
            </View>
            <View style={s.sheetBody}>
              <FieldRow label="Name" value={editForm.name} onChange={(v) => setEditForm({ ...editForm, name: v })} placeholder="Full name" />
              <FieldRow label="New Password" value={editForm.password} onChange={(v) => setEditForm({ ...editForm, password: v })} placeholder="Leave blank to keep current" secure />
              <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={saveEdit} disabled={saving}>
                {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.saveBtnText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </PageShell>
  );
}

function NavLink({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.navLink} onPress={onPress} activeOpacity={0.85}>
      <View style={s.navIcon}><Feather name={icon} size={16} color={COLORS.primary} /></View>
      <Text style={s.navLinkText}>{label}</Text>
      <Feather name="chevron-right" size={16} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

function FieldRow({ label, value, onChange, placeholder, keyboard, autoCapitalize, secure, testID }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; keyboard?: any; autoCapitalize?: any; secure?: boolean; testID?: string;
}) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput testID={testID} style={s.fieldInput} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={COLORS.textMuted} keyboardType={keyboard ?? "default"} autoCapitalize={autoCapitalize ?? "words"} secureTextEntry={!!secure} />
    </View>
  );
}

const s = StyleSheet.create({
  addBtn: { width: 36, height: 36, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  list: { padding: SPACING.lg, gap: 8, paddingBottom: 60 },
  navLink: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: COLORS.white, borderRadius: RADIUS.md, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  navIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  navLinkText: { flex: 1, fontSize: 14, fontWeight: "700", color: COLORS.text },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 15, fontWeight: "800", color: COLORS.white },
  name: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  email: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  iconBtn: { padding: 6 },
  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: SPACING.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: COLORS.text },
  closeBtn: { width: 32, height: 32, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceContainerLow, alignItems: "center", justifyContent: "center" },
  sheetBody: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 32 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, color: COLORS.textSecondary, textTransform: "uppercase" },
  fieldInput: { minHeight: 46, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, backgroundColor: COLORS.surface, fontSize: 15, color: COLORS.text },
  saveBtn: { minHeight: 52, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", marginTop: SPACING.sm },
  saveBtnText: { color: COLORS.white, fontSize: 15, fontWeight: "800" },
});
