import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { PageShell } from "@/src/components/PageShell";
import { useLock } from "@/src/lock/LockProvider";

const PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

type Step = "menu" | "set-pin" | "confirm-pin";

export default function AppLockSetup() {
  const router = useRouter();
  const { lockEnabled, hasPin, setPin, clearPin, toggleLock } = useLock();
  const [step, setStep] = useState<Step>("menu");
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [current, setCurrent] = useState<"pin1" | "pin2">("pin1");

  const handleKey = (key: string) => {
    const setter = current === "pin1" ? setPin1 : setPin2;
    const val = current === "pin1" ? pin1 : pin2;
    if (key === "⌫") { setter(val.slice(0, -1)); return; }
    if (key === "" || val.length >= 4) return;
    const next = val + key;
    setter(next);
    if (next.length === 4) {
      if (current === "pin1") {
        setStep("confirm-pin");
        setCurrent("pin2");
      } else {
        if (pin1 !== next) {
          Alert.alert("Mismatch", "PINs don't match. Try again.");
          setPin1(""); setPin2(""); setCurrent("pin1"); setStep("set-pin");
        } else {
          setPin(pin1).then(async () => {
            await toggleLock(true);
            Alert.alert("PIN Set", "App lock is now enabled. The app will lock after 5 minutes of inactivity.");
            router.back();
          });
        }
      }
    }
  };

  const disableLock = () => {
    Alert.alert("Disable App Lock?", "The PIN and biometric lock will be removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disable", style: "destructive", onPress: async () => {
          await clearPin();
          router.back();
        }
      }
    ]);
  };

  const activePin = current === "pin1" ? pin1 : pin2;

  if (step === "set-pin" || step === "confirm-pin") {
    return (
      <SafeAreaView style={pinStyles.root} edges={["top"]}>
        <View style={pinStyles.header}>
          <TouchableOpacity onPress={() => { setStep("menu"); setPin1(""); setPin2(""); setCurrent("pin1"); }}>
            <Feather name="x" size={24} color={COLORS.white} />
          </TouchableOpacity>
        </View>
        <View style={pinStyles.inner}>
          <Text style={pinStyles.heading}>{step === "set-pin" ? "Set a 4-digit PIN" : "Confirm your PIN"}</Text>
          <Text style={pinStyles.sub}>{step === "set-pin" ? "You'll use this to unlock the app" : "Enter the same PIN again"}</Text>
          <View style={pinStyles.dots}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[pinStyles.dot, activePin.length > i && pinStyles.dotFilled]} />
            ))}
          </View>
          <View style={pinStyles.pad}>
            {PAD.map((key, idx) => (
              <TouchableOpacity key={idx} style={[pinStyles.key, key === "" && pinStyles.keyEmpty]} onPress={() => handleKey(key)} disabled={key === ""} activeOpacity={0.7}>
                <Text style={pinStyles.keyText}>{key}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <PageShell title="App Lock" showBack scrollable={false}>
      <View style={styles.content}>
        <View style={styles.card}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.md }}>
            <View style={styles.iconWrap}>
              <Feather name="lock" size={22} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Lock after 5 min idle</Text>
              <Text style={styles.cardSub}>Requires PIN or biometric to unlock</Text>
            </View>
            <Switch
              value={lockEnabled}
              onValueChange={async (v) => {
                if (v && !hasPin) {
                  setStep("set-pin");
                } else {
                  await toggleLock(v);
                }
              }}
              trackColor={{ true: COLORS.primary }}
            />
          </View>
        </View>

        {hasPin && (
          <>
            <TouchableOpacity style={styles.linkRow} onPress={() => { setPin1(""); setPin2(""); setCurrent("pin1"); setStep("set-pin"); }}>
              <Feather name="edit-3" size={18} color={COLORS.primary} />
              <Text style={styles.linkText}>Change PIN</Text>
              <Feather name="chevron-right" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.linkRow, { borderColor: COLORS.dangerBg }]} onPress={disableLock}>
              <Feather name="unlock" size={18} color={COLORS.danger} />
              <Text style={[styles.linkText, { color: COLORS.danger }]}>Remove PIN & Disable Lock</Text>
            </TouchableOpacity>
          </>
        )}

        {!hasPin && (
          <TouchableOpacity style={styles.setupBtn} onPress={() => { setPin1(""); setPin2(""); setCurrent("pin1"); setStep("set-pin"); }}>
            <Feather name="lock" size={18} color={COLORS.white} />
            <Text style={styles.setupBtnText}>Set up PIN</Text>
          </TouchableOpacity>
        )}

        <View style={styles.note}>
          <Feather name="info" size={14} color={COLORS.textMuted} />
          <Text style={styles.noteText}>
            Face ID / Fingerprint will be offered as an alternative if enrolled on this device. The app locks automatically after 5 minutes in the background.
          </Text>
        </View>
      </View>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.lg, gap: SPACING.md },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg },
  cardTitle: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  cardSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  iconWrap: { width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  linkRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  linkText: { flex: 1, fontSize: 15, fontWeight: "600", color: COLORS.text },
  setupBtn: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 14 },
  setupBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 15 },
  note: { flexDirection: "row", gap: 8, padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border },
  noteText: { flex: 1, fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
});

const pinStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.text },
  header: { padding: SPACING.lg, alignItems: "flex-end" },
  inner: { flex: 1, alignItems: "center", justifyContent: "center", gap: SPACING.lg, paddingHorizontal: SPACING.xl },
  heading: { fontSize: 22, fontWeight: "900", color: COLORS.white, letterSpacing: -0.3 },
  sub: { fontSize: 13, color: "#94A3B8" },
  dots: { flexDirection: "row", gap: 16, marginVertical: SPACING.sm },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: "#475569", backgroundColor: "transparent" },
  dotFilled: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pad: { flexDirection: "row", flexWrap: "wrap", width: 252, gap: 12, justifyContent: "center" },
  key: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#1E293B", alignItems: "center", justifyContent: "center" },
  keyEmpty: { backgroundColor: "transparent" },
  keyText: { fontSize: 24, fontWeight: "700", color: COLORS.white },
});
