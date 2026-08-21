import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { alertMsg } from "@/src/dialog";

type Lang = { code: string; label: string; native: string };

const LANGUAGES: Lang[] = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "te", label: "Telugu", native: "తెలుగు" },
  { code: "bn", label: "Bengali", native: "বাংলা" },
  { code: "mr", label: "Marathi", native: "मराठी" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી" },
];

export default function LanguageScreen() {
  const [selected, setSelected] = useState("en");

  const apply = () => {
    const lang = LANGUAGES.find((l) => l.code === selected)?.label ?? "English";
    alertMsg("Language", `Selected ${lang}. Restart to apply.`);
  };

  return (
    <PageShell
      title="Language"
      footer={
        <TouchableOpacity style={s.primaryBtn} onPress={apply} activeOpacity={0.85}>
          <Feather name="check" size={18} color={COLORS.white} />
          <Text style={s.primaryBtnText}>Apply</Text>
        </TouchableOpacity>
      }
    >
      <Text style={s.sectionLabel}>DISPLAY LANGUAGE</Text>
      {LANGUAGES.map((l) => {
        const active = l.code === selected;
        return (
          <TouchableOpacity
            key={l.code}
            style={[s.row, active && s.rowActive]}
            onPress={() => setSelected(l.code)}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.native}>{l.native}</Text>
              <Text style={s.rowSub}>{l.label}</Text>
            </View>
            {active ? (
              <Feather name="check-circle" size={22} color={COLORS.primary} />
            ) : (
              <View style={s.radioEmpty} />
            )}
          </TouchableOpacity>
        );
      })}
    </PageShell>
  );
}

const s = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: SPACING.sm, marginBottom: SPACING.xs },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },
  rowActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  native: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  radioEmpty: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.border },
  primaryBtn: { minHeight: 52, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
});
