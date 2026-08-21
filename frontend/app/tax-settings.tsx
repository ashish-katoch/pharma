import { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Switch, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";
import { alertMsg } from "@/src/dialog";

type Shop = { gst_rate?: number };

export default function TaxSettings() {
  const [rate, setRate] = useState("18");
  const [inclusive, setInclusive] = useState(false);
  const [showHsn, setShowHsn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const shop = await api<Shop>("/shop");
      if (shop?.gst_rate != null) setRate(String(shop.gst_rate));
    } catch {
      /* ignore — keep defaults */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    setSaving(true);
    try {
      await api("/shop", { method: "PUT", body: { gst_rate: parseFloat(rate) || 0 } });
      alertMsg("Saved", "Tax settings updated.");
    } catch (e: any) {
      alertMsg("Save failed", e?.message || "Could not update tax settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageShell title="Tax Settings">
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Tax Settings"
      footer={
        <TouchableOpacity style={[s.primaryBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving} activeOpacity={0.85}>
          {saving ? <ActivityIndicator color={COLORS.white} /> : (
            <>
              <Feather name="save" size={20} color={COLORS.white} />
              <Text style={s.primaryBtnText}>Save</Text>
            </>
          )}
        </TouchableOpacity>
      }
    >
      <Text style={s.sectionLabel}>DEFAULT GST</Text>
      <View style={s.card}>
        <Text style={s.fieldLabel}>DEFAULT GST RATE (%)</Text>
        <TextInput
          style={s.field}
          value={rate}
          onChangeText={setRate}
          keyboardType="numeric"
          placeholder="18"
          placeholderTextColor={COLORS.textMuted}
        />
      </View>

      <Text style={s.sectionLabel}>PRICING & INVOICE</Text>
      <ToggleRow
        icon="layers"
        title="GST-inclusive pricing"
        subtitle="Prices already include tax"
        value={inclusive}
        onValueChange={setInclusive}
      />
      <ToggleRow
        icon="hash"
        title="Show HSN on invoice"
        subtitle="Print HSN/SAC codes on bills"
        value={showHsn}
        onValueChange={setShowHsn}
      />
    </PageShell>
  );
}

function ToggleRow({
  icon, title, subtitle, value, onValueChange,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={s.toggleRow}>
      <View style={s.iconWrap}>
        <Feather name={icon} size={18} color={COLORS.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.rowSub}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: COLORS.primary, false: COLORS.surfaceDim }}
        thumbColor={COLORS.white}
      />
    </View>
  );
}

const s = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: SPACING.sm, marginBottom: SPACING.xs },
  card: { padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm, marginBottom: SPACING.sm },
  fieldLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.textSecondary, marginBottom: 6 },
  field: { minHeight: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 10, backgroundColor: COLORS.surface, fontSize: 15, color: COLORS.text },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },
  iconWrap: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  primaryBtn: { minHeight: 52, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
});
