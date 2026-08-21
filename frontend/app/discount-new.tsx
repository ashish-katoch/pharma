import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { alertMsg } from "@/src/dialog";

type DiscountType = "percent" | "flat";

export default function DiscountNew() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<DiscountType>("percent");
  const [value, setValue] = useState("");
  const [minBill, setMinBill] = useState("");

  const create = () => {
    if (!name.trim()) { alertMsg("Required", "Give the discount rule a name."); return; }
    if (!value.trim() || Number(value) <= 0) { alertMsg("Required", "Enter a discount value greater than zero."); return; }
    alertMsg("Created", "Discount rule saved.");
    router.back();
  };

  return (
    <PageShell
      title="New Discount"
      footer={
        <TouchableOpacity style={s.primaryBtn} onPress={create} activeOpacity={0.85}>
          <Feather name="check" size={20} color={COLORS.white} />
          <Text style={s.primaryBtnText}>Create Discount</Text>
        </TouchableOpacity>
      }
    >
      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>RULE NAME</Text>
        <TextInput
          style={s.field}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Senior Citizen"
          placeholderTextColor={COLORS.textMuted}
        />
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>DISCOUNT TYPE</Text>
        <View style={s.pillRow}>
          <TouchableOpacity
            style={[s.pill, type === "percent" && s.pillActive]}
            onPress={() => setType("percent")}
            activeOpacity={0.8}
          >
            <Feather name="percent" size={15} color={type === "percent" ? COLORS.white : COLORS.textSecondary} />
            <Text style={[s.pillText, type === "percent" && s.pillTextActive]}>Percent</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.pill, type === "flat" && s.pillActive]}
            onPress={() => setType("flat")}
            activeOpacity={0.8}
          >
            <Feather name="tag" size={15} color={type === "flat" ? COLORS.white : COLORS.textSecondary} />
            <Text style={[s.pillText, type === "flat" && s.pillTextActive]}>Flat</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>{type === "percent" ? "VALUE (%)" : "VALUE (₹)"}</Text>
        <TextInput
          style={s.field}
          value={value}
          onChangeText={setValue}
          keyboardType="numeric"
          placeholder={type === "percent" ? "10" : "100"}
          placeholderTextColor={COLORS.textMuted}
        />
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>MINIMUM BILL (₹)</Text>
        <TextInput
          style={s.field}
          value={minBill}
          onChangeText={setMinBill}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={COLORS.textMuted}
        />
      </View>
    </PageShell>
  );
}

const s = StyleSheet.create({
  fieldGroup: { marginBottom: SPACING.lg },
  fieldLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.textSecondary, marginBottom: 6 },
  field: { minHeight: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 10, backgroundColor: COLORS.surface, fontSize: 15, color: COLORS.text },
  pillRow: { flexDirection: "row", gap: SPACING.sm },
  pill: {
    flex: 1, minHeight: 48, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { fontSize: 15, fontWeight: "700", color: COLORS.textSecondary },
  pillTextActive: { color: COLORS.white },
  primaryBtn: { minHeight: 52, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
});
