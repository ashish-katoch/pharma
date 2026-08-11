// WhatsApp receipt sharing.
//
// A native app can't attach a generated PDF straight into a WhatsApp chat via a
// deep link, so this sends a formatted text receipt to the customer's number
// (opening the chat pre-filled). The PDF stays available through the system share
// sheet ("Share PDF") for anyone who wants the full invoice attached.
//
// Phone numbers are normalised to E.164-ish digits; bare 10-digit Indian numbers
// get a +91 country code so wa.me resolves them.

import { Linking } from "react-native";

/** Strip formatting and apply a sensible default country code (India). */
export function normalizePhone(raw: string): string {
  if (!raw) return "";
  let digits = raw.replace(/[^\d]/g, "");
  digits = digits.replace(/^0+/, ""); // drop national trunk prefix (00xx or 0)
  if (digits.length === 10) digits = "91" + digits; // assume India
  // Reject obviously invalid lengths to avoid silently opening wrong WhatsApp chats.
  if (digits.length < 10 || digits.length > 15) return "";
  return digits;
}

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type BillLike = {
  bill_no: string;
  grand_total: number;
  created_at: string;
  lines: { medicine_name: string; quantity: number; line_total: number }[];
  payment_mode?: string;
};

type ShopLike = { name: string; phone?: string };

/** Build the plain-text receipt body for a WhatsApp message. */
export function buildReceiptText(bill: BillLike, shop: ShopLike): string {
  const items = bill.lines
    .map((l) => `• ${l.medicine_name} × ${l.quantity} — ${rupee(l.line_total)}`)
    .join("\n");
  const when = new Date(bill.created_at).toLocaleString("en-IN");
  return [
    `*${shop.name}*`,
    `Invoice ${bill.bill_no}`,
    when,
    "",
    items,
    "",
    `*Total: ${rupee(bill.grand_total)}*`,
    bill.payment_mode ? `Paid via ${bill.payment_mode.toUpperCase()}` : "",
    "",
    "Thank you for your visit! 🙏",
    shop.phone ? `Reorder: ${shop.phone}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Open WhatsApp to `phone` with `text` pre-filled. Tries the native app scheme
 * first, then falls back to the wa.me web URL. Returns false if nothing could be
 * opened.
 */
export async function sendOnWhatsApp(phone: string, text: string): Promise<boolean> {
  const digits = normalizePhone(phone);
  const encoded = encodeURIComponent(text);
  const appUrl = digits
    ? `whatsapp://send?phone=${digits}&text=${encoded}`
    : `whatsapp://send?text=${encoded}`;
  const webUrl = digits
    ? `https://wa.me/${digits}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;

  try {
    if (await Linking.canOpenURL(appUrl)) {
      await Linking.openURL(appUrl);
      return true;
    }
  } catch {
    /* fall through to web */
  }
  try {
    await Linking.openURL(webUrl);
    return true;
  } catch {
    return false;
  }
}
