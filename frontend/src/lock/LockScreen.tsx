import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as LocalAuthentication from "expo-local-authentication";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { useLock } from "./LockProvider";

const PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

export function LockScreen() {
  const { unlock, verifyPin, lockedOutUntil, failedAttempts } = useLock();
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [checking, setChecking] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (!lockedOutUntil) { setCountdown(0); return; }
    const tick = () => {
      const remaining = Math.ceil((lockedOutUntil - Date.now()) / 1000);
      setCountdown(Math.max(0, remaining));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockedOutUntil]);

  const tryBiometric = async () => {
    try {
      const hasHw = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHw || !enrolled) return;
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Verify your identity",
        cancelLabel: "Use PIN",
        disableDeviceFallback: false,
      });
      if (result.success) unlock();
    } catch {
      /* ignore */
    }
  };

  const handleKey = async (key: string) => {
    if (checking) return;
    if (key === "⌫") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (key === "") return;
    const next = pin + key;
    setPin(next);
    if (next.length === 4) {
      setChecking(true);
      const ok = await verifyPin(next);
      if (ok) {
        unlock();
      } else {
        setShake(true);
        setPin("");
        setTimeout(() => setShake(false), 600);
        const remaining = failedAttempts + 1;
        if (remaining >= 5) {
          Alert.alert("Too many attempts", "Wait before trying again.");
        } else {
          Alert.alert("Wrong PIN", `${5 - remaining} attempt${5 - remaining === 1 ? "" : "s"} remaining.`);
        }
      }
      setChecking(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.inner}>
        <Text style={styles.logo}>🔒</Text>
        <Text style={styles.heading}>App Locked</Text>
        {countdown > 0 ? (
          <Text style={styles.lockoutText}>Too many attempts — wait {countdown}s</Text>
        ) : (
          <Text style={styles.sub}>Enter your 4-digit PIN</Text>
        )}

        <View style={[styles.dots, shake && styles.dotShake]}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.dot, pin.length > i && styles.dotFilled]} />
          ))}
        </View>

        <View style={styles.pad}>
          {PAD.map((key, idx) => (
            <TouchableOpacity
              key={idx}
              style={[styles.key, key === "" && styles.keyEmpty]}
              onPress={() => handleKey(key)}
              disabled={key === "" || checking || countdown > 0}
              activeOpacity={0.7}
            >
              <Text style={styles.keyText}>{key}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.bioBtn} onPress={tryBiometric} disabled={countdown > 0}>
          <Text style={styles.bioBtnText}>Use Face ID / Fingerprint</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.text,
    zIndex: 9999,
    justifyContent: "center",
    alignItems: "center",
  },
  inner: { alignItems: "center", gap: SPACING.lg, paddingHorizontal: SPACING.xl },
  logo: { fontSize: 52 },
  heading: { fontSize: 26, fontWeight: "900", color: COLORS.white, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: "#94A3B8" },
  lockoutText: { fontSize: 14, color: "#EF4444", fontWeight: "700" },
  dots: { flexDirection: "row", gap: 16, marginVertical: SPACING.md },
  dotShake: { opacity: 0.4 },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#475569",
    backgroundColor: "transparent",
  },
  dotFilled: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pad: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 252,
    gap: 12,
    justifyContent: "center",
  },
  key: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  keyEmpty: { backgroundColor: "transparent" },
  keyText: { fontSize: 24, fontWeight: "700", color: COLORS.white },
  bioBtn: {
    marginTop: SPACING.lg,
    paddingVertical: 12,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: "#334155",
  },
  bioBtnText: { color: "#94A3B8", fontSize: 14, fontWeight: "600" },
});
