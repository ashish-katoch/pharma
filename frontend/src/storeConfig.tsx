import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

export type StoreConfig = {
  store_type: string;
  product_label: string;
  products_label: string;
  supplier_label: string;
  suppliers_label: string;
  batch_required: boolean;
  expiry_tracking: boolean;
  schedule_h: boolean;
  doctor_referrals: boolean;
  prescription: boolean;
  symptom_suggest: boolean;
  dl_no_label: string | null;
  referrer_label: string | null;
  lot_label: string;
};

const PHARMACY_DEFAULT: StoreConfig = {
  store_type: "pharmacy",
  product_label: "Medicine",
  products_label: "Medicines",
  supplier_label: "Supplier",
  suppliers_label: "Suppliers",
  batch_required: true,
  expiry_tracking: true,
  schedule_h: true,
  doctor_referrals: true,
  prescription: true,
  symptom_suggest: true,
  dl_no_label: "Drug Licence No.",
  referrer_label: "Doctor",
  lot_label: "Batch No.",
};

export const STORE_TYPE_OPTIONS: { value: string; label: string; icon: string }[] = [
  { value: "pharmacy",  label: "Pharmacy",           icon: "thermometer" },
  { value: "kirana",    label: "Kirana / Grocery",   icon: "shopping-bag" },
  { value: "optical",   label: "Optical Store",      icon: "eye" },
  { value: "surgical",  label: "Surgical Supplies",  icon: "activity" },
  { value: "hardware",  label: "Hardware Shop",      icon: "tool" },
  { value: "rental",    label: "Equipment Rental",   icon: "package" },
  { value: "agri",      label: "Agri / Seeds",       icon: "sun" },
  { value: "clothing",  label: "Clothing / Textile", icon: "tag" },
];

type StoreConfigContextValue = {
  config: StoreConfig;
  loading: boolean;
  reload: () => Promise<void>;
};

const StoreConfigContext = createContext<StoreConfigContextValue>({
  config: PHARMACY_DEFAULT,
  loading: false,
  reload: async () => {},
});

export function StoreConfigProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [config, setConfig] = useState<StoreConfig>(PHARMACY_DEFAULT);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await api<StoreConfig>("/store-config");
      setConfig(data);
    } catch {
      // keep default on error
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { reload(); }, [reload]);

  return (
    <StoreConfigContext.Provider value={{ config, loading, reload }}>
      {children}
    </StoreConfigContext.Provider>
  );
}

export function useStoreConfig(): StoreConfig {
  return useContext(StoreConfigContext).config;
}

export function useStoreConfigContext(): StoreConfigContextValue {
  return useContext(StoreConfigContext);
}
