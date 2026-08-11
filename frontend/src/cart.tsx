import { createContext, useContext, useState, ReactNode, useCallback } from "react";

export type Medicine = {
  id: string;
  name: string;
  brand?: string;
  generic?: string;
  strength?: string;
  pack?: string;
  hsn?: string;
  gst_rate?: number;
  mrp: number;
  total_stock: number;
  reorder_level: number;
  schedule?: string;
  location?: string;
  uom?: string;   // pcs | kg | ltr | dz
  barcode?: string;
};

export type CartLine = {
  medicine: Medicine;
  quantity: number;
  discount_pct: number;
};

type CartContextValue = {
  lines: CartLine[];
  billDiscountPct: number;
  customerName: string;
  customerPhone: string;
  paymentMode: "cash" | "upi" | "card" | "credit";
  add: (medicine: Medicine) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  setLineDiscount: (id: string, pct: number) => void;
  setBillDiscount: (pct: number) => void;
  setCustomer: (name: string, phone: string) => void;
  setPaymentMode: (m: CartContextValue["paymentMode"]) => void;
  clear: () => void;
};

const CartCtx = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [billDiscountPct, setBillDiscountPct] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMode, setPaymentMode] = useState<CartContextValue["paymentMode"]>("cash");

  const add = useCallback((medicine: Medicine) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.medicine.id === medicine.id);
      if (existing) {
        return prev.map((l) =>
          l.medicine.id === medicine.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [{ medicine, quantity: 1, discount_pct: 0 }, ...prev];
    });
  }, []);

  const remove = (id: string) => setLines((p) => p.filter((l) => l.medicine.id !== id));
  const setQty = (id: string, qty: number) =>
    setLines((p) => p.map((l) => (l.medicine.id === id ? { ...l, quantity: Math.max(0.001, qty) } : l)));
  const setLineDiscount = (id: string, pct: number) =>
    setLines((p) => p.map((l) => (l.medicine.id === id ? { ...l, discount_pct: Math.max(0, Math.min(100, pct)) } : l)));
  const setCustomer = (name: string, phone: string) => {
    setCustomerName(name);
    setCustomerPhone(phone);
  };
  const clear = () => {
    setLines([]);
    setBillDiscountPct(0);
    setCustomerName("");
    setCustomerPhone("");
    setPaymentMode("cash");
  };

  return (
    <CartCtx.Provider
      value={{
        lines,
        billDiscountPct,
        customerName,
        customerPhone,
        paymentMode,
        add,
        remove,
        setQty,
        setLineDiscount,
        setBillDiscount: setBillDiscountPct,
        setCustomer,
        setPaymentMode,
        clear,
      }}
    >
      {children}
    </CartCtx.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error("useCart must be inside CartProvider");
  return ctx;
}
