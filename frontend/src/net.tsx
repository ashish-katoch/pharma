// Connectivity signal for the offline-first layer.
//
// Exposes a single `online` boolean via context. Native uses expo-network polled
// on an interval + on app foreground; web uses navigator.onLine + online/offline
// events. We intentionally poll rather than rely on the native listener API so the
// behaviour is identical across expo-network versions and platforms.

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { AppState, Platform } from "react-native";
import * as Network from "expo-network";

type NetContextValue = {
  /** Best-effort "can we reach the backend right now" flag. Defaults to true. */
  online: boolean;
  /** Force an immediate connectivity check (e.g. before a manual sync). */
  check: () => Promise<boolean>;
};

const NetCtx = createContext<NetContextValue | undefined>(undefined);

const POLL_MS = 5000;

async function probe(): Promise<boolean> {
  if (Platform.OS === "web") {
    if (typeof navigator !== "undefined" && "onLine" in navigator) {
      return navigator.onLine;
    }
    return true;
  }
  try {
    const state = await Network.getNetworkStateAsync();
    const connected = state.isConnected !== false;
    // isInternetReachable is undefined on some platforms — only treat an explicit
    // false as offline.
    const reachable = state.isInternetReachable !== false;
    return connected && reachable;
  } catch {
    // If we can't even query the radio, assume online and let requests decide.
    return true;
  }
}

export function NetProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const mounted = useRef(true);

  const check = async () => {
    const next = await probe();
    if (mounted.current) setOnline(next);
    return next;
  };

  useEffect(() => {
    mounted.current = true;
    check();

    const interval = setInterval(check, POLL_MS);

    const appSub = AppState.addEventListener("change", (s) => {
      if (s === "active") check();
    });

    // Web gets instant transitions from the browser events too.
    let onOnline: (() => void) | undefined;
    let onOffline: (() => void) | undefined;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      onOnline = () => mounted.current && setOnline(true);
      onOffline = () => mounted.current && setOnline(false);
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
    }

    return () => {
      mounted.current = false;
      clearInterval(interval);
      appSub.remove();
      if (Platform.OS === "web" && typeof window !== "undefined") {
        if (onOnline) window.removeEventListener("online", onOnline);
        if (onOffline) window.removeEventListener("offline", onOffline);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <NetCtx.Provider value={{ online, check }}>{children}</NetCtx.Provider>;
}

export function useNet() {
  const ctx = useContext(NetCtx);
  if (!ctx) throw new Error("useNet must be inside NetProvider");
  return ctx;
}
