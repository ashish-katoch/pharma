import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { alertMsg } from "@/src/dialog";

type Faq = { id: string; q: string; a: string };

const FAQS: Faq[] = [
  {
    id: "bill",
    q: "How do I create a bill?",
    a: "Open the Billing tab, scan or search a medicine to add it to the cart, then tap Checkout and choose a payment method.",
  },
  {
    id: "stock",
    q: "How do I add new stock?",
    a: "Go to Inventory, tap the + button, and enter the medicine, batch, expiry and quantity. You can also import a supplier CSV.",
  },
  {
    id: "gst",
    q: "How are GST reports generated?",
    a: "Reports are built automatically from your bills. Open Reports and export the GSTR summary for any month as a PDF or CSV.",
  },
  {
    id: "backup",
    q: "Is my data backed up?",
    a: "Yes. Data syncs to the cloud when you are online, and you can run a manual backup any time from Backup & Security.",
  },
];

type Contact = {
  id: string;
  label: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
};

const CONTACTS: Contact[] = [
  { id: "email", label: "Email support", value: "support@pharmacounter.app", icon: "mail" },
  { id: "whatsapp", label: "WhatsApp", value: "+91 98765 43210", icon: "message-circle" },
  { id: "call", label: "Call us", value: "1800-123-4567 (9am–7pm)", icon: "phone" },
];

export default function HelpSupport() {
  const [openId, setOpenId] = useState<string | null>(null);

  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));

  return (
    <PageShell title="Help & Support">
      <Text style={s.sectionLabel}>FREQUENTLY ASKED</Text>
      {FAQS.map((f) => {
        const open = openId === f.id;
        return (
          <TouchableOpacity
            key={f.id}
            style={s.card}
            onPress={() => toggle(f.id)}
            activeOpacity={0.7}
          >
            <View style={s.faqHead}>
              <Text style={s.question}>{f.q}</Text>
              <Feather
                name={open ? "chevron-up" : "chevron-down"}
                size={18}
                color={COLORS.textMuted}
              />
            </View>
            {open && <Text style={s.answer}>{f.a}</Text>}
          </TouchableOpacity>
        );
      })}

      <Text style={s.sectionLabel}>CONTACT US</Text>
      {CONTACTS.map((c) => (
        <TouchableOpacity
          key={c.id}
          style={s.row}
          onPress={() => alertMsg(c.label, c.value)}
          activeOpacity={0.7}
        >
          <View style={s.iconWrap}>
            <Feather name={c.icon} size={18} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>{c.label}</Text>
            <Text style={s.rowSub}>{c.value}</Text>
          </View>
          <Feather name="chevron-right" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
      ))}

      <View style={s.versionRow}>
        <Feather name="info" size={14} color={COLORS.textMuted} />
        <Text style={s.versionText}>Pharma Counter · v1.0.14</Text>
      </View>
    </PageShell>
  );
}

const s = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: SPACING.sm, marginBottom: SPACING.xs },
  card: { padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },
  faqHead: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  question: { flex: 1, fontSize: 15, fontWeight: "700", color: COLORS.text },
  answer: { fontSize: 13, color: COLORS.textMuted, lineHeight: 20, marginTop: SPACING.sm },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },
  iconWrap: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  versionRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: SPACING.md },
  versionText: { fontSize: 12, color: COLORS.textMuted, fontWeight: "600" },
});
