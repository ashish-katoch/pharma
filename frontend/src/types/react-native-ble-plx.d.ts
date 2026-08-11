// Minimal type stubs for react-native-ble-plx until the package is installed.
// Replace with the real package types after running: npm install react-native-ble-plx

declare module "react-native-ble-plx" {
  export interface Characteristic {
    uuid: string;
    isWritableWithResponse: boolean;
    isWritableWithoutResponse: boolean;
    serviceUUID: string;
    writeWithResponse(value: string): Promise<Characteristic>;
    writeWithoutResponse(value: string): Promise<Characteristic>;
  }

  export interface Service {
    uuid: string;
    characteristics(): Promise<Characteristic[]>;
  }

  export interface Device {
    id: string;
    name: string | null;
    mtu: number;
    discoverAllServicesAndCharacteristics(): Promise<Device>;
    requestMTU(mtu: number): Promise<Device>;
    services(): Promise<Service[]>;
    characteristicsForService(serviceUUID: string): Promise<Characteristic[]>;
    cancelConnection(): Promise<Device>;
    writeCharacteristicWithoutResponseForService(
      serviceUUID: string,
      characteristicUUID: string,
      value: string
    ): Promise<Characteristic>;
    writeCharacteristicWithResponseForService(
      serviceUUID: string,
      characteristicUUID: string,
      value: string
    ): Promise<Characteristic>;
  }

  export class BleError extends Error {
    errorCode: number;
    attErrorCode: number | null;
    iosErrorCode: number | null;
    androidErrorCode: number | null;
    reason: string | null;
  }

  export class BleManager {
    startDeviceScan(
      uuids: string[] | null,
      options: object | null,
      callback: (error: BleError | null, device: Device | null) => void
    ): void;
    stopDeviceScan(): void;
    connectToDevice(deviceId: string, options?: { timeout?: number }): Promise<Device>;
    destroy(): void;
  }
}
