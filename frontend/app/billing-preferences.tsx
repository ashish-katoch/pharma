import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Switch } from "react-native";
import { Feather } from "@expo/vector-icons";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { alertMsg } from "@/src/dialog";

export default function BillingPreferences() {
  const [roundOff, setRoundOff] = useState(true);
  const [autoPrint, setAutoPrint] = useState(false);
  const [showCustomer, setShowCustomer] = useState(true);
  const [askPaymentMode, setAskPaymentMode] = useState(true);
  const [prefix, setPrefix] = useState("INV");

  const save = () => alertMsg("Saved", "Billing preferences updated.");

  return (
    <PageShell
      title="Billing Preferences"
      footer={
        <TouchableOpacity style={s.primaryBtn} onPress={save} activeOpacity={0.85}>
          <Feather name="save" size={20} color={COLORS.white} />
          <Text style={s.primaryBtnText}>Save</Text>
        </TouchableOpacity>
      }
    >
      <Text style={s.sectionLabel}>INVOICE</Text>
      <View style={s.card}>
        <Text style={s.fieldLabel}>INVOICE PREFIX</Text>
        <TextInput
          style={s.field}
          value={prefix}
          onChangeText={setPrefix}
          autoCapitalize="characters"
          placeholder="e.g. INV, RX, GST"
          placeholderTextColor={COLORS.textMuted}
        />
      </View>

      <Text style={s.sectionLabel}>BILLING BEHAVIOUR</Text>
      <ToggleRow
        icon="hash"
        title="Round-off totals"
        subtitle="Round bill total to nearest rupee"
        value={roundOff}
        onValueChange={setRoundOff}
      />
      <ToggleRow
        icon="printer"
        title="Auto-print after bill"
        subtitle="Send to printer once a bill is saved"
        value={autoPrint}
        onValueChange={setAutoPrint}
      />
      <ToggleRow
        icon="user"
        title="Show customer on invoice"
        subtitle="Print customer name & phone"
        value={showCustomer}
        onValueChange={setShowCustomer}
      />
      <ToggleRow
        icon="credit-card"
        title="Ask payment mode"
        subtitle="Prompt cash / UPI / card at checkout"
        value={askPaymentMode}
        onValueChange={setAskPaymentMode}
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
