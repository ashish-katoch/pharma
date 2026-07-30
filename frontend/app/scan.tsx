import { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import * as Haptics from "expo-haptics";
import { useCart, Medicine } from "@/src/cart";
import { searchMedicines } from "@/src/catalog";
import { deliverScan } from "@/src/scanBus";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

const SCAN_TYPES = [
  "ean13",
  "ean8",
  "upc_a",
  "upc_e",
  "code128",
  "code39",
  "code93",
  "itf14",
  "codabar",
  "qr",
] as const;

// Ignore repeat reads of the same code within this window (the camera fires
// continuously while a barcode is in frame).
const COOLDOWN_MS = 1800;

type Mode = "cart" | "return";

type Toast = { text: string; tone: "success" | "warning" | "danger" } | null;

export default function Scan() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: Mode }>();
  const mode: Mode = params.mode === "return" ? "return" : "cart";
  const cart = useCart();

  const [permission, requestPermission] = useCameraPermissions();
  const [count, setCount] = useState(0);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);

  const lastCode = useRef<string>("");
  const lastAt = useRef<number>(0);
  const handling = useRef(false);

  const flashToast = useCallback((t: Toast) => {
    setToast(t);
    setTimeout(() => setToast(null), 1600);
  }, []);

  const onScanned = useCallback(
    async (result: BarcodeScanningResult) => {
      const code = (result?.data || "").trim();
      if (!code) return;

      const nowMs = Date.now();
      // Debounce: same code within cooldown, or a scan already in flight.
      if (handling.current) return;
      if (code === lastCode.current && nowMs - lastAt.current < COOLDOWN_MS) return;
      lastCode.current = code;
      lastAt.current = nowMs;

      if (mode === "return") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        deliverScan(code);
        router.back();
        return;
      }

      // cart mode — look the code up and add to the running bill.
      handling.current = true;
      setBusy(true);
      try {
        const { items } = await searchMedicines(code);
        const match =
          items.find((m: any) => (m as any).barcode && (m as any).barcode === code) ||
          (items.length === 1 ? items[0] : undefined);

        if (!match) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          flashToast({ text: `No medicine for ${code}`, tone: "warning" });
          return;
        }
        if ((match.total_stock ?? 0) <= 0) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          flashToast({ text: `${match.name} — out of stock`, tone: "danger" });
          return;
        }
        cart.add(match as Medicine);
        setCount((c) => c + 1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        flashToast({ text: `Added ${match.name}`, tone: "success" });
      } catch {
        flashToast({ text: "Lookup failed", tone: "danger" });
      } finally {
        setBusy(false);
        // brief gate so the same frame doesn't double-fire
        setTimeout(() => {
          handling.current = false;
        }, 400);
      }
    },
    [cart, flashToast, mode, router],
  );

  // Permission gate.
  if (!permission) {
    return (
      <SafeAreaView style={styles.center} edges={["top", "bottom"]}>
        <ActivityIndicator color={COLORS.white} />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center} edges={["top", "bottom"]}>
        <Feather name="camera-off" size={44} color={COLORS.textMuted} />
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permBody}>
          Allow the camera to scan medicine barcodes into the bill.
        </Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission} testID="scan-grant">
          <Text style={styles.permBtnText}>Grant permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.permCancel} onPress={() => router.back()}>
          <Text style={styles.permCancelText}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const toneColor =
    toast?.tone === "success"
      ? COLORS.success
      : toast?.tone === "warning"
        ? COLORS.warning
        : COLORS.danger;

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: SCAN_TYPES as unknown as any }}
        onBarcodeScanned={onScanned}
      />

      {/* dim overlay + reticle */}
      <SafeAreaView style={styles.overlay} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} testID="scan-close">
            <Feather name="x" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>
            {mode === "return" ? "Scan barcode" : "Scan to add"}
          </Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.reticleWrap}>
          <View style={styles.reticle} />
          <Text style={styles.hint}>
            {busy ? "Looking up…" : "Point at a barcode"}
          </Text>
        </View>

        {/* toast */}
        {toast && (
          <View style={[styles.toast, { borderColor: toneColor }]} testID="scan-toast">
            <Feather
              name={
                toast.tone === "success"
                  ? "check-circle"
                  : toast.tone === "warning"
                    ? "alert-circle"
                    : "x-circle"
              }
              size={18}
              color={toneColor}
            />
            <Text style={styles.toastText} numberOfLines={1}>{toast.text}</Text>
          </View>
        )}

        {mode === "cart" && (
          <View style={styles.bottomBar}>
            <View style={styles.countPill}>
              <Feather name="shopping-cart" size={16} color={COLORS.white} />
              <Text style={styles.countText}>{count} scanned</Text>
            </View>
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => router.back()}
              testID="scan-done"
            >
              <Feather name="check" size={20} color={COLORS.white} />
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {Platform.OS === "web" && (
          <Text style={styles.webNote}>
            On web, barcode scanning depends on the browser camera.
          </Text>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: {
    flex: 1,
    backgroundColor: "#0B1220",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.md,
    padding: SPACING.xl,
  },
  permTitle: { color: COLORS.white, fontSize: 18, fontWeight: "800" },
  permBody: { color: COLORS.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  permBtn: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
  },
  permBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 15 },
  permCancel: { padding: SPACING.md },
  permCancelText: { color: COLORS.textMuted, fontWeight: "600" },
  overlay: { flex: 1, justifyContent: "space-between" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.md,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
  reticleWrap: { alignItems: "center", gap: SPACING.md },
  reticle: {
    width: 260,
    height: 160,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.9)",
    borderRadius: RADIUS.lg,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  hint: { color: COLORS.white, fontSize: 14, fontWeight: "600" },
  toast: {
    position: "absolute",
    top: "50%",
    alignSelf: "center",
    marginTop: 120,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(15,23,42,0.92)",
    borderWidth: 1.5,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: RADIUS.pill,
    maxWidth: "82%",
  },
  toastText: { color: COLORS.white, fontSize: 14, fontWeight: "700", flexShrink: 1 },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderRadius: RADIUS.pill,
  },
  countText: { color: COLORS.white, fontWeight: "800", fontSize: 14 },
  doneBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
  },
  doneText: { color: COLORS.white, fontWeight: "800", fontSize: 15 },
  webNote: {
    position: "absolute",
    bottom: 4,
    alignSelf: "center",
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
  },
});
