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
import { confirmDestructive } from "@/src/confirm";
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
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api<StaffUser[]>("/auth/staff");
      setUsers(list);
    } catch (e: any) {
      Alert.alert("Access denied", e?.message || "Only owners can view staff.");
      router.back();
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addStaff = async () => {
    if (!form.email.trim() || !form.password.trim() || !form.name.trim()) {
      Alert.alert("Missing", "Enter name, email and password");
      return;
    }
    setSaving(true);
    try {
      await api("/auth/staff", { method: "POST", body: form });
      setForm({ email: "", name: "", password: "" });
      setShowAdd(false);
      await load();
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "");
    } finally {
      setSaving(false);
    }
  };

  const removeStaff = (u: StaffUser) => {
    if (u.role === "owner") return;
    confirmDestructive("Remove staff?", `Delete ${u.email}?`, "Delete", async () => {
      try {
        await api(`/auth/staff/${u.id}`, { method: "DELETE" });
        await load();
      } catch (e: any) {
        Alert.alert("Failed", e?.message || "");
      }
    });
  };

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
                <TouchableOpacity
                  testID={`staff-delete-${u.id}`}
                  onPress={() => removeStaff(u)}
                  style={styles.trashBtn}
                >
                  <Feather name="trash-2" size={16} color={COLORS.danger} />
                </TouchableOpacity>
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
  trashBtn: {
    width: 34, height: 34, borderRadius: RADIUS.pill, backgroundColor: COLORS.dangerBg,
    alignItems: "center", justifyContent: "center",
  },
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
