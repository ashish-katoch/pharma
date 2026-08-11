import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { alertMsg } from "@/src/dialog";
import { confirmDestructive } from "@/src/confirm";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { DatePicker } from "@/src/components/DatePicker";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const CATEGORIES = ["rent", "salary", "electricity", "supplies", "maintenance", "other"] as const;
type Category = typeof CATEGORIES[number];

const CAT_ICONS: Record<Category, string> = {
  rent: "home",
  salary: "users",
  electricity: "zap",
  supplies: "package",
  maintenance: "tool",
  other: "more-horizontal",
};

const CAT_COLORS: Record<Category, string> = {
  rent: "#6366F1",
  salary: "#0EA5E9",
  electricity: "#F59E0B",
  supplies: "#10B981",
  maintenance: "#EF4444",
  other: "#94A3B8",
};

type Expense = {
  id: string;
  date: string;
  category: Category;
  amount: number;
  notes: string;
  added_by: string;
};

function prevMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
}
function nextMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

export default function Expenses() {
  const router = useRouter();
  const [month, setMonth] = useState(currentMonth());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Add / edit form
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    category: "other" as Category,
    amount: "",
    notes: "",
  });

  const load = useCallback(async (m: string) => {
    setLoading(true);
    try {
      const rows = await api<Expense[]>(`/expenses?month=${m}`);
      setExpenses(rows);
    } catch (e: any) {
      alertMsg("Error", e?.message || "Could not load expenses");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(month); }, [load, month]));

  const changeMonth = (m: string) => {
    setMonth(m);
    load(m);
  };

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  const byCategory = CATEGORIES.map((cat) => ({
    cat,
    total: expenses.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter((c) => c.total > 0);

  const openAdd = () => {
    setEditingId(null);
    setForm({ date: new Date().toISOString().slice(0, 10), category: "other", amount: "", notes: "" });
    setAddOpen(true);
  };

  const openEdit = (item: Expense) => {
    setEditingId(item.id);
    setForm({ date: item.date, category: item.category, amount: String(item.amount), notes: item.notes });
    setAddOpen(true);
  };

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
      setForm({ date: new Date().toISOString().slice(0, 10), category: "other", amount: "", notes: "" });
      setEditingId(null);
    } catch (e: any) {
      alertMsg("Failed", e?.message || "Could not save expense");
    } finally {
      setSaving(false);
    }
  };

  const deleteExpense = (id: string) => {
    const doDelete = async () => {
      try {
        await api(`/expenses/${id}`, { method: "DELETE" });
        setExpenses((prev) => prev.filter((e) => e.id !== id));
      } catch (e: any) {
        alertMsg("Failed", e?.message || "Could not delete");
      }
    };
    confirmDestructive("Delete Expense", "This cannot be undone.", "Delete", doDelete);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Expenses</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd} testID="expense-add-btn">
          <Feather name="plus" size={18} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* Month nav */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => changeMonth(prevMonth(month))} style={styles.monthArrow}>
          <Feather name="chevron-left" size={22} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel(month)}</Text>
        <TouchableOpacity
          onPress={() => { const n = nextMonth(month); if (n <= currentMonth()) changeMonth(n); }}
          style={styles.monthArrow}
        >
          <Feather name="chevron-right" size={22} color={month < currentMonth() ? COLORS.primary : COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Total card */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>TOTAL EXPENSES</Text>
        <Text style={styles.totalValue}>{rupee(total)}</Text>
        {byCategory.length > 0 && (
          <View style={styles.breakdown}>
            {byCategory.map(({ cat, total: t }) => (
              <View key={cat} style={styles.catChip}>
                <View style={[styles.catDot, { backgroundColor: CAT_COLORS[cat] }]} />
                <Text style={styles.catChipText}>{cat} {rupee(t)}</Text>
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
          contentContainerStyle={{ padding: SPACING.lg, gap: 8, paddingBottom: 80 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="inbox" size={32} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>No expenses for {monthLabel(month)}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.expenseCard}>
              <View style={[styles.catIcon, { backgroundColor: CAT_COLORS[item.category] + "20" }]}>
                <Feather name={CAT_ICONS[item.category] as any} size={18} color={CAT_COLORS[item.category]} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={styles.catLabel}>{item.category.toUpperCase()}</Text>
                  <Text style={styles.expAmt}>{rupee(item.amount)}</Text>
                </View>
                <Text style={styles.expDate}>{item.date} · {item.added_by}</Text>
                {item.notes ? <Text style={styles.expNotes} numberOfLines={1}>{item.notes}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => openEdit(item)} style={styles.deleteBtn} testID={`expense-edit-${item.id}`}>
                <Feather name="edit-2" size={16} color={COLORS.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteExpense(item.id)} style={styles.deleteBtn} testID={`expense-delete-${item.id}`}>
                <Feather name="trash-2" size={16} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {/* Add Expense Modal */}
      <Modal visible={addOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddOpen(false)}>
        <SafeAreaView style={styles.modalRoot} edges={["top", "bottom"]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingId ? "Edit Expense" : "Add Expense"}</Text>
            <TouchableOpacity onPress={() => setAddOpen(false)}>
              <Feather name="x" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
              <DatePicker label="DATE *" value={form.date} onChange={(v) => setForm((p) => ({ ...p, date: v }))} testID="expense-date" />

              <Text style={styles.fieldLabel}>CATEGORY</Text>
              <View style={styles.catGrid}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catOption, form.category === cat && { borderColor: CAT_COLORS[cat], backgroundColor: CAT_COLORS[cat] + "15" }]}
                    onPress={() => setForm((p) => ({ ...p, category: cat }))}
                  >
                    <Feather name={CAT_ICONS[cat] as any} size={16} color={form.category === cat ? CAT_COLORS[cat] : COLORS.textMuted} />
                    <Text style={[styles.catOptionText, form.category === cat && { color: CAT_COLORS[cat], fontWeight: "800" }]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>AMOUNT ₹ *</Text>
              <TextInput
                style={styles.input}
                value={form.amount}
                onChangeText={(v) => setForm((p) => ({ ...p, amount: v }))}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={COLORS.textMuted}
                testID="expense-amount"
              />

              <Text style={styles.fieldLabel}>NOTES</Text>
              <TextInput
                style={[styles.input, { minHeight: 72, textAlignVertical: "top" }]}
                value={form.notes}
                onChangeText={(v) => setForm((p) => ({ ...p, notes: v }))}
                placeholder="Optional description"
                placeholderTextColor={COLORS.textMuted}
                multiline
                testID="expense-notes"
              />

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={saveExpense}
                disabled={saving}
                testID="expense-save"
              >
                {saving ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <>
                    <Feather name="check" size={18} color={COLORS.white} />
                    <Text style={styles.saveBtnText}>Save Expense</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  headerTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  monthArrow: { padding: 6 },
  monthLabel: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  totalCard: {
    margin: SPACING.lg,
    marginBottom: 0,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  totalLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: "rgba(255,255,255,0.7)" },
  totalValue: { fontSize: 32, fontWeight: "900", color: COLORS.white, marginTop: 4 },
  breakdown: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: SPACING.md },
  catChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.pill },
  catDot: { width: 6, height: 6, borderRadius: 3 },
  catChipText: { fontSize: 11, fontWeight: "700", color: COLORS.white },
  expenseCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  catIcon: { width: 40, height: 40, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  catLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5, color: COLORS.textSecondary },
  expAmt: { fontSize: 14, fontWeight: "900", color: COLORS.text },
  expDate: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  expNotes: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  deleteBtn: { padding: 6 },
  empty: { alignItems: "center", padding: SPACING.xxl, gap: 8 },
  emptyText: { color: COLORS.textMuted, fontSize: 14 },
  // Modal
  modalRoot: { flex: 1, backgroundColor: COLORS.surface },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: COLORS.text },
  fieldLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.textSecondary },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  catOptionText: { fontSize: 13, fontWeight: "600", color: COLORS.textSecondary, textTransform: "capitalize" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
  },
  saveBtnText: { fontSize: 16, fontWeight: "800", color: COLORS.white },
});
