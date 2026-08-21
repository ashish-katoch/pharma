import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { alertMsg } from "@/src/dialog";

type Transfer = {
  id: string;
  from: string;
  to: string;
  items: number;
  status: "Pending" | "Completed";
  date: string;
};

const SEED: Transfer[] = [
  {
    id: "TRF-1042",
    from: "City Care — Main",
    to: "City Care — Sector 22",
    items: 14,
    status: "Pending",
    date: "2026-08-19",
  },
  {
    id: "TRF-1039",
    from: "City Care — Sector 22",
    to: "City Care — Main",
    items: 6,
    status: "Completed",
    date: "2026-08-16",
  },
];

export default function InterStoreTransfers() {
  const [transfers] = useState<Transfer[]>(SEED);

  const addBtn = (
    <TouchableOpacity
      style={s.iconBtn}
      activeOpacity={0.7}
      onPress={() => alertMsg("New transfer", "Store-to-store transfers are coming soon.")}
    >
      <Feather name="plus" size={18} color={COLORS.primary} />
    </TouchableOpacity>
  );

  return (
    <PageShell title="Store Transfers" rightAction={addBtn}>
      <Text style={s.intro}>
        Move stock between your branches and track each transfer's status.
      </Text>

      {transfers.map((t) => {
        const done = t.status === "Completed";
        return (
          <View key={t.id} style={s.card}>
            <View style={s.head}>
              <View style={s.iconWrap}>
                <Feather name="repeat" size={16} color={COLORS.primary} />
              </View>
              <Text style={s.route} numberOfLines={1}>
                {t.from} → {t.to}
              </Text>
              <View style={[s.badge, done ? s.badgeDone : s.badgePending]}>
                <Text style={[s.badgeText, done ? s.badgeTextDone : s.badgeTextPending]}>
                  {t.status}
                </Text>
              </View>
            </View>
            <View style={s.metaRow}>
              <Text style={s.meta}>
                {t.items} items · {t.date}
              </Text>
              <Text style={s.ref}>{t.id}</Text>
            </View>
          </View>
        );
      })}
    </PageShell>
  );
}

const s = StyleSheet.create({
  intro: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.md, lineHeight: 18 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLight,
  },
  card: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  head: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  route: { flex: 1, fontSize: 14, fontWeight: "700", color: COLORS.text },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  badgePending: { backgroundColor: COLORS.warningBg },
  badgeDone: { backgroundColor: COLORS.successBg },
  badgeText: { fontSize: 11, fontWeight: "800" },
  badgeTextPending: { color: COLORS.warningDark },
  badgeTextDone: { color: COLORS.successDark },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
  },
  meta: { fontSize: 12, color: COLORS.textSecondary },
  ref: { fontSize: 11, fontWeight: "800", color: COLORS.textMuted },
});
