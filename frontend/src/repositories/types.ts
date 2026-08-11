export type LocalMedicine = {
  id: string;
  name: string;
  brand: string;
  generic: string;
  strength: string;
  pack: string;
  hsn: string;
  schedule: string;
  gst_rate: number;
  mrp: number;
  barcode: string;
  reorder_level: number;
  total_stock: number;
  created_at: string;
  updated_at?: string;
  deleted?: number;
};

export type LocalBatch = {
  id: string;
  medicine_id: string;
  batch_no: string;
  expiry: string;
  quantity: number;
  mrp: number;
  purchase_price: number;
  created_at: string;
  updated_at?: string;
  deleted?: number;
};

export type LocalBillLine = {
  id: string;
  bill_id: string;
  medicine_id: string;
  medicine_name: string;
  strength: string;
  hsn: string;
  batch_id: string;
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

export type LocalBill = {
  id: string;
  bill_no: string;
  customer_name: string;
  customer_phone: string;
  subtotal: number;
  total_discount: number;
  taxable_total: number;
  cgst_total: number;
  sgst_total: number;
  grand_total: number;
  bill_discount_pct: number;
  payment_mode: string;
  status: string;
  created_at: string;
  created_by: string;
  synced: number;
  lines: LocalBillLine[];
};

export type SyncQueueEntry = {
  id: string;
  entity_type: string;
  entity_id: string;
  payload: string;
  status: "pending" | "failed";
  error?: string;
  retry_count: number;
  created_at: string;
  last_attempted_at?: string;
};

export type RxDetails = {
  patient_name: string;
  patient_age: string;
  patient_addr: string;
  prescriber: string;
  rx_date: string;
  rx_photo?: string;
};

export type CreateBillParams = {
  lines: Array<{
    medicine_id: string;
    medicine_name: string;
    strength: string;
    hsn: string;
    gst_rate: number;
    quantity: number;
    discount_pct: number;
  }>;
  customerName: string;
  customerPhone: string;
  customerId?: string;
  doctorId?: string;
  doctorName?: string;
  billDiscountPct: number;
  paymentMode: string;
  splitPayment?: Array<{ mode: string; amount: number }>;
  createdBy: string;
  rxDetails?: RxDetails;
  loyaltyPointsUsed?: number;
};
