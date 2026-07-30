// Tiny module-level bridge for "scan a code and hand it back to the caller".
//
// expo-router has no ergonomic return-value mechanism, so a screen that wants a
// scanned barcode registers a one-shot handler here, then navigates to /scan in
// "return" mode. The scanner calls deliverScan() and pops back. Used by Stock In
// to fill the barcode field. (Billing's add-to-cart path does its own lookup in
// the scanner and does not use this.)

type Handler = (code: string) => void;

let pending: Handler | null = null;

/** Register the callback that should receive the next scanned code. */
export function requestScan(handler: Handler): void {
  pending = handler;
}

/** Deliver a scanned code to the waiting handler (consumed once). */
export function deliverScan(code: string): void {
  const h = pending;
  pending = null;
  if (h) h(code);
}

/** Drop any registered handler (e.g. if the caller unmounts). */
export function cancelScan(): void {
  pending = null;
}
