import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { alertMsg } from "@/src/dialog";
import { confirmDestructive } from "@/src/confirm";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { DatePicker } from "@/src/components/DatePicker";
import { PageShell } from "@/src/components/PageShell";
import { EmptyState } from "@/src/components/ui/EmptyState";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const CATEGORIES = ["rent", "salary", "electricity", "supplies", "maintenance", "other"] as const;
type Category = typeof CATEGORIES[number];

const CAT_ICONS: Record<Category, string> = {
  rent: "home", salary: "users", electricity: "zap",
  supplies: "package", maintenance: "tool", other: "more-horizontal",
};
const CAT_COLORS: Record<Category, string> = {
  rent: "#6366F1", salary: "#0EA5E9", electricity: "#F59E0B",
  supplies: "#10B981", maintenance: "#EF4444", other: "#94A3B8",
};

type Expense = { id: string; date: string; category: Category; amount: number; notes: string; added_by: string };

function prevMonth(m: string) { const [y, mo] = m.split("-").map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`; }
function nextMonth(m: string) { const [y, mo] = m.split("-").map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; }
function currentMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function monthLabel(m: string) { const [y, mo] = m.split("-").map(Number); return new Date(y, mo - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" }); }

export default function Expenses() {
  const [month, setMonth] = useState(currentMonth());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), category: "other" as Category, amount: "", notes: "" });

  const load = useCallback(async (m: string) => {
    setLoading(true);
    try {
      setExpenses(await api<Expense[]>(`/expenses?month=${m}`));
    } catch (e: any) {
      alertMsg("Error", e?.message || "Could not load expenses");
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(month); }, [load, month]));
  const changeMonth = (m: string) => { setMonth(m); load(m); };

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byCategory = CATEGORIES.map((cat) => ({ cat, total: expenses.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0) })).filter((c) => c.total > 0);

  const openAdd = () => { setEditingId(null); setForm({ date: new Date().toISOString().slice(0, 10), category: "other", amount: "", notes: "" }); setAddOpen(true); };
  const openEdit = (item: Expense) => { setEditingId(item.id); setForm({ date: item.date, category: item.category, amount: String(item.amount), notes: item.notes }); setAddOpen(true); };

  const saveExpense = async () => {
    const amt = parseFloat(form.amount);
    if (!form.date) { alertMsg("Date", "Select a date"); return; }
    if (!amt || amt <= 0) { alertMsg("Amount", "Enter a valid amount"); return; }
    setSaving(true);
    try {
      const body = { date: form.date, category: form.category, amount: amt, notes: form.notes };
      if (editingId) {
        const updated = await api<Expense>(`/expenses/${editingId}`, { method: "PUT", body });
        setExpenses((prev) => prev.map((e) => e.id === editingId ? updated : e));
      } else {
        const created = await api<Expense>("/expenses", { method: "POST", body });
        setExpenses((prev) => [created, ...prev]);
      }
      setAddOpen(false);
      setEditingId(null);
    } catch (e: any) {
      alertMsg("Failed", e?.message || "Could not save expense");
    } finally { setSaving(false); }
  };

  const deleteExpense = (id: string) => {
    confirmDestructive("Delete Expense", "This cannot be undone.", "Delete", async () => {
      try { await api(`/expenses/${id}`, { method: "DELETE" }); setExpenses((prev) => prev.filter((e) => e.id !== id)); }
      catch (e: any) { alertMsg("Failed", e?.message || "Could not delete"); }
    });
  };

  const AddBtn = (
    <TouchableOpacity style={s.addBtn} onPress={openAdd} testID="expense-add-btn">
      <Feather name="plus" size={18} color={COLORS.white} />
    </TouchableOpacity>
  );

  return (
    <PageShell title="Expenses" rightAction={AddBtn} scrollable={false} noPadding showBack>
      {/* Month navigator */}
      <View style={s.monthNav}>
        <TouchableOpacity onPress={() => changeMonth(prevMonth(month))} style={s.monthArrow}>
          <Feather name="chevron-left" size={22} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={s.monthLabel}>{monthLabel(month)}</Text>
        <TouchableOpacity
          onPress={() => { const n = nextMonth(month); if (n <= currentMonth()) changeMonth(n); }}
          style={s.monthArrow}
        >
          <Feather name="chevron-right" size={22} color={month < currentMonth() ? COLORS.primary : COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Summary card */}
      <View style={s.totalCard}>
        <Text style={s.totalLabel}>TOTAL EXPENSES</Text>
        <Text style={s.totalValue}>{rupee(total)}</Text>
        {byCategory.length > 0 && (
          <View style={s.breakdown}>
            {byCategory.map(({ cat, total: t }) => (
              <View key={cat} style={s.catChip}>
                <View style={[s.catDot, { backgroundColor: CAT_COLORS[cat] }]} />
                <Text style={s.catChipText}>{cat} {rupee(t)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(e) => e.id}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <EmptyState icon="inbox" title={`No expenses for ${monthLabel(month)}`} subtitle="Tap + to record an expense." />
          }
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={[s.catIcon, { backgroundColor: CAT_COLORS[item.category] + "20" }]}>
                <Feather name={CAT_ICONS[item.category] as any} size={18} color={CAT_COLORS[item.category]} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={s.catLabel}>{item.category.toUpperCase()}</Text>
                  <Text style={s.expAmt}>{rupee(item.amount)}</Text>
                </View>
                <Text style={s.expMeta}>{item.date} · {item.added_by}</Text>
                {item.notes ? <Text style={s.expNotes} numberOfLines={1}>{item.notes}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => openEdit(item)} style={s.iconBtn} testID={`expense-edit-${item.id}`}>
                <Feather name="edit-2" size={16} color={COLORS.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteExpense(item.id)} style={s.iconBtn} testID={`expense-delete-${item.id}`}>
                <Feather name="trash-2" size={16} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <Modal visible={addOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddOpen(false)}>
        <SafeAreaView style={s.modalRoot} edges={["top", "bottom"]}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editingId ? "Edit Expense" : "Add Expense"}</Text>
            <TouchableOpacity onPress={() => setAddOpen(false)} style={s.closeBtn}>
              <Feather name="x" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
              <DatePicker label="DATE *" value={form.date} onChange={(v) => setForm((p) => ({ ...p, date: v }))} testID="expense-date" />
              <Text style={s.fieldLabel}>CATEGORY</Text>
              <View style={s.catGrid}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity key={cat} style={[s.catOption, form.category === cat && { borderColor: CAT_COLORS[cat], backgroundColor: CAT_COLORS[cat] + "15" }]} onPress={() => setForm((p) => ({ ...p, category: cat }))}>
                    <Feather name={CAT_ICONS[cat] as any} size={16} color={form.category === cat ? CAT_COLORS[cat] : COLORS.textMuted} />
                    <Text style={[s.catOptionText, form.category === cat && { color: CAT_COLORS[cat], fontWeight: "800" }]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.fieldLabel}>AMOUNT ₹ *</Text>
              <TextInput style={s.input} value={form.amount} onChangeText={(v) => setForm((p) => ({ ...p, amount: v }))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={COLORS.textMuted} testID="expense-amount" />
              <Text style={s.fieldLabel}>NOTES</Text>
              <TextInput style={[s.input, { minHeight: 72, textAlignVertical: "top" }]} value={form.notes} onChangeText={(v) => setForm((p) => ({ ...p, notes: v }))} placeholder="Optional description" placeholderTextColor={COLORS.textMuted} multiline testID="expense-notes" />
              <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={saveExpense} disabled={saving} testID="expense-save">
                {saving ? <ActivityIndicator color={COLORS.white} /> : (
                  <><Feather name="check" size={18} color={COLORS.white} /><Text style={s.saveBtnText}>Save Expense</Text></>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </PageShell>
  );
}

const s = StyleSheet.create({
  addBtn: { width: 36, height: 36, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  monthArrow: { padding: 6 },
  monthLabel: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  totalCard: { margin: SPACING.lg, marginBottom: 0, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, padding: SPACING.lg },
  totalLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: "rgba(255,255,255,0.7)" },
  totalValue: { fontSize: 32, fontWeight: "900", color: COLORS.white, marginTop: 4 },
  breakdown: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: SPACING.md },
  catChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.pill },
  catDot: { width: 6, height: 6, borderRadius: 3 },
  catChipText: { fontSize: 11, fontWeight: "700", color: COLORS.white },
  list: { padding: SPACING.lg, gap: 8, paddingBottom: 80 },
  card: { flexDirection: "row", alignItems: "center", gap: SPACING.md, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md },
  catIcon: { width: 40, height: 40, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  catLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5, color: COLORS.textSecondary },
  expAmt: { fontSize: 14, fontWeight: "900", color: COLORS.text },
  expMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  expNotes: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  iconBtn: { padding: 6 },
  // Modal
  modalRoot: { flex: 1, backgroundColor: COLORS.surface },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.white },
  modalTitle: { fontSize: 17, fontWeight: "800", color: COLORS.text },
  closeBtn: { width: 32, height: 32, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceContainerLow, alignItems: "center", justifyContent: "center" },
  modalBody: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 100 },
  fieldLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.textSecondary },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catOption: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.white },
  catOptionText: { fontSize: 13, fontWeight: "600", color: COLORS.textSecondary, textTransform: "capitalize" },
  input: { minHeight: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, fontSize: 15, color: COLORS.text, backgroundColor: COLORS.white },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 52, backgroundColor: COLORS.primary, borderRadius: RADIUS.md },
  saveBtnText: { fontSize: 16, fontWeight: "800", color: COLORS.white },
});
