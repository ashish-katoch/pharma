import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  addMonths,
  subMonths,
  format,
  startOfMonth,
  getDaysInMonth,
  getDay,
} from "date-fns";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

type Props = {
  value: string;
  onChange: (date: string) => void;
  label?: string;
  placeholder?: string;
  testID?: string;
  minimumDate?: string;
  maximumDate?: string;
  half?: boolean;
};

function parseDate(s: string): Date {
  return new Date(s + "T12:00:00");
}

export function DatePicker({ value, onChange, label, placeholder = "Select date", testID, minimumDate, maximumDate, half }: Props) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() =>
    value ? parseDate(value) : new Date()
  );

  const displayValue = value
    ? format(parseDate(value), "dd MMM yyyy")
    : "";

  if (Platform.OS === "web") {
    return (
      <View style={[styles.wrapper, half && { flex: 1 }]}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        {/* @ts-ignore – web-only JSX */}
        <input
          type="date"
          value={value || ""}
          min={minimumDate}
          max={maximumDate}
          data-testid={testID}
          onChange={(e: any) => onChange(e.target.value)}
          style={{
            height: 48,
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.md,
            paddingLeft: SPACING.md,
            paddingRight: SPACING.md,
            fontSize: 15,
            color: value ? COLORS.text : COLORS.textMuted,
            backgroundColor: COLORS.white,
            width: "100%",
            boxSizing: "border-box",
            fontFamily: "inherit",
            outline: "none",
          }}
        />
      </View>
    );
  }

  // Build calendar grid
  const firstOfMonth = startOfMonth(viewMonth);
  const daysInMonth = getDaysInMonth(viewMonth);
  const startDow = getDay(firstOfMonth);
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const handleDayPress = (day: number) => {
    const y = viewMonth.getFullYear();
    const m = String(viewMonth.getMonth() + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    onChange(`${y}-${m}-${d}`);
    setOpen(false);
  };

  return (
    <View style={[styles.wrapper, half && { flex: 1 }]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity
        testID={testID}
        style={styles.trigger}
        onPress={() => {
          setViewMonth(value ? parseDate(value) : new Date());
          setOpen(true);
        }}
      >
        <Text style={[styles.triggerText, !displayValue && styles.triggerPlaceholder]}>
          {displayValue || placeholder}
        </Text>
        <Feather name="calendar" size={16} color={COLORS.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" statusBarTranslucent>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)} />
        <View style={styles.card}>
          {/* Month navigation */}
          <View style={styles.calHeader}>
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => setViewMonth(subMonths(viewMonth, 1))}
            >
              <Feather name="chevron-left" size={20} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{format(viewMonth, "MMMM yyyy")}</Text>
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => setViewMonth(addMonths(viewMonth, 1))}
            >
              <Feather name="chevron-right" size={20} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* Day-of-week headers */}
          <View style={styles.dowRow}>
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <Text key={d} style={styles.dowLabel}>{d}</Text>
            ))}
          </View>

          {/* Day grid */}
          <View style={styles.grid}>
            {cells.map((cell, idx) => {
              if (!cell) return <View key={`e-${idx}`} style={styles.cell} />;
              const y = viewMonth.getFullYear();
              const m = String(viewMonth.getMonth() + 1).padStart(2, "0");
              const dateStr = `${y}-${m}-${String(cell).padStart(2, "0")}`;
              const selected = dateStr === value;
              const disabled =
                (!!minimumDate && dateStr < minimumDate) ||
                (!!maximumDate && dateStr > maximumDate);
              return (
                <TouchableOpacity
                  key={`d-${cell}`}
                  style={[styles.cell, selected && styles.cellSelected]}
                  onPress={() => !disabled && handleDayPress(cell)}
                  disabled={disabled}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.cellText,
                      selected && styles.cellTextSelected,
                      disabled && styles.cellTextDisabled,
                    ]}
                  >
                    {cell}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Clear + Today shortcuts */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.footerBtn}
              onPress={() => { onChange(""); setOpen(false); }}
            >
              <Text style={styles.footerBtnText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerBtn, styles.footerBtnPrimary]}
              onPress={() => {
                const today = format(new Date(), "yyyy-MM-dd");
                if (
                  (!minimumDate || today >= minimumDate) &&
                  (!maximumDate || today <= maximumDate)
                ) {
                  onChange(today);
                  setOpen(false);
                }
              }}
            >
              <Text style={[styles.footerBtnText, styles.footerBtnTextPrimary]}>Today</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.textSecondary },
  trigger: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.white,
  },
  triggerText: { fontSize: 15, color: COLORS.text, flex: 1 },
  triggerPlaceholder: { color: COLORS.textMuted },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  card: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 12,
  },
  calHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.md,
  },
  navBtn: { padding: 8 },
  monthLabel: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  dowRow: { flexDirection: "row", marginBottom: 4 },
  dowLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.textMuted,
    paddingBottom: 4,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / 7}%` as any,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cellSelected: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
  },
  cellText: { fontSize: 14, color: COLORS.text },
  cellTextSelected: { color: COLORS.white, fontWeight: "800" },
  cellTextDisabled: { color: COLORS.textMuted },
  footer: {
    flexDirection: "row",
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  footerBtn: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  footerBtnPrimary: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  footerBtnText: { fontSize: 14, fontWeight: "700", color: COLORS.textSecondary },
  footerBtnTextPrimary: { color: COLORS.white },
});
