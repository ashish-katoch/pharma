import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { PageShell } from "@/src/components/PageShell";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { alertMsg } from "@/src/dialog";

type ExportRecord = {
  id: string;
  type: string;
  format: string;
  date: string;
  rows: number;
};

const SEED: ExportRecord[] = [
  { id: "1", type: "Sales Report", format: "PDF", date: "2026-08-19", rows: 1284 },
  { id: "2", type: "Inventory", format: "Excel", date: "2026-08-17", rows: 3410 },
  { id: "3", type: "GST Summary", format: "CSV", date: "2026-08-15", rows: 512 },
  { id: "4", type: "Customer List", format: "CSV", date: "2026-08-12", rows: 876 },
];

export default function ExportHistoryScreen() {
  const [records] = useState<ExportRecord[]>(SEED);

  return (
    <PageShell title="Export History">
      {records.length === 0 ? (
        <View style={s.empty}>
          <Feather name="file-text" size={40} color={COLORS.textMuted} />
          <Text style={s.emptyText}>No exports yet</Text>
        </View>
      ) : (
        records.map((rec) => (
          <View key={rec.id} style={s.row}>
            <View style={s.iconWrap}>
              <Feather name="file-text" size={16} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>
                {rec.type} ({rec.format})
              </Text>
              <Text style={s.rowSub}>
                {rec.rows.toLocaleString()} rows · {rec.date}
              </Text>
            </View>
            <TouchableOpacity
              style={s.dlBtn}
              activeOpacity={0.7}
              onPress={() =>
                alertMsg("Re-downloading", `${rec.type} (${rec.format}) is being prepared.`)
              }
            >
              <Feather name="download" size={18} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        ))
      )}
    </PageShell>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  dlBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLight,
  },
  empty: { alignItems: "center", justifyContent: "center", padding: 48, gap: 10 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontWeight: "600", textAlign: "center" },
});
