export const SCHEMA_VERSION = 3;

// Run once at DB open. All tables use IF NOT EXISTS so re-running is safe.
export const CREATE_TABLES = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS medicines (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  brand         TEXT DEFAULT '',
  generic       TEXT DEFAULT '',
  strength      TEXT DEFAULT '',
  pack          TEXT DEFAULT '',
  hsn           TEXT DEFAULT '3004',
  schedule      TEXT DEFAULT 'OTC',
  gst_rate      REAL DEFAULT 12.0,
  mrp           REAL DEFAULT 0.0,
  barcode       TEXT DEFAULT '',
  reorder_level INTEGER DEFAULT 10,
  created_at    TEXT,
  updated_at    TEXT,
  deleted       INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS batches (
  id             TEXT PRIMARY KEY,
  medicine_id    TEXT NOT NULL REFERENCES medicines(id),
  batch_no       TEXT NOT NULL,
  expiry         TEXT NOT NULL,
  quantity       INTEGER NOT NULL DEFAULT 0,
  mrp            REAL NOT NULL DEFAULT 0.0,
  purchase_price REAL DEFAULT 0.0,
  created_at     TEXT,
  updated_at     TEXT,
  deleted        INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bills (
  id               TEXT PRIMARY KEY,
  bill_no          TEXT,
  customer_name    TEXT DEFAULT '',
  customer_phone   TEXT DEFAULT '',
  subtotal         REAL DEFAULT 0.0,
  total_discount   REAL DEFAULT 0.0,
  taxable_total    REAL DEFAULT 0.0,
  cgst_total       REAL DEFAULT 0.0,
  sgst_total       REAL DEFAULT 0.0,
  grand_total      REAL DEFAULT 0.0,
  bill_discount_pct REAL DEFAULT 0.0,
  payment_mode     TEXT DEFAULT 'cash',
  status           TEXT DEFAULT 'active',
  created_at       TEXT,
  created_by       TEXT,
  synced           INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bill_lines (
  id             TEXT PRIMARY KEY,
  bill_id        TEXT NOT NULL REFERENCES bills(id),
  medicine_id    TEXT NOT NULL,
  medicine_name  TEXT NOT NULL,
  strength       TEXT DEFAULT '',
  hsn            TEXT DEFAULT '',
  batch_id       TEXT NOT NULL,
  batch_no       TEXT NOT NULL,
  expiry         TEXT NOT NULL,
  quantity       INTEGER NOT NULL,
  mrp            REAL NOT NULL,
  discount_pct   REAL DEFAULT 0.0,
  gst_rate       REAL DEFAULT 0.0,
  taxable_amount REAL DEFAULT 0.0,
  cgst           REAL DEFAULT 0.0,
  sgst           REAL DEFAULT 0.0,
  line_total     REAL DEFAULT 0.0
);

CREATE TABLE IF NOT EXISTS stock_ledger (
  id          TEXT PRIMARY KEY,
  medicine_id TEXT NOT NULL,
  batch_id    TEXT NOT NULL,
  change      INTEGER NOT NULL,
  type        TEXT NOT NULL,
  reference   TEXT,
  actor       TEXT,
  created_at  TEXT
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id                TEXT PRIMARY KEY,
  entity_type       TEXT NOT NULL,
  entity_id         TEXT NOT NULL,
  payload           TEXT NOT NULL,
  status            TEXT DEFAULT 'pending',
  error             TEXT,
  retry_count       INTEGER DEFAULT 0,
  created_at        TEXT,
  last_attempted_at TEXT
);

CREATE TABLE IF NOT EXISTS sync_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS schedule_h_log (
  id            TEXT PRIMARY KEY,
  bill_id       TEXT NOT NULL,
  bill_no       TEXT,
  medicines     TEXT NOT NULL,
  patient_name  TEXT NOT NULL,
  patient_age   TEXT DEFAULT '',
  patient_addr  TEXT DEFAULT '',
  prescriber    TEXT NOT NULL,
  rx_date       TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  phone         TEXT DEFAULT '',
  address       TEXT DEFAULT '',
  credit_limit  REAL DEFAULT 0.0,
  outstanding   REAL DEFAULT 0.0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id            TEXT PRIMARY KEY,
  customer_id   TEXT NOT NULL REFERENCES customers(id),
  bill_id       TEXT,
  type          TEXT NOT NULL,
  amount        REAL NOT NULL,
  notes         TEXT DEFAULT '',
  created_at    TEXT NOT NULL,
  created_by    TEXT
);

CREATE TABLE IF NOT EXISTS suppliers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT DEFAULT '',
  email       TEXT DEFAULT '',
  address     TEXT DEFAULT '',
  gstin       TEXT DEFAULT '',
  dl_no       TEXT DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS purchases (
  id              TEXT PRIMARY KEY,
  supplier_id     TEXT,
  supplier_name   TEXT DEFAULT '',
  invoice_no      TEXT DEFAULT '',
  invoice_date    TEXT,
  total_amount    REAL DEFAULT 0.0,
  paid_amount     REAL DEFAULT 0.0,
  payment_mode    TEXT DEFAULT 'cash',
  status          TEXT DEFAULT 'received',
  created_at      TEXT NOT NULL,
  created_by      TEXT
);

CREATE TABLE IF NOT EXISTS purchase_lines (
  id             TEXT PRIMARY KEY,
  purchase_id    TEXT NOT NULL REFERENCES purchases(id),
  medicine_id    TEXT NOT NULL,
  medicine_name  TEXT NOT NULL,
  batch_id       TEXT,
  batch_no       TEXT DEFAULT '',
  expiry         TEXT DEFAULT '',
  quantity       INTEGER NOT NULL,
  purchase_price REAL NOT NULL,
  mrp            REAL DEFAULT 0.0,
  gst_rate       REAL DEFAULT 0.0
);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id            TEXT PRIMARY KEY,
  medicine_id   TEXT NOT NULL,
  medicine_name TEXT NOT NULL,
  batch_id      TEXT,
  batch_no      TEXT DEFAULT '',
  change        INTEGER NOT NULL,
  reason        TEXT NOT NULL,
  notes         TEXT DEFAULT '',
  created_at    TEXT NOT NULL,
  created_by    TEXT
);

CREATE TABLE IF NOT EXISTS eod_closes (
  id              TEXT PRIMARY KEY,
  date            TEXT NOT NULL,
  cash_expected   REAL DEFAULT 0.0,
  cash_actual     REAL DEFAULT 0.0,
  upi_total       REAL DEFAULT 0.0,
  card_total      REAL DEFAULT 0.0,
  credit_total    REAL DEFAULT 0.0,
  total_sales     REAL DEFAULT 0.0,
  bill_count      INTEGER DEFAULT 0,
  notes           TEXT DEFAULT '',
  closed_by       TEXT,
  created_at      TEXT NOT NULL
);
`;

// Migration SQL per version — run sequentially when upgrading an existing DB.
// Each entry is an array of individual statements (safer than multi-statement strings).
export const MIGRATIONS: Record<number, string[]> = {
  2: [
    `ALTER TABLE bills ADD COLUMN rx_details TEXT DEFAULT NULL`,
    // schedule_h_log created via CREATE_TABLES IF NOT EXISTS.
  ],
  3: [
    // Add customer_id linkage to bills for customer history
    `ALTER TABLE bills ADD COLUMN customer_id TEXT DEFAULT NULL`,
    // New tables created via CREATE_TABLES IF NOT EXISTS — no ALTER needed.
  ],
};
