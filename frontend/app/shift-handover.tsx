import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";
import { alertMsg } from "@/src/dialog";

type Shift = {
  id?: string;
  user_email?: string;
  clock_in?: string;
  opening_cash?: number;
};

const rupee = (n: number) =>
  "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function fmt(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default function ShiftHandover() {
  const router = useRouter();
  const [active, setActive] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [closingCash, setClosingCash] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Shift | null>("/shifts/active");
      setActive(data && (data as Shift).id ? (data as Shift) : null);
    } catch {
      setActive(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onComplete = async () => {
    setBusy(true);
    try {
      await api("/shifts/clock-out", {
        method: "POST",
        body: {
          closing_cash: Number(closingCash) || 0,
          notes: notes.trim(),
        },
      });
      alertMsg("Shift handed over", "The shift has been closed successfully.");
      router.back();
    } catch (e: any) {
      alertMsg("Handover failed", e?.message || "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const footer = active ? (
    <TouchableOpacity
      style={[s.primaryBtn, busy && { opacity: 0.6 }]}
      activeOpacity={0.85}
      onPress={onComplete}
      disabled={busy}
    >
      {busy ? (
        <ActivityIndicator color={COLORS.white} />
      ) : (
        <>
          <Feather name="log-out" size={18} color={COLORS.white} />
          <Text style={s.primaryBtnText}>Complete Handover</Text>
        </>
      )}
    </TouchableOpacity>
  ) : undefined;

  return (
    <PageShell title="Shift Handover" footer={footer}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={COLORS.primary} />
      ) : !active ? (
        <View style={s.empty}>
          <Feather name="moon" size={40} color={COLORS.textMuted} />
          <Text style={s.emptyText}>No active shift to hand over</Text>
        </View>
      ) : (
        <>
          <View style={s.activeCard}>
            <View style={s.activeHead}>
              <Feather name="clock" size={18} color={COLORS.white} />
              <Text style={s.activeTitle}>On Shift</Text>
            </View>
            <Text style={s.activeStaff}>{active.user_email ?? "Current staff"}</Text>
            <View style={s.activeRow}>
              <Text style={s.activeLabel}>Started</Text>
              <Text style={s.activeValue}>{fmt(active.clock_in)}</Text>
            </View>
            <View style={s.activeRow}>
              <Text style={s.activeLabel}>Opening cash</Text>
              <Text style={s.activeValue}>{rupee(active.opening_cash ?? 0)}</Text>
            </View>
          </View>

          <Text style={s.sectionLabel}>HANDOVER DETAILS</Text>

          <Text style={s.fieldLabel}>CLOSING CASH COUNT</Text>
          <TextInput
            style={s.field}
            value={closingCash}
            onChangeText={setClosingCash}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={[s.fieldLabel, { marginTop: SPACING.md }]}>NOTES</Text>
          <TextInput
            style={[s.field, s.multiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Anything the next shift should know..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </>
      )}
    </PageShell>
  );
}

const s = StyleSheet.create({
  activeCard: {
    padding: SPACING.lg,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  activeHead: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  activeTitle: { fontSize: 13, fontWeight: "800", color: COLORS.white, letterSpacing: 0.5 },
  activeStaff: { fontSize: 18, fontWeight: "900", color: COLORS.white, marginTop: 2 },
  activeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  activeLabel: { fontSize: 13, color: "rgba(255,255,255,0.8)" },
  activeValue: { fontSize: 13, fontWeight: "700", color: COLORS.white },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
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
  multiline: { minHeight: 100, paddingTop: 12 },
  primaryBtn: {
    minHeight: 52,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: SPACING.sm,
  },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
  empty: { alignItems: "center", justifyContent: "center", padding: 48, gap: 10 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontWeight: "600", textAlign: "center" },
});
