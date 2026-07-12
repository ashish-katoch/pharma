import { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

type Shop = {
  name: string;
  address: string;
  phone: string;
  gstin: string;
  dl_no: string;
  gst_rate: number;
};

export default function Settings() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [shop, setShop] = useState<Shop | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api<Shop>("/shop");
      setShop(s);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!shop) return;
    if (user?.role !== "owner") {
      Alert.alert("Owner only", "Only the shop owner can update the profile.");
      return;
    }
    setSaving(true);
    try {
      await api("/shop", { method: "PUT", body: shop });
      Alert.alert("Saved", "Shop profile updated.");
    } catch (e: any) {
      Alert.alert("Save failed", e?.message || "");
    } finally {
      setSaving(false);
    }
  };

  const doLogout = async () => {
    Alert.alert("Sign out?", "You'll need to sign in again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  if (loading || !shop) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  const readOnly = user?.role !== "owner";

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100, gap: SPACING.lg }}>
        <Text style={styles.title}>Settings</Text>

        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Feather name="user" size={26} color={COLORS.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user?.name}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
          </View>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user?.role?.toUpperCase()}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>SHOP PROFILE</Text>
        <View style={styles.card}>
          <FieldRow label="Shop name" value={shop.name} onChange={(v) => setShop({ ...shop, name: v })} readOnly={readOnly} testID="settings-shop-name" />
          <FieldRow label="Address" value={shop.address} onChange={(v) => setShop({ ...shop, address: v })} readOnly={readOnly} multiline testID="settings-shop-address" />
          <FieldRow label="Phone" value={shop.phone} onChange={(v) => setShop({ ...shop, phone: v })} readOnly={readOnly} keyboardType="phone-pad" testID="settings-shop-phone" />
          <FieldRow label="GSTIN" value={shop.gstin} onChange={(v) => setShop({ ...shop, gstin: v })} readOnly={readOnly} testID="settings-gstin" />
          <FieldRow label="Drug Licence No." value={shop.dl_no} onChange={(v) => setShop({ ...shop, dl_no: v })} readOnly={readOnly} testID="settings-dl" />
        </View>

        {!readOnly && (
          <TouchableOpacity
            testID="settings-save-button"
            style={styles.primaryBtn}
            onPress={save}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator color={COLORS.white} /> : (
              <>
                <Feather name="save" size={20} color={COLORS.white} />
                <Text style={styles.primaryBtnText}>Save Profile</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {user?.role === "owner" && (
          <>
            <Text style={styles.sectionLabel}>TEAM</Text>
            <TouchableOpacity
              testID="settings-manage-staff"
              style={styles.linkRow}
              onPress={() => router.push("/staff")}
            >
              <Feather name="users" size={20} color={COLORS.primary} />
              <Text style={styles.linkText}>Manage staff</Text>
              <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </>
        )}

        <Text style={styles.sectionLabel}>OTHER</Text>
        <TouchableOpacity
          testID="settings-history"
          style={styles.linkRow}
          onPress={() => router.push("/history")}
        >
          <Feather name="clock" size={20} color={COLORS.primary} />
          <Text style={styles.linkText}>Bill history</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="settings-logout"
          style={[styles.linkRow, { borderColor: COLORS.dangerBg }]}
          onPress={doLogout}
        >
          <Feather name="log-out" size={20} color={COLORS.danger} />
          <Text style={[styles.linkText, { color: COLORS.danger }]}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function FieldRow({ label, value, onChange, readOnly, multiline, keyboardType, testID }: any) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        style={[styles.field, multiline && { minHeight: 80, textAlignVertical: "top" }]}
        value={value}
        onChangeText={onChange}
        editable={!readOnly}
        multiline={multiline}
        keyboardType={keyboardType}
        placeholderTextColor={COLORS.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  title: { fontSize: 26, fontWeight: "800", color: COLORS.text, letterSpacing: -0.5 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.lg,
    backgroundColor: COLORS.text,
    borderRadius: RADIUS.lg,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: { color: COLORS.white, fontSize: 17, fontWeight: "800" },
  profileEmail: { color: "#CBD5E1", fontSize: 12, marginTop: 2 },
  roleBadge: {
    backgroundColor: "rgba(37,99,235,0.25)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
  },
  roleText: { fontSize: 10, fontWeight: "800", color: "#DBEAFE", letterSpacing: 1 },
  card: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
  },
  fieldLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.textSecondary },
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    fontSize: 15,
    color: COLORS.text,
  },
  primaryBtn: {
    minHeight: 56,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  linkText: { flex: 1, fontSize: 15, fontWeight: "600", color: COLORS.text },
});
