// Thermal receipt builder — converts a bill + shop into ESC/POS bytes.
// Used by PrinterService; for PDF use src/invoice.ts instead.

import { EscPos, PaperWidth } from "./escpos";
import { InvoiceBill, InvoiceShop, gstSlabs } from "../invoice";

const rs = (n: number) => `Rs.${n.toFixed(2)}`; // ₹ is multi-byte — use Rs. for ASCII printers

export function buildThermalReceipt(
  bill: InvoiceBill,
  shop: InvoiceShop,
  width: PaperWidth = 32,
): Uint8Array {
  const e = new EscPos(width);

  // ── Header ──
  e.reset()
   .center()
   .bold(true)
   .bigText(true)
   .wrap(shop.name)
   .bigText(false)
   .bold(false);

  if (shop.address) e.wrap(shop.address);
  if (shop.phone)   e.line(`Ph: ${shop.phone}`);
  e.feed();
  if (shop.gstin)  e.line(`GSTIN: ${shop.gstin}`);
  if (shop.dl_no)  e.line(`DL: ${shop.dl_no}`);
  e.divider("=").feed();

  // ── Bill info ──
  e.left();
  e.bold(true).line(bill.bill_no).bold(false);
  e.line(new Date(bill.created_at).toLocaleString("en-IN"));
  if (bill.customer_name) e.line(`Customer: ${bill.customer_name}`);
  e.line(`Payment: ${bill.payment_mode?.toUpperCase() || "CASH"}`);

  if (bill.status === "cancelled") {
    e.center().bold(true).line("** CANCELLED **").bold(false).left();
  }

  e.divider("-");

  // ── Items ──
  const nameW = width - 16; // leave room for qty + amount columns
  for (const l of bill.lines) {
    const name = l.medicine_name.length > width
      ? l.medicine_name.slice(0, width - 1)
      : l.medicine_name;
    e.bold(true).line(name).bold(false);

    const qtyMrp = `${l.quantity} x ${rs(l.mrp)}`;
    const amt = rs(l.line_total);
    e.row("  " + qtyMrp, amt);

    if (l.discount_pct) {
      e.line(`  Disc: ${l.discount_pct}%`);
    }
    e.line(`  Batch: ${l.batch_no}  Exp: ${l.expiry}`);
    e.line(`  HSN: ${l.hsn || "3004"}  GST: ${l.gst_rate}%`);
  }

  e.divider("=");

  // ── Totals ──
  e.row("Subtotal", rs(bill.subtotal));
  if (bill.total_discount > 0) {
    e.row("Discount", "- " + rs(bill.total_discount));
  }
  e.row("Taxable", rs(bill.taxable_total));
  e.divider("-");

  // GST slab breakdown (mandatory on valid tax receipt)
  const slabs = gstSlabs(bill.lines);
  for (const s of slabs) {
    e.row(`CGST @${s.rate / 2}%`, rs(s.cgst));
    e.row(`SGST @${s.rate / 2}%`, rs(s.sgst));
  }

  e.divider("=");
  e.bold(true).row("TOTAL", rs(bill.grand_total)).bold(false);
  e.divider("=");

  // ── Footer ──
  e.feed()
   .center()
   .line("GST incl. in MRP")
   .feed()
   .line("Thank you for your visit!")
   .feed()
   .line("** ORIGINAL FOR RECIPIENT **")
   .feed(3)
   .cut();

  return e.bytes();
}
