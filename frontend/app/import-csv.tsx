import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { readAsStringAsync } from "expo-file-system/legacy";
import { api } from "@/src/api";
import { parseMedicineCsv, ParsedMedicine, TEMPLATE_CSV } from "@/src/csv";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

async function readTextFromUri(uri: string): Promise<string> {
  // On web the picker hands back a blob: URL that fetch can read; native uses the
  // filesystem legacy reader.
  if (Platform.OS === "web") {
    const res = await fetch(uri);
    return res.text();
  }
  return readAsStringAsync(uri);
}

export default function ImportCsv() {
  const router = useRouter();
  const [rows, setRows] = useState<ParsedMedicine[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [importing, setImporting] = useState(false);

  const ingest = (text: string, label: string) => {
    const { rows: parsed, errors: errs } = parseMedicineCsv(text);
    setRows(parsed);
    setErrors(errs);
    setFileName(label);
    if (parsed.length === 0) {
      Alert.alert("Nothing to import", errs[0] || "No valid rows found in the file.");
    }
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/csv", "text/plain", "*/*"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const text = await readTextFromUri(asset.uri);
      ingest(text, asset.name || "selected file");
    } catch (e: any) {
      Alert.alert("Couldn't read file", e?.message || "Try the paste option instead.");
    }
  };

  const usePaste = () => {
    if (!paste.trim()) {
      Alert.alert("Empty", "Paste CSV text first.");
      return;
    }
    ingest(paste, "pasted text");
  };

  const doImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    try {
      const res = await api<{ inserted: number }>("/medicines/bulk", {
        method: "POST",
        body: { medicines: rows },
      });
      Alert.alert(
        "Import complete",
        `${res.inserted} medicine${res.inserted === 1 ? "" : "s"} added to the catalogue.\n\nAdd stock batches from Inventory → Stock In.`,
        [{ text: "Done", onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert("Import failed", e?.message || "Please try again.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="import-back">
          <Feather name="x" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Import medicines</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md }} keyboardShouldPersistTaps="handled">
        <Text style={styles.help}>
          Upload a CSV to add many medicines at once. First row must be a header.
          Columns: name (required), brand, generic, strength, pack, hsn, schedule,
          gst_rate, mrp, reorder_level, barcode.
        </Text>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.pickBtn} onPress={pickFile} testID="import-pick">
            <Feather name="upload" size={20} color={COLORS.white} />
            <Text style={styles.pickBtnText}>Choose CSV file</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.templateBtn}
            onPress={() => setShowPaste((s) => !s)}
            testID="import-toggle-paste"
          >
            <Feather name="clipboard" size={18} color={COLORS.primary} />
            <Text style={styles.templateBtnText}>Paste</Text>
          </TouchableOpacity>
        </View>

        {showPaste && (
          <View style={{ gap: SPACING.sm }}>
            <TextInput
              testID="import-paste-input"
              style={styles.pasteInput}
              multiline
              placeholder={TEMPLATE_CSV}
              placeholderTextColor={COLORS.textMuted}
              value={paste}
              onChangeText={setPaste}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.parsePasteBtn} onPress={usePaste} testID="import-parse-paste">
              <Text style={styles.parsePasteText}>Parse pasted text</Text>
            </TouchableOpacity>
          </View>
        )}

        {errors.length > 0 && (
          <View style={styles.warnBox}>
            <Text style={styles.warnTitle}>{errors.length} row issue(s)</Text>
            {errors.slice(0, 5).map((e, i) => (
              <Text key={i} style={styles.warnText}>• {e}</Text>
            ))}
            {errors.length > 5 && <Text style={styles.warnText}>…and {errors.length - 5} more</Text>}
          </View>
        )}

        {rows.length > 0 && (
          <>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>{rows.length} ready</Text>
              <Text style={styles.previewFile} numberOfLines={1}>{fileName}</Text>
            </View>
            {rows.slice(0, 20).map((r, i) => (
              <View key={i} style={styles.rowCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>{r.name}</Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {[r.brand, r.strength, r.pack].filter(Boolean).join(" · ") || "—"}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.rowMrp}>{rupee(r.mrp)}</Text>
                  <Text style={styles.rowGst}>GST {r.gst_rate}%</Text>
                </View>
              </View>
            ))}
            {rows.length > 20 && (
              <Text style={styles.moreText}>+ {rows.length - 20} more will be imported</Text>
            )}
          </>
        )}
      </ScrollView>

      {rows.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.importBtn}
            onPress={doImport}
            disabled={importing}
            testID="import-confirm"
          >
            {importing ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Feather name="check" size={22} color={COLORS.white} />
                <Text style={styles.importBtnText}>Import {rows.length} medicines</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  title: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  help: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
  actionsRow: { flexDirection: "row", gap: SPACING.md },
  pickBtn: {
    flex: 1,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
  },
  pickBtnText: { color: COLORS.white, fontSize: 15, fontWeight: "800" },
  templateBtn: {
    minWidth: 100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  templateBtnText: { color: COLORS.primary, fontWeight: "800", fontSize: 14 },
  pasteInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    fontSize: 13,
    color: COLORS.text,
    textAlignVertical: "top",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  parsePasteBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.text,
  },
  parsePasteText: { color: COLORS.white, fontWeight: "700", fontSize: 13 },
  warnBox: {
    backgroundColor: COLORS.warningBg,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: 2,
  },
  warnTitle: { fontSize: 13, fontWeight: "800", color: COLORS.warning, marginBottom: 4 },
  warnText: { fontSize: 12, color: COLORS.textSecondary },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.sm,
  },
  previewTitle: { fontSize: 13, fontWeight: "800", letterSpacing: 1, color: COLORS.textMuted },
  previewFile: { fontSize: 12, color: COLORS.textMuted, flexShrink: 1, marginLeft: 12 },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
  },
  rowName: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  rowMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  rowMrp: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  rowGst: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  moreText: { fontSize: 12, color: COLORS.textMuted, textAlign: "center", paddingVertical: 4 },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  importBtn: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
  },
  importBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
});
