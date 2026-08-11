import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, FlatList, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { alertMsg } from "@/src/dialog";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

type Medicine = { id: string; name: string; brand: string; strength: string; pack: string; mrp: number };
type Batch = { id: string; batch_no: string; expiry: string; quantity: number; mrp: number };

function buildLabelHtml(med: Medicine, batch: Batch, count: number, shopName: string): string {
  // One label = 50mm × 25mm at 96dpi ≈ 189×94px. Print in a 3-column grid.
  const rupee = (n: number) => `₹${n.toFixed(2)}`;
  const mrp = batch.mrp || med.mrp;

  // Simple Code 128 barcode via SVG bars (character set B encoding)
  function code128Bars(text: string): string {
    const PATTERNS: Record<number, string> = {
      32: "11011001100", 33: "11001101100", 34: "11001100110", 35: "10010011000",
      36: "10010001100", 37: "10001001100", 38: "10011001000", 39: "10011000100",
      40: "10001100100", 41: "11001001000", 42: "11001000100", 43: "11000100100",
      44: "10110011100", 45: "10011011100", 46: "10011001110", 47: "10111001100",
      48: "10011101100", 49: "10011100110", 50: "11001110010", 51: "11001011100",
      52: "11001001110", 53: "11011100100", 54: "11001110100", 55: "11101101110",
      56: "11101001100", 57: "11100101100", 58: "11100100110", 59: "11101100100",
      60: "11100110100", 61: "11100110010", 62: "11011011000", 63: "11011000110",
      64: "11000110110", 65: "10100011000", 66: "10001011000", 67: "10001000110",
      68: "10110001000", 69: "10001101000", 70: "10001100010", 71: "11010001000",
      72: "11000101000", 73: "11000100010", 74: "10110111000", 75: "10110001110",
      76: "10001101110", 77: "10111011000", 78: "10111000110", 79: "10001110110",
      80: "11101110110", 81: "11010001110", 82: "11000101110", 83: "11011101000",
      84: "11011100010", 85: "11011101110", 86: "11101011000", 87: "11101000110",
      88: "11100010110", 89: "11101101000", 90: "11101100010",
    };
    const START_B = "11010010000";
    const STOP = "1100011101011";
    const chars = text.split("").map((c) => c.charCodeAt(0));
    let checksum = 104; // START B value
    const patterns = chars.map((c, i) => {
      checksum += c * (i + 1);
      return PATTERNS[c] ?? "10110001000"; // fallback
    });
    checksum = checksum % 103;
    const checkPat = PATTERNS[checksum + 32] ?? PATTERNS[32];

    let x = 6;
    let bars = "";
    const allPatterns = [START_B, ...patterns, checkPat, STOP];
    for (const pat of allPatterns) {
      for (let i = 0; i < pat.length; i++) {
        if (pat[i] === "1") {
          bars += `<rect x="${x}" y="0" width="1" height="30" fill="black"/>`;
        }
        x += 1;
      }
      x += 1;
    }
    const width = x + 6;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="30" viewBox="0 0 ${width} 30">${bars}</svg>`;
  }

  const barcodeText = batch.batch_no.replace(/[^\x20-\x5A]/g, "X").slice(0, 20);
  const svgBarcode = code128Bars(barcodeText);

  const oneLabel = `
    <div class="label">
      <div class="shop">${shopName}</div>
      <div class="medname">${med.name.slice(0, 28)}</div>
      <div class="meta">${med.strength ? med.strength + " · " : ""}${med.pack || ""}</div>
      <div class="barcode">${svgBarcode}</div>
      <div class="barcode-text">${batch.batch_no}</div>
      <div class="bottom-row">
        <span class="expiry">Exp: ${batch.expiry}</span>
        <span class="mrp">MRP: ${rupee(mrp)}</span>
      </div>
    </div>`;

  const labels = Array(count).fill(oneLabel).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; background: white; }
  .grid { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px; }
  .label {
    width: 189px; border: 1px solid #333; padding: 3px 4px;
    page-break-inside: avoid; background: white;
  }
  .shop { font-size: 6px; color: #666; text-align: center; margin-bottom: 1px; }
  .medname { font-size: 8px; font-weight: bold; color: #000; margin-bottom: 1px; white-space: nowrap; overflow: hidden; }
  .meta { font-size: 6px; color: #333; margin-bottom: 2px; }
  .barcode { display: flex; justify-content: center; margin: 2px 0; }
  .barcode svg { height: 22px; width: auto; }
  .barcode-text { font-size: 5px; text-align: center; letter-spacing: 1px; margin-bottom: 2px; font-family: monospace; }
  .bottom-row { display: flex; justify-content: space-between; }
  .expiry, .mrp { font-size: 7px; font-weight: bold; }
  .mrp { color: #000; }
  .expiry { color: #c00; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<div class="grid">${labels}</div>
</body>
</html>`;
}

export default function BarcodeLabels() {
  const router = useRouter();
  const [medQ, setMedQ] = useState("");
  const [meds, setMeds] = useState<Medicine[]>([]);
  const [selectedMed, setSelectedMed] = useState<Medicine | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [labelCount, setLabelCount] = useState("10");
  const [shopName, setShopName] = useState("Pharma Counter");
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [showMedPicker, setShowMedPicker] = useState(false);

  useFocusEffect(useCallback(() => {
    api<{ name: string }>("/shop").then((s) => setShopName(s.name)).catch(() => {});
  }, []));

  const searchMeds = async (q: string) => {
    setMedQ(q);
    if (q.length < 2) { setMeds([]); return; }
    setLoading(true);
    try {
      const data = await api<Medicine[]>(`/medicines?q=${encodeURIComponent(q)}&limit=20`);
      setMeds(data);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const pickMed = async (m: Medicine) => {
    setSelectedMed(m);
    setSelectedBatch(null);
    setShowMedPicker(false);
    try {
      const data = await api<Batch[]>(`/batches/${m.id}`);
      setBatches(data.filter((b) => b.quantity > 0));
    } catch { setBatches([]); }
  };

  const printLabels = async () => {
    if (!selectedMed || !selectedBatch) {
      alertMsg("Required", "Select a medicine and batch first");
      return;
    }
    const count = Math.max(1, Math.min(100, parseInt(labelCount, 10) || 10));
    setPrinting(true);
    try {
      const html = buildLabelHtml(selectedMed, selectedBatch, count, shopName);
      if (Platform.OS === "web") {
        await Print.printAsync({ html });
      } else {
        const { uri } = await Print.printToFileAsync({ html, base64: false });
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Barcode Labels — ${selectedMed.name}` });
      }
    } catch (e: any) {
      alertMsg("Error", e?.message || "Could not generate labels");
    } finally { setPrinting(false); }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Barcode Labels</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 }}>
        {/* Medicine picker */}
        <Text style={styles.label}>MEDICINE</Text>
        <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowMedPicker(true)}>
          <Feather name="search" size={16} color={COLORS.textMuted} />
          <Text style={[styles.pickerText, selectedMed && { color: COLORS.text }]}>
            {selectedMed ? selectedMed.name : "Search and select medicine…"}
          </Text>
          <Feather name="chevron-down" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>

        {/* Batch picker */}
        {selectedMed && batches.length > 0 && (
          <>
            <Text style={styles.label}>BATCH</Text>
            {batches.map((b) => (
              <TouchableOpacity
                key={b.id}
                style={[styles.batchRow, selectedBatch?.id === b.id && styles.batchRowActive]}
                onPress={() => setSelectedBatch(b)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.batchNo}>Batch {b.batch_no}</Text>
                  <Text style={styles.batchMeta}>Exp {b.expiry} · Qty {b.quantity} · ₹{b.mrp.toFixed(2)}</Text>
                </View>
                {selectedBatch?.id === b.id && <Feather name="check-circle" size={18} color={COLORS.primary} />}
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Label count */}
        <Text style={styles.label}>NUMBER OF LABELS</Text>
        <TextInput
          style={styles.field}
          value={labelCount}
          onChangeText={setLabelCount}
          keyboardType="numeric"
          placeholder="10"
          placeholderTextColor={COLORS.textMuted}
        />

        {/* Preview info */}
        {selectedMed && selectedBatch && (
          <View style={styles.previewCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.previewName}>{selectedMed.name}</Text>
              <Text style={styles.previewMeta}>{selectedMed.strength} · {selectedMed.pack}</Text>
              <Text style={styles.previewMeta}>Batch {selectedBatch.batch_no} · Exp {selectedBatch.expiry}</Text>
              <Text style={styles.previewMrp}>MRP ₹{selectedBatch.mrp.toFixed(2)}</Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countNum}>{labelCount}</Text>
              <Text style={styles.countLabel}>labels</Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.printBtn, (printing || !selectedMed || !selectedBatch) && { opacity: 0.5 }]}
          onPress={printLabels}
          disabled={printing || !selectedMed || !selectedBatch}
        >
          {printing ? <ActivityIndicator color={COLORS.white} size="small" /> : <Feather name="printer" size={18} color={COLORS.white} />}
          <Text style={styles.printBtnText}>Generate & Print / Share PDF</Text>
        </TouchableOpacity>

        <View style={styles.note}>
          <Feather name="info" size={14} color={COLORS.textMuted} />
          <Text style={styles.noteText}>Labels are 50 × 25 mm (3 per row). Print on sticker paper or share the PDF to your label printer app.</Text>
        </View>
      </ScrollView>

      {/* Medicine search modal */}
      <Modal visible={showMedPicker} animationType="slide" transparent onRequestClose={() => setShowMedPicker(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Search Medicine</Text>
              <TouchableOpacity onPress={() => setShowMedPicker(false)}><Feather name="x" size={22} color={COLORS.text} /></TouchableOpacity>
            </View>
            <View style={styles.searchRow}>
              <Feather name="search" size={16} color={COLORS.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Type to search…"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
                value={medQ}
                onChangeText={searchMeds}
              />
            </View>
            {loading ? <ActivityIndicator style={{ marginTop: 20 }} color={COLORS.primary} /> : (
              <FlatList
                data={meds}
                keyExtractor={(m) => m.id}
                contentContainerStyle={{ paddingBottom: 40 }}
                ListEmptyComponent={<Text style={{ textAlign: "center", color: COLORS.textMuted, marginTop: 20 }}>Type to search medicines</Text>}
                renderItem={({ item: m }) => (
                  <TouchableOpacity style={styles.medRow} onPress={() => pickMed(m)}>
                    <Text style={styles.medName}>{m.name}</Text>
                    <Text style={styles.medMeta}>{m.strength} · {m.pack}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.lg, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: COLORS.text },
  label: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted },
  pickerBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 14 },
  pickerText: { flex: 1, fontSize: 14, color: COLORS.textMuted },
  batchRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.white, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  batchRowActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  batchNo: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  batchMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  field: { minHeight: 46, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, backgroundColor: COLORS.surface, fontSize: 15, color: COLORS.text },
  previewCard: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, gap: SPACING.md },
  previewName: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  previewMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  previewMrp: { fontSize: 14, fontWeight: "800", color: COLORS.primary, marginTop: 4 },
  countBadge: { alignItems: "center", backgroundColor: COLORS.primaryLight, padding: SPACING.md, borderRadius: RADIUS.md, minWidth: 60 },
  countNum: { fontSize: 26, fontWeight: "900", color: COLORS.primary },
  countLabel: { fontSize: 10, color: COLORS.primary, fontWeight: "700" },
  printBtn: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 16 },
  printBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 15 },
  note: { flexDirection: "row", gap: 8, padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border },
  noteText: { flex: 1, fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "80%" },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sheetTitle: { fontSize: 17, fontWeight: "800", color: COLORS.text },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 6, margin: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.sm },
  searchInput: { flex: 1, height: 44, fontSize: 15, color: COLORS.text },
  medRow: { paddingHorizontal: SPACING.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  medName: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  medMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
});
