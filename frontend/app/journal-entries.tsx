import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, ScrollView, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { DatePicker } from "@/src/components/DatePicker";
import { COLORS, SPACING, RADIUS } from "@/src/theme";
import { PageShell } from "@/src/components/PageShell";
import { EmptyState } from "@/src/components/ui/EmptyState";

const rupee = (n: number) => `₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type JournalLine = { account: string; debit: number; credit: number };
type JournalEntry = {
  id: string;
  date: string;
  description: string;
  ref_no?: string;
  lines: JournalLine[];
  total_debit: number;
  created_at: string;
  created_by: string;
};

const COMMON_ACCOUNTS = [
  "Cash", "Bank", "Sales Revenue", "Purchase Expense",
  "GST Payable", "Accounts Receivable", "Accounts Payable",
  "Capital", "Salary Expense", "Rent Expense", "Utilities",
  "Discount Allowed", "Interest Income", "Depreciation",
];

function EmptyLine(): JournalLine {
  return { account: "", debit: 0, credit: 0 };
}

export default function JournalEntriesScreen() {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // form state
  const [fDate, setFDate] = useState(today);
  const [fDesc, setFDesc] = useState("");
  const [fRef, setFRef] = useState("");
  const [fLines, setFLines] = useState<JournalLine[]>([EmptyLine(), EmptyLine()]);
  const [saving, setSaving] = useState(false);
  const [showAcctPicker, setShowAcctPicker] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<JournalEntry[]>("/journal-entries?limit=200");
      setEntries(data);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalDebit = fLines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = fLines.reduce((s, l) => s + (l.credit || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const updateLine = (i: number, field: keyof JournalLine, val: string | number) => {
    setFLines((ls) => ls.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  };

  const addLine = () => setFLines((ls) => [...ls, EmptyLine()]);
  const removeLine = (i: number) => {
    if (fLines.length <= 2) return;
    setFLines((ls) => ls.filter((_, idx) => idx !== i));
  };

  const resetForm = () => {
    setFDate(today);
    setFDesc("");
    setFRef("");
    setFLines([EmptyLine(), EmptyLine()]);
  };

  const save = async () => {
    if (!fDesc.trim()) { Alert.alert("Enter a description"); return; }
    if (!balanced) { Alert.alert("Entry must balance", `Debits ≠ Credits (Δ ${rupee(Math.abs(totalDebit - totalCredit))})`); return; }
    const validLines = fLines.filter((l) => l.account.trim() && (l.debit > 0 || l.credit > 0));
    if (validLines.length < 2) { Alert.alert("Need at least 2 lines"); return; }
    setSaving(true);
    try {
      await api("/journal-entries", {
        method: "POST",
        body: JSON.stringify({ date: fDate, description: fDesc, ref_no: fRef, lines: validLines }),
      });
      setShowForm(false);
      resetForm();
      await load();
    } catch (e: unknown) {
      Alert.alert("Error", (e as Error).message || "Failed to save");
    } finally { setSaving(false); }
  };

  const deleteEntry = (id: string) => {
    Alert.alert("Delete Entry?", "This cannot be undone.", [
      { text: "Cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await api(`/journal-entries/${id}`, { method: "DELETE" });
            await load();
          } catch { /* ignore */ }
        },
      },
    ]);
  };

  const renderEntry = ({ item }: { item: JournalEntry }) => (
    <TouchableOpacity
      style={styles.card}
      onLongPress={() => deleteEntry(item.id)}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text>
          <Text style={styles.cardMeta}>{item.date}{item.ref_no ? ` · Ref: ${item.ref_no}` : ""}</Text>
        </View>
        <Text style={styles.cardAmount}>{rupee(item.total_debit)}</Text>
      </View>
      <View style={styles.linesWrap}>
        {item.lines.map((l, i) => (
          <View key={i} style={styles.lineRow}>
            <Text style={styles.lineAcct} numberOfLines={1}>{l.account}</Text>
            <Text style={[styles.lineAmt, l.debit > 0 ? styles.debit : styles.credit]}>
              {l.debit > 0 ? `Dr ${rupee(l.debit)}` : `Cr ${rupee(l.credit)}`}
            </Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );

  const NewBtn = (
    <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)}>
      <Feather name="plus" size={14} color={COLORS.white} />
      <Text style={styles.addBtnText}>New</Text>
    </TouchableOpacity>
  );

  return (
    <PageShell title="Journal Entries" showBack scrollable={false} noPadding rightAction={NewBtn}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          renderItem={renderEntry}
          contentContainerStyle={{ padding: SPACING.md, paddingBottom: 40, gap: SPACING.sm }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="book" size={40} color={COLORS.border} />
              <Text style={styles.emptyText}>No journal entries yet.</Text>
              <Text style={styles.emptyHint}>Tap + New to record a double-entry transaction.</Text>
            </View>
          }
        />
      )}

      {/* New Entry Modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowForm(false)}>
              <Feather name="x" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Journal Entry</Text>
            <TouchableOpacity style={[styles.saveBtn, !balanced && styles.saveBtnDisabled]} onPress={save} disabled={saving || !balanced}>
              {saving ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text style={styles.saveBtnText}>Save</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalScroll}>
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <DatePicker label="DATE" value={fDate} onChange={setFDate} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>REF NO (optional)</Text>
                <TextInput style={styles.input} value={fRef} onChangeText={setFRef} placeholder="e.g. INV-001" placeholderTextColor={COLORS.textMuted} />
              </View>
            </View>

            <Text style={styles.fieldLabel}>DESCRIPTION *</Text>
            <TextInput
              style={styles.input}
              value={fDesc}
              onChangeText={setFDesc}
              placeholder="e.g. Cash sales for the day"
              placeholderTextColor={COLORS.textMuted}
            />

            {/* Lines table */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCol, { flex: 2 }]}>ACCOUNT</Text>
              <Text style={[styles.tableCol, { flex: 1, textAlign: "right" }]}>DEBIT</Text>
              <Text style={[styles.tableCol, { flex: 1, textAlign: "right" }]}>CREDIT</Text>
              <View style={{ width: 28 }} />
            </View>

            {fLines.map((line, i) => (
              <View key={i} style={styles.lineEntry}>
                <TouchableOpacity
                  style={[styles.accountField, { flex: 2 }]}
                  onPress={() => setShowAcctPicker(i)}
                >
                  <Text style={line.account ? styles.accountText : styles.accountPlaceholder} numberOfLines={1}>
                    {line.account || "Select account…"}
                  </Text>
                  <Feather name="chevron-down" size={12} color={COLORS.textMuted} />
                </TouchableOpacity>
                <TextInput
                  style={[styles.amtInput, { flex: 1 }]}
                  value={line.debit > 0 ? String(line.debit) : ""}
                  onChangeText={(v) => updateLine(i, "debit", parseFloat(v) || 0)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={COLORS.textMuted}
                />
                <TextInput
                  style={[styles.amtInput, { flex: 1 }]}
                  value={line.credit > 0 ? String(line.credit) : ""}
                  onChangeText={(v) => updateLine(i, "credit", parseFloat(v) || 0)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={COLORS.textMuted}
                />
                <TouchableOpacity onPress={() => removeLine(i)} style={{ width: 28, alignItems: "center" }}>
                  <Feather name="trash-2" size={14} color={fLines.length > 2 ? COLORS.danger : COLORS.border} />
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={styles.addLineBtn} onPress={addLine}>
              <Feather name="plus" size={14} color={COLORS.primary} />
              <Text style={styles.addLineBtnText}>Add line</Text>
            </TouchableOpacity>

            {/* Totals */}
            <View style={[styles.totalsRow, !balanced && styles.totalsRowError]}>
              <Text style={styles.totalsLabel}>TOTAL</Text>
              <Text style={[styles.totalsAmt, { color: "#16A34A" }]}>Dr {rupee(totalDebit)}</Text>
              <Text style={[styles.totalsAmt, { color: "#2563EB" }]}>Cr {rupee(totalCredit)}</Text>
              <View style={{ width: 28 }} />
            </View>
            {!balanced && (
              <Text style={styles.balanceWarn}>
                ⚠ Off by {rupee(Math.abs(totalDebit - totalCredit))} — debits must equal credits
              </Text>
            )}
          </ScrollView>

          {/* Account picker */}
          <Modal visible={showAcctPicker !== null} transparent animationType="slide">
            <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowAcctPicker(null)}>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>Select Account</Text>
                <ScrollView>
                  {COMMON_ACCOUNTS.map((acct) => (
                    <TouchableOpacity
                      key={acct}
                      style={styles.pickerRow}
                      onPress={() => {
                        if (showAcctPicker !== null) updateLine(showAcctPicker, "account", acct);
                        setShowAcctPicker(null);
                      }}
                    >
                      <Text style={styles.pickerRowText}>{acct}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </TouchableOpacity>
          </Modal>
        </SafeAreaView>
      </Modal>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: COLORS.text },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 8,
  },
  addBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 13 },
  card: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm, marginBottom: SPACING.sm },
  cardDesc: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  cardMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  cardAmount: { fontSize: 14, fontWeight: "900", color: COLORS.text },
  linesWrap: { gap: 3, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.sm },
  lineRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lineAcct: { flex: 1, fontSize: 12, color: COLORS.textSecondary },
  lineAmt: { fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
  debit: { color: "#16A34A" },
  credit: { color: "#2563EB" },
  empty: { alignItems: "center", paddingTop: 60, gap: SPACING.sm },
  emptyText: { fontSize: 16, fontWeight: "700", color: COLORS.textSecondary },
  emptyHint: { fontSize: 13, color: COLORS.textMuted, textAlign: "center" },
  modal: { flex: 1, backgroundColor: COLORS.white },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: COLORS.text },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 7 },
  saveBtnDisabled: { backgroundColor: COLORS.border },
  saveBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 14 },
  modalScroll: { padding: SPACING.lg, gap: SPACING.sm, paddingBottom: 40 },
  row2: { flexDirection: "row", gap: SPACING.sm },
  fieldLabel: { fontSize: 10, fontWeight: "800", color: COLORS.textMuted, letterSpacing: 1, marginBottom: 4 },
  input: {
    height: 44, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.white,
  },
  tableHeader: {
    flexDirection: "row", gap: 4, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, marginTop: SPACING.md,
  },
  tableCol: { fontSize: 9, fontWeight: "800", color: COLORS.textMuted, letterSpacing: 0.5 },
  lineEntry: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
  accountField: {
    flexDirection: "row", alignItems: "center", gap: 4,
    height: 36, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm, backgroundColor: COLORS.surface,
  },
  accountText: { flex: 1, fontSize: 12, color: COLORS.text },
  accountPlaceholder: { flex: 1, fontSize: 12, color: COLORS.textMuted },
  amtInput: {
    height: 36, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm, fontSize: 13, color: COLORS.text, textAlign: "right",
    backgroundColor: COLORS.white,
  },
  addLineBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 8, marginTop: 4,
  },
  addLineBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: "700" },
  totalsRow: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 8, borderTopWidth: 2, borderTopColor: COLORS.border, marginTop: 4,
  },
  totalsRowError: { borderTopColor: COLORS.danger },
  totalsLabel: { flex: 2, fontSize: 11, fontWeight: "800", color: COLORS.textMuted },
  totalsAmt: { flex: 1, fontSize: 13, fontWeight: "900", textAlign: "right", fontVariant: ["tabular-nums"] },
  balanceWarn: { fontSize: 12, color: COLORS.danger, fontWeight: "600", textAlign: "center", marginTop: 4 },
  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  pickerSheet: {
    backgroundColor: COLORS.white, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: SPACING.lg, maxHeight: 400,
  },
  pickerTitle: { fontSize: 16, fontWeight: "700", color: COLORS.text, marginBottom: SPACING.md },
  pickerRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pickerRowText: { fontSize: 15, color: COLORS.text },
});
