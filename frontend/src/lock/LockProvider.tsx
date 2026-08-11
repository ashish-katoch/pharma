import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import * as Crypto from "expo-crypto";
import { storage } from "@/src/utils/storage";

const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const PIN_KEY = "pharma_lock_pin";
const LOCK_ENABLED_KEY = "pharma_lock_enabled";
const FAIL_COUNT_KEY = "pharma_lock_fail_count";
const LOCKOUT_UNTIL_KEY = "pharma_lock_until";
const PIN_SALT = "pharmaCounter::lockPin::v1";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 1000; // 30 s after 5 fails; escalates below

async function hashPin(pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, PIN_SALT + pin);
}

type LockContextValue = {
  locked: boolean;
  lockEnabled: boolean;
  hasPin: boolean;
  failedAttempts: number;
  lockedOutUntil: number | null;
  lock: () => void;
  unlock: () => void;
  setPin: (pin: string) => Promise<void>;
  clearPin: () => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  toggleLock: (enabled: boolean) => Promise<void>;
};

const LockCtx = createContext<LockContextValue | undefined>(undefined);

export function LockProvider({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [lockEnabled, setLockEnabled] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedOutUntil, setLockedOutUntil] = useState<number | null>(null);
  const lastActiveRef = useRef(Date.now());
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    (async () => {
      const enabled = await storage.secureGet(LOCK_ENABLED_KEY, null);
      const pin = await storage.secureGet(PIN_KEY, null);
      const fails = await storage.secureGet(FAIL_COUNT_KEY, null);
      const until = await storage.secureGet(LOCKOUT_UNTIL_KEY, null);
      const isEnabled = enabled === "true";
      const hasStoredPin = !!pin;
      setLockEnabled(isEnabled);
      setHasPin(hasStoredPin);
      if (fails) setFailedAttempts(parseInt(fails, 10) || 0);
      if (until) {
        const untilMs = parseInt(until, 10);
        if (untilMs > Date.now()) setLockedOutUntil(untilMs);
      }
      // Lock immediately on cold start so force-quit+reopen requires PIN entry.
      if (isEnabled && hasStoredPin) {
        setLocked(true);
      }
    })();
  }, []);

  const lock = useCallback(() => {
    if (lockEnabled) setLocked(true);
  }, [lockEnabled]);

  const unlock = useCallback(() => {
    setLocked(false);
    lastActiveRef.current = Date.now();
  }, []);

  // AppState-based idle timeout
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appStateRef.current === "active" && next !== "active") {
        lastActiveRef.current = Date.now();
      }
      if (next === "active" && lockEnabled && hasPin) {
        const elapsed = Date.now() - lastActiveRef.current;
        if (elapsed >= LOCK_TIMEOUT_MS) {
          setLocked(true);
        }
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [lockEnabled, hasPin]);

  const setPin = async (pin: string) => {
    const hashed = await hashPin(pin);
    await storage.secureSet(PIN_KEY, hashed);
    setHasPin(true);
  };

  const clearPin = async () => {
    await storage.secureRemove(PIN_KEY);
    await storage.secureRemove(LOCK_ENABLED_KEY);
    await storage.secureRemove(FAIL_COUNT_KEY);
    await storage.secureRemove(LOCKOUT_UNTIL_KEY);
    setHasPin(false);
    setLockEnabled(false);
    setLocked(false);
    setFailedAttempts(0);
    setLockedOutUntil(null);
  };

  const verifyPin = async (pin: string): Promise<boolean> => {
    const now = Date.now();
    if (lockedOutUntil && lockedOutUntil > now) return false;

    const stored = await storage.secureGet(PIN_KEY, null);
    const hashed = await hashPin(pin);
    const ok = stored === hashed;

    if (ok) {
      setFailedAttempts(0);
      setLockedOutUntil(null);
      await storage.secureRemove(FAIL_COUNT_KEY);
      await storage.secureRemove(LOCKOUT_UNTIL_KEY);
    } else {
      const next = failedAttempts + 1;
      setFailedAttempts(next);
      await storage.secureSet(FAIL_COUNT_KEY, String(next));
      if (next >= MAX_ATTEMPTS) {
        const delayMs = next >= 10 ? 5 * 60 * 1000 : LOCKOUT_MS;
        const until = now + delayMs;
        setLockedOutUntil(until);
        await storage.secureSet(LOCKOUT_UNTIL_KEY, String(until));
      }
    }
    return ok;
  };

  const toggleLock = async (enabled: boolean) => {
    await storage.secureSet(LOCK_ENABLED_KEY, enabled ? "true" : "false");
    setLockEnabled(enabled);
    if (!enabled) setLocked(false);
  };

  return (
    <LockCtx.Provider value={{ locked, lockEnabled, hasPin, failedAttempts, lockedOutUntil, lock, unlock, setPin, clearPin, verifyPin, toggleLock }}>
      {children}
    </LockCtx.Provider>
  );
}

export function useLock() {
  const ctx = useContext(LockCtx);
  if (!ctx) throw new Error("useLock must be inside LockProvider");
  return ctx;
}
