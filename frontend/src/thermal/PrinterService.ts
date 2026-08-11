// BLE Thermal Printer Service
//
// Supports any ESC/POS printer that exposes a BLE GATT writable characteristic
// (Sunmi, Rongta, Epson, and most generic 58mm/80mm BT printers).
//
// Requires react-native-ble-plx + its config plugin in app.json.
// On iOS: NSBluetoothAlwaysUsageDescription is added by the plugin.
// On Android: BLUETOOTH_SCAN + BLUETOOTH_CONNECT permissions added by the plugin.
//
// Usage:
//   const devices = await scanPrinters((d) => setList(l => [...l, d]));
//   await savePrinter(devices[0]);
//   await printBytes(devices[0].id, buildThermalReceipt(bill, shop));

import { BleManager, Device, BleError } from "react-native-ble-plx";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type PrinterDevice = {
  id: string;       // BLE device ID (MAC on Android, UUID on iOS)
  name: string;
  paperWidth?: 32 | 42; // 32 = 58mm, 42 = 80mm
};

const PRINTER_KEY = "@pharma_saved_printer";
const SCAN_TIMEOUT_MS = 10_000;
const CHUNK_SIZE = 20; // conservative BLE MTU — negotiated up later

let _manager: BleManager | null = null;
function manager(): BleManager {
  if (!_manager) _manager = new BleManager();
  return _manager;
}

// ── Scan ────────────────────────────────────────────────────────────────────

/**
 * Scan for nearby BLE devices. Calls `onFound` for each new device that has
 * a name (unnamed devices are almost never printers).
 * Resolves after SCAN_TIMEOUT_MS with all found devices.
 */
export async function scanPrinters(
  onFound: (d: PrinterDevice) => void,
): Promise<PrinterDevice[]> {
  const found = new Map<string, PrinterDevice>();

  return new Promise((resolve) => {
    manager().startDeviceScan(null, { allowDuplicates: false }, (err: BleError | null, device: Device | null) => {
      if (err || !device?.name) return;
      if (!found.has(device.id)) {
        const p: PrinterDevice = { id: device.id, name: device.name };
        found.set(device.id, p);
        onFound(p);
      }
    });

    setTimeout(() => {
      manager().stopDeviceScan();
      resolve(Array.from(found.values()));
    }, SCAN_TIMEOUT_MS);
  });
}

export function stopScan(): void {
  manager().stopDeviceScan();
}

// ── Persistence ──────────────────────────────────────────────────────────────

export async function getSavedPrinter(): Promise<PrinterDevice | null> {
  try {
    const raw = await AsyncStorage.getItem(PRINTER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function savePrinter(device: PrinterDevice): Promise<void> {
  await AsyncStorage.setItem(PRINTER_KEY, JSON.stringify(device));
}

export async function clearSavedPrinter(): Promise<void> {
  await AsyncStorage.removeItem(PRINTER_KEY);
}

// ── Print ────────────────────────────────────────────────────────────────────

/**
 * Connect to the device, find the first writable GATT characteristic,
 * send `data` in chunks, then disconnect.
 *
 * Throws on connection failure or if no writable characteristic is found.
 */
export async function printBytes(deviceId: string, data: Uint8Array): Promise<void> {
  let connected: Device;
  try {
    connected = await manager().connectToDevice(deviceId, { timeout: 10_000 });
    await connected.discoverAllServicesAndCharacteristics();
  } catch (e: any) {
    throw new Error(`Printer connection failed: ${e?.message || e}`);
  }

  // Guarantee disconnect regardless of what happens during print.
  try {
    // Negotiate higher MTU (improves throughput; silently falls back)
    let mtu = CHUNK_SIZE;
    try {
      const negotiated = await connected.requestMTU(512);
      mtu = Math.max(CHUNK_SIZE, negotiated.mtu - 3); // -3 for ATT overhead
    } catch {
      // keep default
    }

    // Find the first writable characteristic across all services.
    let svcUuid = "";
    let charUuid = "";
    let withResponse = false;

    const services = await connected.services();
    outer: for (const svc of services) {
      const chars = await svc.characteristics();
      for (const c of chars) {
        if (c.isWritableWithoutResponse || c.isWritableWithResponse) {
          svcUuid = svc.uuid;
          charUuid = c.uuid;
          withResponse = !!c.isWritableWithResponse && !c.isWritableWithoutResponse;
          break outer;
        }
      }
    }

    if (!charUuid) {
      throw new Error("No writable characteristic found on this device. Is it a thermal printer?");
    }

    // Send data in MTU-sized chunks.
    for (let offset = 0; offset < data.length; offset += mtu) {
      const chunk = data.slice(offset, offset + mtu);
      const b64 = uint8ToBase64(chunk);
      if (withResponse) {
        await connected.writeCharacteristicWithResponseForService(svcUuid, charUuid, b64);
      } else {
        await connected.writeCharacteristicWithoutResponseForService(svcUuid, charUuid, b64);
      }
    }
  } finally {
    await connected.cancelConnection().catch(() => {});
  }
}

// ── Utils ────────────────────────────────────────────────────────────────────

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
