import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";
import { alertMsg } from "@/src/dialog";

export default function OnboardingStore() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [gstin, setGstin] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!name.trim() || !phone.trim()) {
      alertMsg("Missing details", "Store name and phone are required.");
      return;
    }
    setBusy(true);
    try {
      await api("/shop", {
        method: "PUT",
        body: {
          name: name.trim(),
          owner_name: owner.trim(),
          phone: phone.trim(),
          address: address.trim(),
          gstin: gstin.trim(),
        },
      });
      router.replace("/(tabs)/home");
    } catch (e: any) {
      alertMsg("Could not create store", e?.message || "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[s.root, isDesktop && s.rootDesktop]} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={[s.scroll, isDesktop && s.scrollDesktop]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={isDesktop ? s.desktopCol : { width: "100%" }}>
          <View style={s.iconWrap}>
            <Feather name="home" size={28} color={COLORS.primary} />
          </View>
          <Text style={s.title}>Set Up Your Store</Text>
          <Text style={s.subtitle}>
            Tell us about your pharmacy so we can tailor billing and reports for you.
          </Text>

          <View style={s.form}>
            <Field label="STORE NAME" required>
              <TextInput
                style={s.field}
                value={name}
                onChangeText={setName}
                placeholder="City Care Pharmacy"
                placeholderTextColor={COLORS.textMuted}
              />
            </Field>

            <Field label="OWNER NAME">
              <TextInput
                style={s.field}
                value={owner}
                onChangeText={setOwner}
                placeholder="Full name"
                placeholderTextColor={COLORS.textMuted}
              />
            </Field>

            <Field label="PHONE" required>
              <TextInput
                style={s.field}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="+91 98765 43210"
                placeholderTextColor={COLORS.textMuted}
              />
            </Field>

            <Field label="ADDRESS">
              <TextInput
                style={[s.field, s.multiline]}
                value={address}
                onChangeText={setAddress}
                placeholder="Shop no, street, city, pincode"
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </Field>

            <Field label="GSTIN (OPTIONAL)">
              <TextInput
                style={s.field}
                value={gstin}
                onChangeText={setGstin}
                autoCapitalize="characters"
                placeholder="22AAAAA0000A1Z5"
                placeholderTextColor={COLORS.textMuted}
              />
            </Field>

            <TouchableOpacity
              style={[s.primaryBtn, busy && { opacity: 0.6 }]}
              activeOpacity={0.85}
              onPress={onSubmit}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Feather name="check" size={18} color={COLORS.white} />
                  <Text style={s.primaryBtnText}>Create Store</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text style={s.fieldLabel}>
        {label}
        {required ? <Text style={{ color: COLORS.danger }}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  rootDesktop: { backgroundColor: "#F0F2F8" },
  scroll: { flexGrow: 1, padding: SPACING.lg, paddingBottom: SPACING.xxl },
  scrollDesktop: { alignItems: "center" },
  desktopCol: { width: "100%", maxWidth: 520, alignSelf: "center" },

  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.lg,
  },
  title: { fontSize: 26, fontWeight: "800", color: COLORS.text, letterSpacing: -0.4 },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    lineHeight: 20,
    marginBottom: SPACING.xl,
  },

  form: { gap: SPACING.md },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
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
  multiline: { minHeight: 88, paddingTop: 12 },
  primaryBtn: {
    minHeight: 52,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
});
