// Tax invoice builder — shared by PDF (expo-print) and ESC/POS thermal receipt.
//
// GST law (CGST Rules, Rule 46) requires a valid tax invoice to show:
//   • Taxable value + CGST + SGST broken out per GST rate slab (5%/12%/18%)
//   • GSTIN, DL No., HSN code per line
//   • "ORIGINAL FOR RECIPIENT" / "DUPLICATE FOR SUPPLIER" label
//
// All amounts are in INR. GST is assumed inclusive in MRP (pharma standard).

export type InvoiceLine = {
  medicine_name: string;
  strength?: string;
  hsn: string;
  batch_no: string;
  expiry: string;
  quantity: number;
  mrp: number;
  discount_pct: number;
  gst_rate: number;
  taxable_amount: number;
  cgst: number;
  sgst: number;
  line_total: number;
};

export type InvoiceBill = {
  id?: string;
  bill_no: string;
  created_at: string;
  customer_name?: string;
  customer_phone?: string;
  payment_mode: string;
  status: string;
  lines: InvoiceLine[];
  subtotal: number;
  total_discount: number;
  taxable_total: number;
  cgst_total: number;
  sgst_total: number;
  grand_total: number;
};

export type InvoiceShop = {
  name: string;
  address: string;
  phone: string;
  gstin: string;
  dl_no: string;
};

export type GstSlab = {
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  totalTax: number;
};

function r2(n: number) { return Math.round(n * 100) / 100; }
const inr = (n: number) => `₹${n.toFixed(2)}`;

export function gstSlabs(lines: InvoiceLine[]): GstSlab[] {
  const map = new Map<number, GstSlab>();
  for (const l of lines) {
    const rate = l.gst_rate ?? 0;
    const s = map.get(rate) ?? { rate, taxable: 0, cgst: 0, sgst: 0, totalTax: 0 };
    s.taxable  = r2(s.taxable  + (l.taxable_amount ?? 0));
    s.cgst     = r2(s.cgst     + (l.cgst           ?? 0));
    s.sgst     = r2(s.sgst     + (l.sgst           ?? 0));
    s.totalTax = r2(s.totalTax + (l.cgst ?? 0) + (l.sgst ?? 0));
    map.set(rate, s);
  }
  return Array.from(map.values()).sort((a, b) => a.rate - b.rate);
}

export function buildTaxInvoiceHtml(
  bill: InvoiceBill,
  shop: InvoiceShop,
  copy: "original" | "duplicate" = "original",
): string {
  const slabs = gstSlabs(bill.lines);
  const when  = new Date(bill.created_at).toLocaleString("en-IN");

  const lineRows = bill.lines.map((l, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>
        <b>${esc(l.medicine_name)}</b>${l.strength ? " " + esc(l.strength) : ""}
        <div class="sub">Batch: ${esc(l.batch_no)} &nbsp;·&nbsp; Exp: ${esc(l.expiry)}</div>
      </td>
      <td class="c">${esc(l.hsn || "3004")}</td>
      <td class="r">${l.quantity}</td>
      <td class="r">${inr(l.mrp)}</td>
      <td class="r">${l.discount_pct ? l.discount_pct + "%" : "—"}</td>
      <td class="r">${l.gst_rate}%</td>
      <td class="r">${inr(l.taxable_amount)}</td>
      <td class="r">${inr(l.cgst)}</td>
      <td class="r">${inr(l.sgst)}</td>
      <td class="r"><b>${inr(l.line_total)}</b></td>
    </tr>`).join("");

  const slabRows = slabs.map(s => `
    <tr>
      <td>${s.rate}%</td>
      <td>${s.rate / 2}% + ${s.rate / 2}%</td>
      <td class="r">${inr(s.taxable)}</td>
      <td class="r">${inr(s.cgst)}</td>
      <td class="r">${inr(s.sgst)}</td>
      <td class="r"><b>${inr(s.totalTax)}</b></td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(bill.bill_no)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#0F172A;padding:28px;font-size:11px;max-width:210mm;margin:0 auto}
.copy{text-align:right;font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#94A3B8;margin-bottom:6px}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #0F172A;padding-bottom:14px;margin-bottom:14px}
.shop-name{font-size:20px;font-weight:900;letter-spacing:-0.5px}
.sub{color:#64748B;font-size:10px;margin-top:3px;line-height:1.4}
.inv-title{font-size:18px;font-weight:900;text-align:right}
.badge{display:inline-block;font-size:11px;font-weight:800;border:1.5px solid #334155;padding:3px 10px;border-radius:4px;margin-top:4px;color:#0F172A}
.stamp{font-size:36px;font-weight:900;color:#EF4444;border:3px solid #EF4444;padding:4px 20px;border-radius:4px;text-align:center;margin:12px 0;letter-spacing:4px;opacity:.7}
.meta{display:flex;justify-content:space-between;margin-bottom:14px;gap:20px}
.meta-block{display:flex;flex-direction:column;gap:3px}
.lbl{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.8px;color:#94A3B8}
table{width:100%;border-collapse:collapse;font-size:10.5px}
th{background:#0F172A;color:#fff;padding:7px 5px;text-align:right;font-size:9.5px;font-weight:700;letter-spacing:.3px;white-space:nowrap}
th:first-child,th:nth-child(2),th:nth-child(3){text-align:left}
td{padding:6px 5px;border-bottom:1px solid #E2E8F0;vertical-align:top}
td.r{text-align:right}
td.c{text-align:center}
.slab-wrap{display:flex;justify-content:flex-end;margin-top:6px}
.slab-table{min-width:380px}
.slab-table th{background:#334155}
.tot-wrap{display:flex;justify-content:flex-end;margin-top:14px}
.tot-table{min-width:260px}
.tot-table td{border:none;padding:3px 5px}
.tot-table td:last-child{text-align:right;font-weight:600}
.grand td{border-top:2.5px solid #0F172A!important;padding-top:8px!important;font-size:15px;font-weight:900}
.sec{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin:18px 0 6px}
.footer{margin-top:40px;border-top:1px solid #E2E8F0;padding-top:10px;display:flex;justify-content:space-between;font-size:10px;color:#64748B}
.sign{text-align:right;font-size:10px;margin-top:44px}
</style>
</head><body>

<div class="copy">${copy === "original" ? "ORIGINAL FOR RECIPIENT" : "DUPLICATE FOR SUPPLIER"}</div>

<div class="hdr">
  <div>
    <div class="shop-name">${esc(shop.name)}</div>
    <div class="sub">${esc(shop.address)}</div>
    <div class="sub">Tel: ${esc(shop.phone)}</div>
    <div class="sub" style="margin-top:6px">GSTIN: <b>${esc(shop.gstin || "Unregistered")}</b></div>
    <div class="sub">Drug Licence No.: <b>${esc(shop.dl_no || "—")}</b></div>
  </div>
  <div style="text-align:right">
    <div class="inv-title">TAX INVOICE</div>
    <div class="badge">${esc(bill.bill_no)}</div>
    <div class="sub" style="margin-top:8px">Date: ${when}</div>
  </div>
</div>

${bill.status === "cancelled" ? '<div class="stamp">CANCELLED</div>' : ""}

<div class="meta">
  <div class="meta-block">
    <div class="lbl">Bill To</div>
    <div><b>${esc(bill.customer_name || "Walk-in Customer")}</b></div>
    ${bill.customer_phone ? `<div>${esc(bill.customer_phone)}</div>` : ""}
  </div>
  <div class="meta-block" style="text-align:right">
    <div class="lbl">Payment</div>
    <div><b>${esc(bill.payment_mode?.toUpperCase() || "CASH")}</b></div>
  </div>
</div>

<table>
  <thead><tr>
    <th>#</th><th>Medicine / Particulars</th><th>HSN</th>
    <th>Qty</th><th>MRP</th><th>Disc</th><th>GST%</th>
    <th>Taxable</th><th>CGST</th><th>SGST</th><th>Amount</th>
  </tr></thead>
  <tbody>${lineRows}</tbody>
</table>

<div class="sec">GST Tax Summary — Slab-wise Breakup (GST is inclusive in MRP)</div>
<div class="slab-wrap">
  <table class="slab-table">
    <thead><tr>
      <th style="text-align:left">Rate</th>
      <th style="text-align:left">CGST + SGST</th>
      <th>Taxable Value</th><th>CGST</th><th>SGST</th><th>Total Tax</th>
    </tr></thead>
    <tbody>${slabRows}</tbody>
  </table>
</div>

<div class="tot-wrap">
  <table class="tot-table">
    <tr><td>Subtotal (MRP basis)</td><td>${inr(bill.subtotal)}</td></tr>
    <tr><td>Discount</td><td>− ${inr(bill.total_discount)}</td></tr>
    <tr><td>Total Taxable Value</td><td>${inr(bill.taxable_total)}</td></tr>
    <tr><td>Total CGST</td><td>${inr(bill.cgst_total)}</td></tr>
    <tr><td>Total SGST</td><td>${inr(bill.sgst_total)}</td></tr>
    <tr class="grand"><td>GRAND TOTAL</td><td>${inr(bill.grand_total)}</td></tr>
  </table>
</div>

<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:24px">
  <div class="sign">
    <div style="margin-bottom:40px"></div>
    <div>___________________________</div>
    <div style="margin-top:4px;font-weight:700">Authorised Signatory</div>
    <div class="sub">${esc(shop.name)}</div>
  </div>
  <div style="text-align:center">
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(`pharma://bill/${bill.bill_no}`)}" width="80" height="80" alt="Bill QR" style="display:block;margin:0 auto" />
    <div style="font-size:8px;color:#64748B;margin-top:4px">Scan to view bill</div>
  </div>
</div>

<div class="footer">
  <span>GST included in MRP. Taxable value = MRP ÷ (1 + GST%). E&amp;OE.</span>
  <span>Pharma Counter</span>
</div>
</body></html>`;
}

function esc(s: string | undefined | null): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
