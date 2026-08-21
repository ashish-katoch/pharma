import { View, TextInput, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

interface SearchBarProps {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  onClear?: () => void;
  autoFocus?: boolean;
}

export function SearchBar({ value, onChangeText, placeholder = "Search…", onClear, autoFocus }: SearchBarProps) {
  return (
    <View style={s.wrap}>
      <Feather name="search" size={15} color={COLORS.textMuted} style={s.icon} />
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        autoFocus={autoFocus}
        returnKeyType="search"
        clearButtonMode="never"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => { onChangeText(""); onClear?.(); }} style={s.clear} activeOpacity={0.7}>
          <Feather name="x" size={14} color={COLORS.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
  },
  icon: { flexShrink: 0 },
  input: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    paddingVertical: 0,
    height: 40,
    outlineStyle: "none",
  } as any,
  clear: {
    padding: 4,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceContainerHigh,
  },
});
