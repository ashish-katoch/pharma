import { useState, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, TextInput, Platform, useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/src/api";
import { COLORS, SPACING, RADIUS } from "@/src/theme";

type ParsedLine = {
  raw: string;
  qty_hint: number | null;
  price_hint: number | null;
  name_hint: string | null;
  batch_hint: string | null;
  expiry_hint: string | null;
  pack_hint: string | null;
};
type ScanResp = { raw_text: string | null; parsed_lines: ParsedLine[]; note: string; ocr_available: boolean; method?: string; supplier_hint?: string | null };
type MatchMed = { id: string; name: string; generic?: string; brand?: string; mrp?: number; strength?: string };

type ImportLine = {
  raw: string;
  qty: number;
  price: number;
  medicine_id: string | null;
  medicine_name: string;
  batch_no: string;
  expiry: string;
  mrp: number;
  matched: boolean;
};

type ImportResp = { ok: boolean; purchase_id: string; lines_imported: number; total: number };

export default function ScanInvoiceScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResp | null>(null);
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
  const [importLines, setImportLines] = useState<ImportLine[]>([]);
  const [step, setStep] = useState<"upload" | "review" | "match" | "done">("upload");
  const [matchQuery, setMatchQuery] = useState<Record<number, string>>({});
  const [matchResults, setMatchResults] = useState<Record<number, MatchMed[]>>({});
  const [matchLoading, setMatchLoading] = useState<Record<number, boolean>>({});
  const [importing, setImporting] = useState(false);
  const searchTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const uploadFile = async (uri: string, mimeType: string, name: string) => {
    setScanning(true);
    setResult(null);
    setSelectedLines(new Set());
    setImportLines([]);
    setStep("upload");
    try {
      const formData = new FormData();
      if (Platform.OS === "web") {
        // On web, the picker gives a blob: URL — fetch it to get a real Blob/File
        const resp = await fetch(uri);
        const blob = await resp.blob();
        const file = new File([blob], name, { type: mimeType });
        formData.append("file", file);
      } else {
        formData.append("file", { uri, type: mimeType, name } as unknown as Blob);
      }
      const data = await api<ScanResp>("/purchases/scan", { method: "POST", formData });
      setResult(data);
      setStep("review");
    } catch (e: unknown) {
      Alert.alert("Upload failed", (e as Error).message || "Unknown error");
    } finally { setScanning(false); }
  };

  const pickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      await uploadFile(asset.uri, "application/pdf", asset.name || "invoice.pdf");
    } catch { Alert.alert("Failed to open document picker"); }
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed to access photos"); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    const mime = asset.mimeType || "image/jpeg";
    const ext = mime.split("/")[1] || "jpg";
    await uploadFile(asset.uri, mime, `invoice.${ext}`);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Camera permission needed"); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    await uploadFile(asset.uri, "image/jpeg", "invoice.jpg");
  };

  const toggleLine = (i: number) => {
    setSelectedLines((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const proceedToMatch = () => {
    if (!result) return;
    if (selectedLines.size === 0) { Alert.alert("Select at least one line"); return; }
    const lines: ImportLine[] = [...selectedLines].map((i) => {
      const pl = result.parsed_lines[i];
      return {
        raw: pl.raw,
        qty: pl.qty_hint ?? 1,
        price: pl.price_hint ?? 0,
        medicine_id: null,
        medicine_name: pl.name_hint ?? "",
        batch_no: pl.batch_hint ?? "SCAN",
        expiry: pl.expiry_hint ?? "",
        mrp: pl.price_hint ?? 0,
        matched: false,
      };
    });
    setImportLines(lines);
    const queries: Record<number, string> = {};
    lines.forEach((l, idx) => { queries[idx] = l.medicine_name || l.raw.slice(0, 40); });
    setMatchQuery(queries);
    // Auto-trigger search for each pre-filled name
    lines.forEach((l, idx) => {
      if (l.medicine_name.length >= 2) {
        setTimeout(() => searchMedicine(idx, l.medicine_name), idx * 100);
      }
    });
    setStep("match");
  };

  const searchMedicine = async (lineIdx: number, query: string) => {
    if (query.length < 2) {
      setMatchResults((prev) => ({ ...prev, [lineIdx]: [] }));
      return;
    }
    setMatchLoading((prev) => ({ ...prev, [lineIdx]: true }));
    try {
      const results = await api<MatchMed[]>(`/medicines/match?q=${encodeURIComponent(query)}`);
      setMatchResults((prev) => ({ ...prev, [lineIdx]: results }));
    } catch {
      // silent
    } finally {
      setMatchLoading((prev) => ({ ...prev, [lineIdx]: false }));
    }
  };

  const onQueryChange = (lineIdx: number, text: string) => {
    setMatchQuery((prev) => ({ ...prev, [lineIdx]: text }));
    if (searchTimers.current[lineIdx]) clearTimeout(searchTimers.current[lineIdx]);
    searchTimers.current[lineIdx] = setTimeout(() => searchMedicine(lineIdx, text), 400);
  };

  const selectMedicine = (lineIdx: number, med: MatchMed) => {
    setImportLines((prev) =>
      prev.map((l, i) =>
        i === lineIdx
          ? { ...l, medicine_id: med.id, medicine_name: med.name, mrp: med.mrp ?? l.price * 1.2, matched: true }
          : l
      )
    );
    setMatchResults((prev) => ({ ...prev, [lineIdx]: [] }));
    setMatchQuery((prev) => ({ ...prev, [lineIdx]: med.name }));
  };

  const updateLineField = (lineIdx: number, field: keyof ImportLine, value: string | number) => {
    setImportLines((prev) =>
      prev.map((l, i) => (i === lineIdx ? { ...l, [field]: value } : l))
    );
  };

  const importPurchase = async () => {
    const unmatched = importLines.filter((l) => !l.medicine_id);
    if (unmatched.length > 0) {
      Alert.alert(
        "Unmatched Lines",
        `${unmatched.length} line(s) have no medicine selected. Skip and import only matched lines?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Skip Unmatched", onPress: () => doImport(importLines.filter((l) => l.medicine_id !== null)) },
        ]
      );
      return;
    }
    await doImport(importLines);
  };

  const doImport = async (lines: ImportLine[]) => {
    if (lines.length === 0) { Alert.alert("Nothing to import"); return; }
    setImporting(true);
    try {
      const payload = {
        lines: lines.map((l) => ({
          medicine_id: l.medicine_id!,
          medicine_name: l.medicine_name,
          batch_no: l.batch_no || "SCAN",
          expiry: l.expiry || "",
          quantity: Number(l.qty) || 1,
          purchase_price: Number(l.price) || 0,
          mrp: Number(l.mrp) || 0,
        })),
      };
      const resp = await api<ImportResp>("/purchases/from-scan", { method: "POST", body: payload });
      setStep("done");
      Alert.alert(
        "Imported!",
        `${resp.lines_imported} line(s) imported. Total ₹${resp.total.toLocaleString("en-IN")}.\nPurchase ID: ${resp.purchase_id.slice(0, 8)}…`,
        [{ text: "Done", onPress: () => router.replace("/(tabs)/purchases" as any) }]
      );
    } catch (e: unknown) {
      Alert.alert("Import failed", (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const allMatched = importLines.length > 0 && importLines.every((l) => l.matched);

  return (
    <SafeAreaView style={[styles.root, isDesktop && styles.rootDesktop]} edges={["top"]}>
      <View style={isDesktop ? styles.desktopCol : { flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          if (step !== "upload") { setStep("upload"); return; }
          if (router.canGoBack()) router.back();
          else router.replace("/(tabs)/home" as any);
        }} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Scan Invoice</Text>
        {step !== "upload" && (
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>
              {step === "review" ? "Step 1/2" : step === "match" ? "Step 2/2" : "Done"}
            </Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ===== UPLOAD STEP ===== */}
        {step === "upload" && (
          <>
            <View style={styles.uploadCard}>
              <Text style={styles.cardTitle}>Upload Supplier Invoice</Text>
              <Text style={styles.cardDesc}>
                Upload a PDF or photo of your supplier invoice. Text PDFs parse instantly; scanned images use OCR.
              </Text>
              <View style={styles.uploadBtns}>
                <TouchableOpacity style={styles.uploadBtn} onPress={pickDocument}>
                  <Feather name="file-text" size={22} color={COLORS.primary} />
                  <Text style={styles.uploadBtnLabel}>PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.uploadBtn} onPress={pickImage}>
                  <Feather name="image" size={22} color={COLORS.primary} />
                  <Text style={styles.uploadBtnLabel}>Gallery</Text>
                </TouchableOpacity>
                {Platform.OS !== "web" && (
                  <TouchableOpacity style={styles.uploadBtn} onPress={takePhoto}>
                    <Feather name="camera" size={22} color={COLORS.primary} />
                    <Text style={styles.uploadBtnLabel}>Camera</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {scanning && (
              <View style={styles.scanningCard}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.scanningText}>Extracting text from invoice…</Text>
              </View>
            )}

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>HOW IT WORKS</Text>
              {[
                "Upload a PDF or photo of your supplier invoice",
                "Review detected lines and select the ones to import",
                "Match each line to a medicine in your catalog",
                "Auto-import creates a purchase and updates stock",
              ].map((t, i) => (
                <View key={i} style={styles.infoRow}>
                  <View style={styles.stepCircle}><Text style={styles.stepNum}>{i + 1}</Text></View>
                  <Text style={styles.infoText}>{t}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ===== REVIEW STEP ===== */}
        {step === "review" && result && (
          <>
            <View style={[styles.statusCard, { borderColor: result.ocr_available ? "#86EFAC" : "#FDE68A" }]}>
              <Feather
                name={result.ocr_available ? "check-circle" : "alert-triangle"}
                size={16}
                color={result.ocr_available ? "#16A34A" : "#D97706"}
              />
              <Text style={[styles.statusText, { color: result.ocr_available ? "#16A34A" : "#D97706" }]}>
                {result.note}
              </Text>
            </View>

            {result.supplier_hint && (
              <View style={styles.supplierCard}>
                <Feather name="truck" size={14} color={COLORS.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.supplierLabel}>SUPPLIER DETECTED</Text>
                  <Text style={styles.supplierName}>{result.supplier_hint}</Text>
                </View>
              </View>
            )}

            {result.parsed_lines.length > 0 ? (
              <View style={styles.linesCard}>
                <View style={styles.linesHeader}>
                  <Text style={styles.linesTitle}>Detected Lines ({result.parsed_lines.length})</Text>
                  <TouchableOpacity onPress={() => {
                    const all = new Set(result.parsed_lines.map((_, i) => i));
                    setSelectedLines(selectedLines.size === all.size ? new Set() : all);
                  }}>
                    <Text style={styles.selectAllText}>
                      {selectedLines.size === result.parsed_lines.length ? "Deselect All" : "Select All"}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.linesHint}>Tap lines to select them for import</Text>
                {result.parsed_lines.map((line, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.lineRow, selectedLines.has(i) && styles.lineRowSelected]}
                    onPress={() => toggleLine(i)}
                  >
                    <View style={[styles.lineCheck, selectedLines.has(i) && styles.lineCheckActive]}>
                      {selectedLines.has(i) && <Feather name="check" size={11} color={COLORS.white} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lineRaw} numberOfLines={2}>{line.raw}</Text>
                      <View style={styles.lineHints}>
                        {line.qty_hint !== null && (
                          <Text style={styles.hintChip}>Qty: {line.qty_hint}</Text>
                        )}
                        {line.price_hint !== null && (
                          <Text style={styles.hintChip}>₹{line.price_hint}</Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  style={[styles.nextBtn, selectedLines.size === 0 && { opacity: 0.4 }]}
                  onPress={proceedToMatch}
                  disabled={selectedLines.size === 0}
                >
                  <Text style={styles.nextBtnText}>
                    Match Medicines ({selectedLines.size} lines) →
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Feather name="file-minus" size={28} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>No parseable lines found. Try a cleaner image or text-based PDF.</Text>
              </View>
            )}
          </>
        )}

        {/* ===== MATCH STEP ===== */}
        {step === "match" && (
          <>
            <View style={styles.matchHeaderCard}>
              <Feather name="link" size={16} color={COLORS.primary} />
              <Text style={styles.matchHeaderText}>
                Match each invoice line to a medicine in your catalog. Search by name or generic.
              </Text>
            </View>

            {importLines.map((line, idx) => (
              <View key={idx} style={[styles.matchCard, line.matched && styles.matchCardDone]}>
                <View style={styles.matchCardHeader}>
                  <View style={[styles.matchStatus, line.matched && styles.matchStatusDone]}>
                    <Feather name={line.matched ? "check" : "circle"} size={12}
                      color={line.matched ? COLORS.white : COLORS.textMuted} />
                  </View>
                  <Text style={styles.matchRaw} numberOfLines={1}>{line.raw}</Text>
                </View>

                {/* Medicine search */}
                <Text style={styles.fieldLabel}>Medicine *</Text>
                <View style={styles.searchRow}>
                  <TextInput
                    style={[styles.searchInput, line.matched && { borderColor: "#86EFAC" }]}
                    value={matchQuery[idx] ?? ""}
                    onChangeText={(t) => {
                      onQueryChange(idx, t);
                      if (line.matched) {
                        updateLineField(idx, "medicine_id", "");
                        updateLineField(idx, "medicine_name", "");
                        setImportLines((prev) => prev.map((l, i) => i === idx ? { ...l, matched: false } : l));
                      }
                    }}
                    placeholder="Search medicine…"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  {matchLoading[idx] && (
                    <ActivityIndicator size="small" color={COLORS.primary} style={{ marginLeft: 8 }} />
                  )}
                </View>

                {(matchResults[idx]?.length ?? 0) > 0 && (
                  <View style={styles.dropdownList}>
                    {matchResults[idx].map((med) => (
                      <TouchableOpacity
                        key={med.id}
                        style={styles.dropdownItem}
                        onPress={() => selectMedicine(idx, med)}
                      >
                        <Text style={styles.dropdownName}>{med.name}</Text>
                        {med.generic ? <Text style={styles.dropdownSub}>{med.generic}</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Qty / Price / Batch / Expiry row */}
                <View style={styles.fieldsGrid}>
                  <View style={styles.fieldCell}>
                    <Text style={styles.fieldLabel}>Qty</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={String(line.qty)}
                      onChangeText={(t) => updateLineField(idx, "qty", parseInt(t, 10) || 0)}
                      keyboardType="numeric"
                      placeholder="1"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                  <View style={styles.fieldCell}>
                    <Text style={styles.fieldLabel}>Purchase ₹</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={String(line.price)}
                      onChangeText={(t) => updateLineField(idx, "price", parseFloat(t) || 0)}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                  <View style={styles.fieldCell}>
                    <Text style={styles.fieldLabel}>MRP ₹</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={String(line.mrp)}
                      onChangeText={(t) => updateLineField(idx, "mrp", parseFloat(t) || 0)}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                </View>
                <View style={styles.fieldsGrid}>
                  <View style={styles.fieldCell}>
                    <Text style={styles.fieldLabel}>Batch No</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={line.batch_no}
                      onChangeText={(t) => updateLineField(idx, "batch_no", t)}
                      placeholder="SCAN"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                  <View style={[styles.fieldCell, { flex: 2 }]}>
                    <Text style={styles.fieldLabel}>Expiry (YYYY-MM)</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={line.expiry}
                      onChangeText={(t) => updateLineField(idx, "expiry", t)}
                      placeholder="2026-12"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                </View>
              </View>
            ))}

            <View style={styles.importSummaryCard}>
              <Text style={styles.importSummaryText}>
                {importLines.filter((l) => l.matched).length}/{importLines.length} matched
              </Text>
              {!allMatched && (
                <Text style={styles.importSummaryHint}>Unmatched lines will be skipped on import.</Text>
              )}
            </View>

            <TouchableOpacity
              style={[styles.importBtn, importing && { opacity: 0.6 }]}
              onPress={importPurchase}
              disabled={importing}
            >
              {importing
                ? <ActivityIndicator color={COLORS.white} />
                : (
                  <>
                    <Feather name="download" size={20} color={COLORS.white} />
                    <Text style={styles.importBtnText}>Auto-Import as Purchase</Text>
                  </>
                )
              }
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  rootDesktop: { backgroundColor: "#F0F2F8" },
  desktopCol: {
    flex: 1,
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    backgroundColor: COLORS.surface,
  },
  header: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    padding: SPACING.lg, backgroundColor: COLORS.white,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: COLORS.text },
  stepBadge: {
    backgroundColor: "#EFF6FF", borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
  },
  stepBadgeText: { fontSize: 11, fontWeight: "700", color: COLORS.primary },
  scroll: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 },
  uploadCard: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, gap: SPACING.md,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  cardDesc: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  uploadBtns: { flexDirection: "row", gap: SPACING.md },
  uploadBtn: {
    flex: 1, alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  uploadBtnLabel: { fontSize: 12, fontWeight: "700", color: COLORS.primary },
  scanningCard: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg,
  },
  scanningText: { fontSize: 14, color: COLORS.textSecondary },
  infoCard: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, gap: SPACING.md,
  },
  infoTitle: { fontSize: 11, fontWeight: "700", color: COLORS.textMuted, letterSpacing: 1 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm },
  stepCircle: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  stepNum: { fontSize: 11, fontWeight: "800", color: COLORS.primary },
  infoText: { flex: 1, fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  statusCard: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, padding: SPACING.md,
  },
  statusText: { flex: 1, fontSize: 13, fontWeight: "600" },
  supplierCard: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    backgroundColor: "#EFF6FF", borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: "#BFDBFE", padding: SPACING.md,
  },
  supplierLabel: { fontSize: 10, fontWeight: "800", color: COLORS.primary, letterSpacing: 1 },
  supplierName: { fontSize: 14, fontWeight: "700", color: COLORS.text, marginTop: 2 },
  linesCard: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, gap: SPACING.sm,
  },
  linesHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  linesTitle: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  selectAllText: { fontSize: 13, fontWeight: "700", color: COLORS.primary },
  linesHint: { fontSize: 11, color: COLORS.textMuted },
  lineRow: {
    flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm,
    padding: SPACING.sm, borderRadius: RADIUS.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  lineRowSelected: { borderColor: COLORS.primary, backgroundColor: "#EFF6FF" },
  lineCheck: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
  },
  lineCheckActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  lineRaw: { fontSize: 12, color: COLORS.text },
  lineHints: { flexDirection: "row", gap: 4, marginTop: 4 },
  hintChip: {
    fontSize: 10, fontWeight: "700", color: COLORS.primary,
    backgroundColor: "#EFF6FF", borderRadius: RADIUS.sm,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  nextBtn: {
    marginTop: SPACING.sm, backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md, minHeight: 48,
    alignItems: "center", justifyContent: "center",
  },
  nextBtnText: { color: COLORS.white, fontWeight: "700", fontSize: 15 },
  emptyCard: {
    alignItems: "center", gap: SPACING.md, padding: SPACING.xl,
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  emptyText: { fontSize: 14, color: COLORS.textMuted, textAlign: "center" },
  matchHeaderCard: {
    flexDirection: "row", gap: SPACING.sm, alignItems: "flex-start",
    backgroundColor: "#EFF6FF", borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: "#BFDBFE", padding: SPACING.md,
  },
  matchHeaderText: { flex: 1, fontSize: 13, color: COLORS.primary, lineHeight: 18 },
  matchCard: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, gap: SPACING.sm,
  },
  matchCardDone: { borderColor: "#86EFAC" },
  matchCardHeader: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  matchStatus: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center",
  },
  matchStatusDone: { backgroundColor: "#16A34A", borderColor: "#16A34A" },
  matchRaw: { flex: 1, fontSize: 12, color: COLORS.textSecondary, fontStyle: "italic" },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: COLORS.textMuted, letterSpacing: 0.5 },
  searchRow: { flexDirection: "row", alignItems: "center" },
  searchInput: {
    flex: 1, minHeight: 44, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm, fontSize: 14, color: COLORS.text,
  },
  dropdownList: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm,
    backgroundColor: COLORS.white, overflow: "hidden",
  },
  dropdownItem: {
    padding: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  dropdownName: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  dropdownSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  fieldsGrid: { flexDirection: "row", gap: SPACING.sm },
  fieldCell: { flex: 1 },
  fieldInput: {
    minHeight: 40, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm, fontSize: 13, color: COLORS.text,
  },
  importSummaryCard: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
    alignItems: "center", gap: 4,
  },
  importSummaryText: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  importSummaryHint: { fontSize: 12, color: COLORS.textMuted },
  importBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
    minHeight: 56, alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 10,
  },
  importBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 16 },
});
