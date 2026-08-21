import { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";
import { alertMsg } from "@/src/dialog";

type Shop = {
  name: string;
  address: string;
  phone: string;
  gstin: string;
  dl_no: string;
  invoice_prefix: string;
};

export default function StoreProfile() {
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setShop(await api<Shop>("/shop"));
    } catch {
      /* ignore — show empty state */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!shop) return;
    setSaving(true);
    try {
      await api("/shop", { method: "PUT", body: shop });
      alertMsg("Saved", "Store profile updated.");
    } catch (e: any) {
      alertMsg("Save failed", e?.message || "Could not update store profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !shop) {
    return (
      <PageShell title="Store Profile">
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Store Profile"
      footer={
        <TouchableOpacity style={[s.primaryBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving} activeOpacity={0.85}>
          {saving ? <ActivityIndicator color={COLORS.white} /> : (
            <>
              <Feather name="save" size={20} color={COLORS.white} />
              <Text style={s.primaryBtnText}>Save Changes</Text>
            </>
          )}
        </TouchableOpacity>
      }
    >
      <Text style={s.sectionLabel}>STORE DETAILS</Text>
      <View style={s.card}>
        <FieldRow label="Store Name" value={shop.name} onChange={(v) => setShop({ ...shop, name: v })} />
        <FieldRow label="Address" value={shop.address} onChange={(v) => setShop({ ...shop, address: v })} multiline />
        <FieldRow label="Phone" value={shop.phone} onChange={(v) => setShop({ ...shop, phone: v })} keyboardType="phone-pad" />
        <FieldRow label="GSTIN" value={shop.gstin} onChange={(v) => setShop({ ...shop, gstin: v })} />
        <FieldRow label="Drug Licence No." value={shop.dl_no} onChange={(v) => setShop({ ...shop, dl_no: v })} />
      </View>

      <Text style={s.sectionLabel}>BILLING</Text>
      <View style={s.card}>
        <FieldRow
          label="Invoice Prefix"
          value={shop.invoice_prefix ?? "INV"}
          onChange={(v) => setShop({ ...shop, invoice_prefix: v.toUpperCase() })}
          hint="Appears before the bill number — e.g. INV-000001"
        />
      </View>
    </PageShell>
  );
}

type FieldRowProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  keyboardType?: import("react-native").KeyboardTypeOptions;
  hint?: string;
};

function FieldRow({ label, value, onChange, multiline, keyboardType, hint }: FieldRowProps) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.field, multiline && { minHeight: 80, textAlignVertical: "top" }]}
        value={value ?? ""}
        onChangeText={onChange}
        multiline={multiline}
        keyboardType={keyboardType}
        placeholderTextColor={COLORS.textMuted}
      />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: SPACING.sm, marginBottom: SPACING.xs },
  card: { padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.md },
  fieldLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.textSecondary },
  field: { minHeight: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 10, backgroundColor: COLORS.surface, fontSize: 15, color: COLORS.text },
  primaryBtn: { minHeight: 52, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
  hint: { fontSize: 11, color: COLORS.textMuted, fontWeight: "500" },
});
