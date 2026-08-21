import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  scanPrinters,
  stopScan,
  getSavedPrinter,
  savePrinter,
  clearSavedPrinter,
} from "@/src/thermal/PrinterService";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

type ScannedDevice = {
  id: string;
  name: string;
};

export default function PrinterSettings() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<ScannedDevice[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    getSavedPrinter().then((d) => setSavedId(d?.id ?? null));
    return () => { stopScan(); };
  }, []);

  async function startScan() {
    if (Platform.OS === "web") {
      Alert.alert("Not available", "Bluetooth printer scanning requires the mobile app.");
      return;
    }
    seenRef.current.clear();
    setDevices([]);
    setScanning(true);
    try {
      await scanPrinters((device) => {
        if (seenRef.current.has(device.id)) return;
        seenRef.current.add(device.id);
        setDevices((prev) => [...prev, { id: device.id, name: device.name ?? device.id }]);
      });
    } catch (e: any) {
      Alert.alert("Scan error", e?.message ?? "Bluetooth scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function pair(device: ScannedDevice) {
    await savePrinter({ id: device.id, name: device.name });
    setSavedId(device.id);
    Alert.alert("Printer saved", `"${device.name}" will be used for printing.`);
  }

  async function unpair() {
    await clearSavedPrinter();
    setSavedId(null);
  }

  return (
    <SafeAreaView style={[styles.root, isDesktop && styles.rootDesktop]} edges={["top"]}>
      <View style={isDesktop ? styles.desktopCol : { flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Printer Settings</Text>
      </View>

      {savedId && (
        <View style={styles.savedCard}>
          <Feather name="check-circle" size={20} color={COLORS.success} />
          <View style={styles.savedText}>
            <Text style={styles.savedLabel}>Paired Printer</Text>
            <Text style={styles.savedId}>{savedId}</Text>
          </View>
          <TouchableOpacity onPress={unpair} style={styles.unpairBtn}>
            <Text style={styles.unpairText}>Remove</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.scanRow}>
        <Text style={styles.sectionTitle}>Nearby Bluetooth Printers</Text>
        <TouchableOpacity onPress={startScan} style={styles.scanBtn} disabled={scanning}>
          {scanning
            ? <ActivityIndicator color={COLORS.white} size="small" />
            : <Feather name="radio" size={16} color={COLORS.white} />}
          <Text style={styles.scanBtnText}>{scanning ? "Scanning…" : "Scan"}</Text>
        </TouchableOpacity>
      </View>

      {scanning && devices.length === 0 && (
        <Text style={styles.hint}>Looking for BLE printers… (10 sec)</Text>
      )}

      <FlatList
        data={devices}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !scanning ? (
            <Text style={styles.hint}>Tap Scan to discover printers.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[styles.deviceRow, item.id === savedId && styles.deviceRowActive]}>
            <Feather name="printer" size={20} color={item.id === savedId ? COLORS.primary : COLORS.textMuted} />
            <View style={styles.deviceInfo}>
              <Text style={styles.deviceName}>{item.name}</Text>
              <Text style={styles.deviceId}>{item.id}</Text>
            </View>
            {item.id === savedId ? (
              <View style={styles.pairedBadge}>
                <Text style={styles.pairedBadgeText}>Paired</Text>
              </View>
            ) : (
              <TouchableOpacity onPress={() => pair(item)} style={styles.pairBtn}>
                <Text style={styles.pairBtnText}>Use This</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />
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
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  back: { padding: 4 },
  title: { fontSize: 18, fontWeight: "700", color: COLORS.text },
  savedCard: {
    margin: SPACING.lg,
    padding: SPACING.md,
    backgroundColor: COLORS.successBg,
    borderRadius: RADIUS.md,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  savedText: { flex: 1 },
  savedLabel: { fontSize: 13, fontWeight: "700", color: COLORS.success },
  savedId: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  unpairBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.dangerBg,
  },
  unpairText: { fontSize: 12, fontWeight: "700", color: COLORS.danger },
  scanRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  sectionTitle: { flex: 1, fontSize: 14, fontWeight: "700", color: COLORS.text },
  scanBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    minWidth: 90,
    justifyContent: "center",
  },
  scanBtnText: { color: COLORS.white, fontWeight: "700", fontSize: 13 },
  hint: {
    textAlign: "center",
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.xl,
  },
  list: { padding: SPACING.lg, gap: SPACING.sm },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  deviceRowActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  deviceId: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  pairedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLight,
  },
  pairedBadgeText: { fontSize: 12, fontWeight: "700", color: COLORS.primary },
  pairBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  pairBtnText: { fontSize: 12, fontWeight: "700", color: COLORS.primary },
});
