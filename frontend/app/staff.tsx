import { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useIsOwner } from "@/src/auth";
import { confirmDestructive } from "@/src/confirm";
import { alertMsg } from "@/src/dialog";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

type StaffUser = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "staff";
  created_at: string;
};

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
      const list = await api<StaffUser[]>("/auth/staff");
      setUsers(list);
    } catch (e: any) {
      alertMsg("Access denied", e?.message || "Only owners can view staff.");
      router.back();
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addStaff = async () => {
    if (!form.email.trim() || !form.password.trim() || !form.name.trim()) {
      alertMsg("Missing", "Enter name, email and password");
      return;
    }
    setSaving(true);
    try {
      await api("/auth/staff", { method: "POST", body: form });
      setForm({ email: "", name: "", password: "" });
      setShowAdd(false);
      await load();
    } catch (e: any) {
      alertMsg("Failed", e?.message || "");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (u: StaffUser) => {
    setEditing(u);
    setEditForm({ name: u.name, password: "" });
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editForm.name.trim() && !editForm.password.trim()) {
      alertMsg("Nothing to save", "Enter a new name or password");
      return;
    }
    if (editForm.password && editForm.password.length < 8) {
      alertMsg("Password too short", "Minimum 8 characters");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (editForm.name.trim()) body.name = editForm.name.trim();
      if (editForm.password) body.password = editForm.password;
      await api(`/auth/staff/${editing.id}`, { method: "PUT", body });
      setEditing(null);
      await load();
    } catch (e: any) {
      alertMsg("Failed", e?.message || "");
    } finally { setSaving(false); }
  };

  const removeStaff = (u: StaffUser) => {
    if (u.role === "owner") return;
    confirmDestructive("Remove staff?", `Delete ${u.email}?`, "Delete", async () => {
      try {
        await api(`/auth/staff/${u.id}`, { method: "DELETE" });
        await load();
      } catch (e: any) {
        alertMsg("Failed", e?.message || "");
      }
    });
  };

  if (!isOwner) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="staff-back">
            <Feather name="arrow-left" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Team</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 }}>
          <Feather name="lock" size={40} color={COLORS.textMuted} />
          <Text style={{ fontSize: 16, fontWeight: "800" }}>Owner Only</Text>
          <Text style={{ fontSize: 14, color: COLORS.textMuted, textAlign: "center" }}>
            Staff management requires owner access.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="staff-back">
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Team</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)} testID="staff-add">
          <Feather name="user-plus" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: 8 }}>
          <TouchableOpacity
            style={styles.settingsLink}
            onPress={() => router.push("/staff-report" as any)}
          >
            <Feather name="bar-chart-2" size={18} color={COLORS.primary} />
            <Text style={styles.settingsLinkText}>Staff Sales Report</Text>
            <Feather name="chevron-right" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingsLink}
            onPress={() => router.push("/shifts" as any)}
          >
            <Feather name="clock" size={18} color={COLORS.primary} />
            <Text style={styles.settingsLinkText}>Shift Tracking</Text>
            <Feather name="chevron-right" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingsLink}
            onPress={() => router.push("/printer-settings")}
          >
            <Feather name="printer" size={18} color={COLORS.primary} />
            <Text style={styles.settingsLinkText}>Printer Settings</Text>
            <Feather name="chevron-right" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
          {users.map((u) => (
            <View key={u.id} style={styles.card}>
              <View style={styles.avatar}>
                <Feather name="user" size={20} color={COLORS.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{u.name}</Text>
                <Text style={styles.email}>{u.email}</Text>
              </View>
              <View style={[styles.roleBadge, u.role === "owner" && { backgroundColor: COLORS.warningBg }]}>
                <Text style={[styles.roleText, u.role === "owner" && { color: COLORS.warning }]}>{u.role.toUpperCase()}</Text>
              </View>
              {u.role !== "owner" && (
                <>
                  <TouchableOpacity
                    testID={`staff-edit-${u.id}`}
                    onPress={() => openEdit(u)}
                    style={styles.editBtn}
                  >
                    <Feather name="edit-2" size={15} color={COLORS.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID={`staff-delete-${u.id}`}
                    onPress={() => removeStaff(u)}
                    style={styles.trashBtn}
                  >
                    <Feather name="trash-2" size={16} color={COLORS.danger} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add staff</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Feather name="x" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: SPACING.lg, gap: SPACING.md }}>
              <View style={{ gap: 6 }}>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput
                  testID="staff-form-name"
                  style={styles.field}
                  value={form.name}
                  onChangeText={(v) => setForm({ ...form, name: v })}
                  placeholder="Full name"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput
                  testID="staff-form-email"
                  style={styles.field}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={form.email}
                  onChangeText={(v) => setForm({ ...form, email: v })}
                  placeholder="staff@pharma.com"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={styles.fieldLabel}>Password</Text>
                <TextInput
                  testID="staff-form-password"
                  style={styles.field}
                  secureTextEntry
                  value={form.password}
                  onChangeText={(v) => setForm({ ...form, password: v })}
                  placeholder="Temporary password"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
              <TouchableOpacity
                testID="staff-form-save"
                style={styles.primaryBtn}
                onPress={addStaff}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color={COLORS.white} /> : (
                  <Text style={styles.primaryBtnText}>Add Staff</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      {/* Edit staff modal */}
      <Modal visible={!!editing} animationType="slide" transparent onRequestClose={() => setEditing(null)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit {editing?.name}</Text>
              <TouchableOpacity onPress={() => setEditing(null)}>
                <Feather name="x" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: SPACING.lg, gap: SPACING.md }}>
              <View style={{ gap: 6 }}>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput
                  style={styles.field}
                  value={editForm.name}
                  onChangeText={(v) => setEditForm({ ...editForm, name: v })}
                  placeholder="Full name"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={styles.fieldLabel}>New Password (leave blank to keep current)</Text>
                <TextInput
                  style={styles.field}
                  secureTextEntry
                  value={editForm.password}
                  onChangeText={(v) => setEditForm({ ...editForm, password: v })}
                  placeholder="Min 8 characters"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
              <TouchableOpacity
                style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
                onPress={saveEdit}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color={COLORS.white} /> : (
                  <Text style={styles.primaryBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  headerTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avatar: {
    width: 40, height: 40, borderRadius: RADIUS.pill, backgroundColor: COLORS.primary,
    alignItems: "center", justifyContent: "center",
  },
  name: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  email: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  roleBadge: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.pill, backgroundColor: COLORS.primaryLight,
  },
  roleText: { fontSize: 9, fontWeight: "800", color: COLORS.primary, letterSpacing: 1 },
  editBtn: {
    width: 34, height: 34, borderRadius: RADIUS.pill, backgroundColor: COLORS.primaryLight,
    alignItems: "center", justifyContent: "center",
  },
  trashBtn: {
    width: 34, height: 34, borderRadius: RADIUS.pill, backgroundColor: COLORS.dangerBg,
    alignItems: "center", justifyContent: "center",
  },
  settingsLink: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    backgroundColor: COLORS.white, borderRadius: RADIUS.md, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm,
  },
  settingsLinkText: { flex: 1, fontSize: 14, fontWeight: "700", color: COLORS.primary },
  modalOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.55)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text },
  fieldLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.textSecondary },
  field: {
    minHeight: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, backgroundColor: COLORS.surface, fontSize: 15, color: COLORS.text,
  },
  primaryBtn: {
    minHeight: 56, backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
    alignItems: "center", justifyContent: "center", marginTop: SPACING.md,
  },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
});
