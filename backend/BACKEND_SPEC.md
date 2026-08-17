# Pharma App — Backend API Specification

> **For the backend developer.** This document lists every API endpoint the React Native frontend calls, the expected request/response shapes, and the business rules the backend must enforce.
> Base URL pattern: `{BACKEND_URL}/api/{endpoint}`
> All requests use Bearer token auth (`Authorization: Bearer <token>`) unless marked **Public**.

---

## Table of Contents
1. [Auth](#1-auth)
2. [Shop / Multi-shop](#2-shop--multi-shop)
3. [Dashboard / Stats](#3-dashboard--stats)
4. [Medicines / Inventory](#4-medicines--inventory)
5. [Billing](#5-billing)
6. [Purchases](#6-purchases)
7. [Customers](#7-customers)
8. [Suppliers](#8-suppliers)
9. [Doctors](#9-doctors)
10. [Expenses](#10-expenses)
11. [Shifts](#11-shifts)
12. [Staff](#12-staff)
13. [Analytics & Reports](#13-analytics--reports)
14. [General Ledger](#14-general-ledger)
15. [Cash Flow](#15-cash-flow)
16. [Journal Entries](#16-journal-entries)
17. [EOD Close](#17-eod-close)
18. [Stock Adjustments](#18-stock-adjustments)
19. [Reorder / Draft PO](#19-reorder--draft-po)
20. [Batch Write-off](#20-batch-write-off)
21. [Supplier Returns](#21-supplier-returns)
22. [Notifications](#22-notifications)
23. [Admin / Backup](#23-admin--backup)
24. [Subscription Plan](#24-subscription-plan)
25. [Data Models Reference](#25-data-models-reference)

---

## 1. Auth

### POST `/auth/login` — **Public**
Login with email + password.

**Request**
```json
{ "email": "owner@shop.com", "password": "secret" }
```
**Response**
```json
{
  "token": "<jwt>",
  "user": {
    "id": "u1",
    "email": "owner@shop.com",
    "role": "owner",
    "name": "Ashish",
    "shop_id": "s1",
    "permissions": ["billing", "reports", "staff", "purchases"]
  }
}
```
- `role`: `owner` | `staff`
- `permissions`: array controls which tabs the app shows

---

### POST `/auth/change-password`
Change current user's password.

**Request**
```json
{ "old_password": "old", "new_password": "new" }
```
**Response** `{ "ok": true }`

---

### POST `/auth/verify-password`
Verify the owner's password before allowing a sensitive action (e.g. editing an old bill).

**Request** `{ "password": "secret" }`
**Response** `{ "ok": true }` or `400` on mismatch

---

### POST `/auth/2fa/enable`
Enable TOTP 2FA for the current user.

**Response**
```json
{ "secret": "BASE32SECRET", "qr_uri": "otpauth://totp/..." }
```

### POST `/auth/2fa/disable`
**Request** `{ "code": "123456" }` (TOTP code to confirm)
**Response** `{ "ok": true }`

---

### Staff Management

#### GET `/auth/staff`
List all staff users for this shop.
**Response** `[{ "id", "email", "name", "role", "permissions": [...] }]`

#### POST `/auth/staff`
Create a new staff account.
**Request** `{ "email", "password", "name", "permissions": ["billing", "inventory"] }`

#### PUT `/auth/staff/:id`
Update staff name, password, or permissions.
**Request** `{ "name"?, "password"?, "permissions"? }`

#### DELETE `/auth/staff/:id`
Remove a staff account.

---

## 2. Shop / Multi-shop

### GET `/shop`
Get current shop details.
**Response**
```json
{
  "id": "s1",
  "name": "Apollo Pharmacy",
  "gstin": "27AAPFU0939F1ZV",
  "address": "123 MG Road",
  "phone": "9876543210",
  "data_retention_months": 24,
  "notification_prefs": { "low_stock": true, "expiry": true }
}
```

### PUT `/shop`
Update shop settings.
**Request** `{ "name"?, "gstin"?, "address"?, "data_retention_months"? }`

---

### Multi-shop (Shop Switcher)

#### GET `/shops`
List all shops this user has access to.
**Response** `[{ "id", "name", "role" }]`

#### POST `/shops`
Create a new shop.
**Request** `{ "name", "gstin"?, "address"?, "phone"? }`

#### POST `/shops/switch`
Switch active shop context.
**Request** `{ "shop_id": "s2" }`
**Response** `{ "token": "<new_jwt_for_s2>" }`

#### DELETE `/shops/:id`
Delete a shop (owner only, cannot delete current active shop).

---

## 3. Dashboard / Stats

### GET `/stats/today`
Today's summary for the home dashboard.

**Response**
```json
{
  "sales_total": 12500.00,
  "bill_count": 23,
  "profit_today": 3200.00,
  "purchase_total": 8000.00,
  "pending_credit_count": 5,
  "pending_credit_amount": 4200.00,
  "low_stock_count": 12,
  "expiring_30_count": 7,
  "wow_sales": 11200.00,
  "wow_pct": 11.6
}
```
- `wow_sales`: same day last week sales
- `wow_pct`: week-over-week percentage change

---

## 4. Medicines / Inventory

### GET `/medicines?q=&page=&limit=`
Search medicines with pagination.
**Response**
```json
{
  "items": [{
    "id": "m1",
    "name": "Paracetamol 500mg",
    "pack": "10 Tab",
    "manufacturer": "Cipla",
    "hsn": "30049099",
    "gst_pct": 12,
    "mrp": 18.50,
    "purchase_price": 12.00,
    "stock": 150,
    "reorder_level": 20,
    "location": { "block": "A", "row": "2", "shelf": "3" }
  }],
  "total": 240
}
```

### GET `/medicines/:id`
Get single medicine detail including batch list.

### PUT `/medicines/:id`
Update medicine details (name, MRP, HSN, GST%, reorder level, location).

### GET `/medicines/low-stock`
List all medicines below reorder level.

### GET `/batches/expiring-soon?days=30`
List batches expiring within N days.
**Response**
```json
[{
  "id": "b1",
  "medicine_name": "Crocin",
  "strength": "500mg",
  "batch_no": "BT2024001",
  "expiry": "2025-03-31",
  "quantity": 50,
  "mrp": 18.50
}]
```

### GET `/batches`
List all batches (optionally filtered by `?medicine_id=`).

### POST `/stock-in`
Add stock manually (without a purchase entry).
**Request**
```json
{
  "medicine_id": "m1",
  "batch_no": "BT001",
  "expiry": "2026-12-31",
  "quantity": 100,
  "purchase_price": 12.00,
  "mrp": 18.50
}
```

### POST `/adjustments`
Adjust stock quantity (positive or negative).
**Request**
```json
{
  "medicine_id": "m1",
  "batch_id": "b1",
  "quantity_delta": -5,
  "reason": "damaged"
}
```

### GET `/location-browser?block=&row=`
Browse inventory by physical location (block → row → shelf).
**Response** `[{ "id", "name", "pack", "stock", "location" }]`

### GET `/stockout-risk`
Medicines at risk of stockout based on sales velocity.
**Response** `[{ "id", "name", "stock", "avg_daily_sales", "days_remaining" }]`

### GET `/barcode/:barcode`
Look up medicine by barcode.
**Response** same as medicine detail object.

---

## 5. Billing

### POST `/bills`
Create a new bill.

**Request**
```json
{
  "customer_name": "Rahul Sharma",
  "customer_phone": "9876543210",
  "customer_id": "c1",
  "doctor_id": "d1",
  "payment_mode": "cash",
  "payment_mode_2": "upi",
  "amount_mode_1": 200.00,
  "amount_mode_2": 150.00,
  "discount_pct": 5,
  "lines": [
    {
      "medicine_id": "m1",
      "batch_id": "b1",
      "quantity": 2,
      "mrp": 18.50,
      "discount_pct": 0
    }
  ],
  "rx_details": {
    "rx_no": "RX001",
    "doctor_name": "Dr. Mehta",
    "diagnosis": "Fever"
  }
}
```

**Response**
```json
{
  "id": "bill1",
  "bill_no": "INV-2024-001",
  "total": 350.00,
  "created_at": "2024-01-15T10:30:00Z"
}
```

**Business rules:**
- Deduct stock from specified batch
- If `payment_mode` is `credit`, add to customer outstanding balance
- Split payment: `payment_mode` + `payment_mode_2` with respective amounts
- `rx_details` required for Schedule-H drugs

---

### GET `/bills/:id`
Get bill detail including line items, edit history, and return status.

**Response**
```json
{
  "id": "bill1",
  "bill_no": "INV-2024-001",
  "customer_name": "Rahul",
  "customer_phone": "9876543210",
  "payment_mode": "cash",
  "total": 350.00,
  "discount_pct": 5,
  "created_at": "2024-01-15T10:30:00Z",
  "sold_by": "staff@shop.com",
  "lines": [{ "medicine_name", "batch_no", "quantity", "mrp", "amount" }],
  "edit_history": [{ "edited_by", "edited_at", "changes": {} }],
  "returned": false
}
```

### GET `/bills/:id/return`
Get return details for a bill.

### POST `/bills/:id/return`
Process a return for a bill.
**Request** `{ "lines": [{ "line_id": "l1", "return_qty": 1 }], "reason": "Wrong medicine" }`
**Business rules:** Restore stock, issue credit note or refund.

### POST `/bills/:id/cancel`
Cancel a bill (owner only or with approval).
**Business rules:** Restore stock, reverse payment.

### POST `/bills/:id/approve-edit`
Owner approves an edit request on a bill older than today.
**Request** `{ "approved": true }`

### GET `/bills/history?date_from=&date_to=&q=&page=`
Bill history with search and date filter.

### GET `/bills/scan/:qr_code`
Look up bill by QR code (for scan-to-open feature).

---

## 6. Purchases

### GET `/purchases?month=YYYY-MM`
List purchase entries for a month.

### POST `/purchases`
Record a new purchase entry.
**Request**
```json
{
  "supplier_id": "sup1",
  "invoice_no": "SI-001",
  "invoice_date": "2024-01-10",
  "items": [
    {
      "medicine_id": "m1",
      "batch_no": "BT001",
      "expiry": "2026-12-31",
      "quantity": 100,
      "purchase_price": 12.00,
      "mrp": 18.50,
      "gst_pct": 12
    }
  ],
  "payment_mode": "credit",
  "invoice_image_url": "uploads/inv001.jpg"
}
```

### POST `/purchases/scan`
Upload a supplier invoice photo/PDF for OCR extraction.
**Request** `multipart/form-data` with `file` field.
**Response**
```json
{
  "invoice_no": "SI-001",
  "supplier_name": "Cipla Ltd",
  "items": [
    { "name": "Paracetamol 500mg", "batch_no": "BT001", "qty": 100, "rate": 12.00, "mrp": 18.50 }
  ]
}
```

### POST `/purchases/from-scan`
Confirm and save a scan-extracted purchase.
**Request** same as POST `/purchases` but items pre-filled from scan.

### POST `/purchase-returns`
Record a purchase return to supplier.
**Request**
```json
{
  "supplier_id": "sup1",
  "purchase_id": "pur1",
  "items": [{ "medicine_id": "m1", "batch_id": "b1", "quantity": 10, "reason": "Damaged" }],
  "debit_note_no": "DN-001"
}
```

### POST `/reorder/draft-po`
Auto-generate draft purchase orders for all medicines below reorder level.
**Response** `{ "created": 5 }` (number of draft POs created)

---

## 7. Customers

### GET `/customers?q=`
Search customers.
**Response** `[{ "id", "name", "phone", "outstanding_balance" }]`

### POST `/customers`
Create a new customer.
**Request** `{ "name", "phone", "email"?, "address"? }`

### PUT `/customers/:id`
Update customer details.

### GET `/customers/:id/ledger?date_from=&date_to=`
Customer transaction history (bills, payments, credits).
**Response**
```json
{
  "customer": { "id", "name", "phone", "outstanding_balance" },
  "entries": [
    { "date", "type": "bill|payment|credit_note", "amount", "balance_after", "ref_id" }
  ]
}
```

### POST `/customers/:id/payment`
Record a credit payment from a customer.
**Request** `{ "amount": 500.00, "payment_mode": "upi", "notes"? }`

---

## 8. Suppliers

### GET `/suppliers?q=`
List suppliers.
**Response** `[{ "id", "name", "phone", "gstin", "outstanding_balance", "credit_limit" }]`

### POST `/suppliers`
Create supplier.
**Request** `{ "name", "phone", "gstin"?, "email"?, "credit_limit"? }`

### PUT `/suppliers/:id`
Update supplier.

### DELETE `/suppliers/:id`

### GET `/suppliers/:id/payments?month=`
Supplier payment history and ledger.
**Response**
```json
{
  "supplier": { "id", "name", "outstanding_balance", "credit_limit" },
  "entries": [
    { "date", "type": "purchase|payment|return", "amount", "balance_after", "ref_id" }
  ]
}
```

### POST `/suppliers/:id/payment`
Record a payment to supplier.
**Request** `{ "amount", "payment_mode", "notes"? }`

---

## 9. Doctors

### GET `/doctors?q=`
Search doctors.
**Response** `[{ "id", "name", "speciality", "clinic", "phone", "bill_count" }]`

### POST `/doctors`
**Request** `{ "name", "speciality"?, "clinic"?, "phone"? }`

### PUT `/doctors/:id`

### DELETE `/doctors/:id`

---

## 10. Expenses

### GET `/expenses?month=YYYY-MM`
List expenses for a month.
**Response**
```json
[{
  "id": "exp1",
  "date": "2024-01-15",
  "category": "rent|salary|electricity|supplies|maintenance|other",
  "amount": 15000.00,
  "notes": "January rent",
  "added_by": "owner@shop.com"
}]
```

### POST `/expenses`
**Request** `{ "date", "category", "amount", "notes"? }`

### PUT `/expenses/:id`

### DELETE `/expenses/:id`

---

## 11. Shifts

### POST `/shifts/clock-in`
Record staff clock-in.
**Response** `{ "id", "clocked_in_at": "2024-01-15T09:00:00Z" }`

### POST `/shifts/clock-out`
Record staff clock-out.
**Response** `{ "id", "clocked_in_at", "clocked_out_at", "duration_minutes": 480 }`

### GET `/shifts?month=YYYY-MM`
Get shift history for current user (staff) or all staff (owner).

---

## 12. Staff Reports

### GET `/staff/report?month=YYYY-MM`
Sales report broken down by staff member.
**Response**
```json
{
  "month": "2024-01",
  "staff": [
    {
      "email": "staff@shop.com",
      "bill_count": 45,
      "revenue": 28000.00,
      "discount_given": 1200.00
    }
  ],
  "total_bills": 120
}
```

---

## 13. Analytics & Reports

### GET `/analytics/pnl?month=YYYY-MM`
Profit & Loss statement for a month.
**Response**
```json
{
  "month": "2024-01",
  "gross_revenue": 125000.00,
  "discounts_given": 3200.00,
  "revenue": 121800.00,
  "cogs": 82000.00,
  "gross_profit": 39800.00,
  "total_expenses": 18000.00,
  "net_profit": 21800.00,
  "margin_pct": 17.9,
  "bill_count": 234,
  "purchase_count": 12,
  "expenses_by_category": [
    { "category": "rent", "amount": 15000.00 },
    { "category": "electricity", "amount": 3000.00 }
  ]
}
```

---

### GET `/analytics/sales?month=YYYY-MM`
Sales analytics.
**Response**
```json
{
  "month": "2024-01",
  "bill_count": 234,
  "total_revenue": 121800.00,
  "top_by_qty": [{ "id", "name", "qty": 450, "revenue": 8100.00 }],
  "slow_movers": [{ "id", "name", "qty": 2, "revenue": 37.00 }],
  "top_by_revenue": [{ "id", "name", "qty": 90, "revenue": 16200.00 }],
  "by_payment_mode": [{ "mode": "cash", "total": 65000.00 }],
  "hourly_distribution": [{ "hour": 10, "bills": 28 }],
  "peak_hour": 11
}
```

---

### GET `/analytics/gst?month=YYYY-MM`
GST summary for filing.
**Response**
```json
{
  "month": "2024-01",
  "bill_count": 234,
  "rows": [
    { "hsn": "30049099", "taxable_value": 95000.00, "cgst": 5700.00, "sgst": 5700.00, "total_tax": 11400.00, "invoice_count": 180 }
  ],
  "totals": { "taxable_value", "cgst", "sgst", "total_tax" }
}
```

---

### GET `/analytics/trial-balance?date_from=&date_to=`
Trial balance report.
**Response**
```json
{
  "date_from": "2024-01-01",
  "date_to": "2024-01-31",
  "rows": [{ "account": "Sales", "debit": 0, "credit": 121800.00 }],
  "total_debit": 121800.00,
  "total_credit": 121800.00,
  "balanced": true
}
```

---

### GET `/analytics/balance-sheet`
Balance sheet as of today.
**Response**
```json
{
  "as_of": "2024-01-31",
  "assets": { "cash": 45000.00, "inventory": 82000.00, "receivables": 12000.00, "total": 139000.00 },
  "liabilities": { "payables": 28000.00, "total": 28000.00 },
  "equity": { "retained_earnings": 111000.00, "total": 111000.00 },
  "balanced": true
}
```

---

### GET `/analytics/drug-register?month=YYYY-MM`
Schedule-H drug register for regulatory compliance.
**Response**
```json
[{
  "date": "2024-01-15",
  "bill_no": "INV-001",
  "patient_name": "Rahul",
  "doctor_name": "Dr. Mehta",
  "rx_no": "RX001",
  "medicine_name": "Alprazolam 0.5mg",
  "strength": "0.5mg",
  "quantity": 10
}]
```

---

### GET `/analytics/doctors?month=YYYY-MM`
Doctor-wise revenue breakdown.
**Response**
```json
[{
  "doctor_id": "d1",
  "doctor_name": "Dr. Mehta",
  "bill_count": 45,
  "revenue": 28000.00,
  "top_medicines": [{ "name": "Paracetamol", "qty": 90 }]
}]
```

---

### GET `/analytics/purchases?month=YYYY-MM`
Purchase analytics by supplier and category.

### GET `/analytics/vendors?month=YYYY-MM`
Vendor-wise outstanding and payment analytics.

### GET `/analytics/customers?month=YYYY-MM`
Customer-wise revenue and credit analytics.

---

## 14. General Ledger

### GET `/ledger?date_from=&date_to=&type=&mode=`
Unified transaction feed across all types.

**Query params:**
- `type`: `all|sale|purchase|expense|supplier_payment|credit_collection`
- `mode`: `all|cash|bank`

**Response**
```json
{
  "entries": [
    {
      "date": "2024-01-15",
      "type": "sale",
      "direction": "in",
      "description": "INV-001 - Rahul Sharma",
      "amount": 350.00,
      "ref_id": "bill1",
      "payment_mode": "cash"
    }
  ],
  "total_in": 121800.00,
  "total_out": 100000.00,
  "net": 21800.00
}
```

---

## 15. Cash Flow

### GET `/analytics/cashflow?date_from=&date_to=&mode=`
Day-by-day cash in / cash out.

**Query params:**
- `mode`: `all|cash|bank` (book mode filter)

**Response**
```json
{
  "days": [
    { "date": "2024-01-15", "cash_in": 12500.00, "cash_out": 8000.00, "net": 4500.00 }
  ],
  "total_in": 121800.00,
  "total_out": 98000.00,
  "net": 23800.00
}
```

---

## 16. Journal Entries

### GET `/journal-entries?month=YYYY-MM`
List manual journal entries.
**Response**
```json
[{
  "id": "je1",
  "date": "2024-01-15",
  "debit_account": "Cash",
  "credit_account": "Capital",
  "amount": 50000.00,
  "notes": "Owner capital infusion",
  "added_by": "owner@shop.com"
}]
```

### POST `/journal-entries`
**Request** `{ "date", "debit_account", "credit_account", "amount", "notes"? }`

### DELETE `/journal-entries/:id`

---

## 17. EOD Close

### GET `/eod?month=YYYY-MM`
List EOD close records.
**Response**
```json
[{
  "date": "2024-01-15",
  "cash_expected": 45000.00,
  "cash_actual": 44800.00,
  "variance": -200.00,
  "notes": "200 short",
  "closed_by": "owner@shop.com"
}]
```

### POST `/eod`
Submit end-of-day cash reconciliation.
**Request** `{ "date": "2024-01-15", "cash_actual": 44800.00, "notes"? }`
**Business rule:** `cash_expected` is calculated by backend from today's sales/expenses.

---

## 18. Stock Adjustments

### GET `/adjustments?month=YYYY-MM`
List stock adjustment history.

### POST `/adjustments`
**Request**
```json
{ "medicine_id": "m1", "batch_id": "b1", "quantity_delta": -5, "reason": "damaged|expired|count_correction|other" }
```

---

## 19. Reorder / Draft PO

### GET `/reorder`
List medicines below reorder level with suggested order quantities.
**Response**
```json
[{
  "medicine_id": "m1",
  "name": "Paracetamol 500mg",
  "current_stock": 5,
  "reorder_level": 20,
  "suggested_qty": 100,
  "preferred_supplier": { "id": "sup1", "name": "Cipla Distributor" }
}]
```

### POST `/reorder/draft-po`
Auto-create draft purchase orders.
**Response** `{ "created": 5 }`

---

## 20. Batch Write-off

### POST `/batches/writeoff`
Write off expired/damaged batches.
**Request**
```json
{
  "batch_ids": ["b1", "b2"],
  "reason": "expired|damaged|recall",
  "notes"?
}
```
**Business rule:** Deduct stock, create stock adjustment record, affect P&L.

---

## 21. Supplier Returns

### GET `/supplier-returns?month=YYYY-MM`
List supplier return records.

### POST `/supplier-returns`
**Request**
```json
{
  "supplier_id": "sup1",
  "purchase_id": "pur1",
  "items": [
    { "medicine_id": "m1", "batch_id": "b1", "quantity": 10, "reason": "damaged" }
  ],
  "debit_note_no": "DN-001"
}
```
**Business rule:** Restore stock, create debit note, reduce supplier payable.

---

## 22. Notifications

### GET `/notification-settings`
Get notification preferences.
**Response**
```json
{
  "low_stock_alert": true,
  "expiry_alert_days": 30,
  "eod_reminder": true,
  "eod_reminder_time": "21:00",
  "push_token": "ExponentPushToken[xxx]"
}
```

### PUT `/notification-settings`
**Request** `{ "low_stock_alert"?, "expiry_alert_days"?, "eod_reminder"?, "eod_reminder_time"?, "push_token"? }`

---

## 23. Admin / Backup

### GET `/admin/audit-log?date_from=&date_to=`
Full audit log of all actions (owner only).
**Response**
```json
[{
  "timestamp": "2024-01-15T10:30:00Z",
  "user": "staff@shop.com",
  "action": "bill_created|bill_cancelled|stock_adjusted|...",
  "details": {},
  "ip": "192.168.1.1"
}]
```

### POST `/admin/purge-old-data`
Delete data older than `data_retention_months` (set in shop settings).
**Response**
```json
{
  "cutoff": "2022-01-15",
  "deleted": { "bills": 1200, "purchases": 340, "expenses": 180 }
}
```

### GET `/admin/export`
Export all data as JSON or CSV for backup (owner only).

---

## 24. Subscription Plan

### GET `/plan`
Get current subscription plan.
**Response**
```json
{
  "plan": "free|basic|pro",
  "expires_at": "2025-01-01",
  "features": ["billing", "reports", "multi_shop"]
}
```

### POST `/plan/upgrade`
Upgrade to a paid plan.
**Request** `{ "plan": "basic|pro" }`

---

## 25. Data Models Reference

### Medicine
| Field | Type | Notes |
|---|---|---|
| id | string | UUID |
| name | string | |
| pack | string | e.g. "10 Tab" |
| manufacturer | string | |
| hsn | string | HSN code for GST |
| gst_pct | number | 0 / 5 / 12 / 18 |
| mrp | number | Max retail price |
| purchase_price | number | Latest purchase rate |
| stock | number | Total across batches |
| reorder_level | number | |
| location | object | `{ block, row, shelf }` |
| is_schedule_h | boolean | Requires prescription |
| barcode | string | |

### Batch
| Field | Type | Notes |
|---|---|---|
| id | string | UUID |
| medicine_id | string | |
| batch_no | string | |
| expiry | string | YYYY-MM-DD |
| quantity | number | |
| purchase_price | number | |
| mrp | number | |

### Bill
| Field | Type | Notes |
|---|---|---|
| id | string | UUID |
| bill_no | string | Auto-generated (INV-YYYY-NNNN) |
| customer_name | string | |
| customer_id | string? | Link to customer if known |
| doctor_id | string? | |
| payment_mode | string | `cash\|upi\|card\|credit` |
| payment_mode_2 | string? | For split payment |
| amount_mode_1 | number? | |
| amount_mode_2 | number? | |
| discount_pct | number | |
| total | number | |
| sold_by | string | Staff email |
| created_at | datetime | |

### Expense
| Field | Type | Notes |
|---|---|---|
| category | string | `rent\|salary\|electricity\|supplies\|maintenance\|other` |
| amount | number | |
| date | string | YYYY-MM-DD |
| notes | string? | |
| added_by | string | Email |

---

## General Rules

- **Auth:** All endpoints except `/auth/login` require `Authorization: Bearer <token>`
- **Errors:** Return `{ "detail": "Human readable error" }` with appropriate HTTP status
- **Pagination:** Use `?page=1&limit=50` where applicable; return `{ items: [], total: N }`
- **Dates:** Always ISO 8601 (`YYYY-MM-DD` for dates, `YYYY-MM-DDTHH:MM:SSZ` for datetimes)
- **Currency:** All amounts in INR (Indian Rupees), stored as float, 2 decimal places
- **Multi-tenancy:** Every record is scoped to `shop_id` — never leak data across shops
- **Soft delete:** Prefer soft delete (`deleted_at`) over hard delete for bills, medicines
- **Uploads:** Files go to `uploads/` directory; return relative URL in response
