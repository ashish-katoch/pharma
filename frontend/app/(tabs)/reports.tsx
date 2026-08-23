import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { PageShell } from "@/src/components/PageShell";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { Platform, useWindowDimensions } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { api } from "@/src/api";
import { useIsOwner } from "@/src/auth";
import { alertMsg } from "@/src/dialog";
import { COLORS, RADIUS, SPACING, expiryTone } from "@/src/theme";
import { useStoreConfig } from "@/src/storeConfig";

const rupee = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function prevMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  if (mo === 1) return `${y - 1}-12`;
  return `${y}-${String(mo - 1).padStart(2, "0")}`;
}
function nextMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  if (mo === 12) return `${y + 1}-01`;
  return `${y}-${String(mo + 1).padStart(2, "0")}`;
}
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

type Tab = "expiring" | "low" | "gst" | "analytics" | "staff" | "pnl" | "drugreg" | "doctors" | "purchases" | "vendors" | "customers" | "trialbalance" | "balancesheet";

type TrialBalanceResp = {
  date_from: string; date_to: string;
  rows: { account: string; debit: number; credit: number }[];
  total_debit: number; total_credit: number; balanced: boolean;
};

type BalanceSheetResp = {
  as_of: string;
  assets: { cash: number; inventory: number; receivables: number; total: number };
  liabilities: { payables: number; total: number };
  equity: { retained_earnings: number; total: number };
  balanced: boolean;
};

type DrugRegRow = {
  date: string; bill_no: string; patient_name: string; doctor_name: string;
  rx_no?: string; medicine_name: string; strength?: string; quantity: number;
};

type LowStockItem = { id: string; name: string; pack?: string; total_stock: number; reorder_level: number };
type ExpiringBatch = { id: string; medicine_name: string; strength: string; batch_no: string; expiry: string; quantity: number; mrp: number };
type GstRow = { hsn: string; taxable_value: number; cgst: number; sgst: number; total_tax: number; invoice_count: number };
type GstSummary = { month: string; bill_count: number; rows: GstRow[]; totals: { taxable_value: number; cgst: number; sgst: number; total_tax: number } };
type Gstr1Row = { gst_rate: number; taxable_value: number; cgst: number; sgst: number; total_tax: number };

type MedStat = { id: string; name: string; qty: number; revenue: number };
type ModeStat = { mode: string; total: number };
type HourlyStat = { hour: number; bills: number };
type SalesAnalytics = {
  month: string; bill_count: number; total_revenue: number;
  top_by_qty: MedStat[]; slow_movers: MedStat[]; top_by_revenue: MedStat[];
  by_payment_mode: ModeStat[];
  hourly_distribution: HourlyStat[];
  peak_hour: number | null;
};

type StaffMember = { email: string; bill_count: number; revenue: number; discount_given: number };
type StaffAnalytics = { month: string; staff: StaffMember[]; total_bills: number };

type PnlData = {
  month: string; revenue: number; discounts_given: number; gross_revenue: number;
  cogs: number; gross_profit: number; total_expenses: number; net_profit: number; margin_pct: number;
  bill_count: number; purchase_count: number;
  expenses_by_category?: { category: string; amount: number }[];
};

type DoctorStat = {
  doctor_id: string;
  doctor_name: string;
  bill_count: number;
  revenue: number;
};

type PurchaseAnalytics = {
  month: string;
  total_amount: number;
  total_paid: number;
  purchase_count: number;
  by_supplier: { supplier_name: string; total_amount: number; paid_amount: number; count: number }[];
  top_medicines: { medicine_name: string; total_qty: number; total_cost: number }[];
};

type VendorStat = {
  id: string;
  name: string;
  total_purchases: number;
  total_paid: number;
  outstanding: number;
  purchase_count: number;
  last_purchase: string | null;
};

type CustomerStat = {
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  bill_count: number;
  revenue: number;
  discounts: number;
  loyalty_points: number;
};

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "expiring", icon: "calendar", label: "Expiring" },
  { id: "low", icon: "alert-triangle", label: "Low Stock" },
  { id: "gst", icon: "file-text", label: "GST" },
  { id: "drugreg", icon: "clipboard", label: "Drug Reg" },
  { id: "analytics", icon: "bar-chart-2", label: "Analytics" },
  { id: "staff", icon: "users", label: "Staff" },
  { id: "pnl", icon: "trending-up", label: "P&L" },
  { id: "doctors", icon: "user-check", label: "Doctors" },
  { id: "purchases", icon: "shopping-cart", label: "Purchases" },
  { id: "vendors", icon: "truck", label: "Vendors" },
  { id: "customers", icon: "users", label: "Customers" },
  { id: "trialbalance", icon: "list", label: "Trial Bal." },
  { id: "balancesheet", icon: "layers", label: "Bal. Sheet" },
];

export default function Reports() {
  const isOwner = useIsOwner();
  const storeConfig = useStoreConfig();
  const visibleTabs = TABS.filter((t) => {
    if (t.id === "drugreg" && !storeConfig.schedule_h) return false;
    if (t.id === "doctors" && !storeConfig.doctor_referrals) return false;
    if ((t.id === "expiring") && !storeConfig.expiry_tracking) return false;
    return true;
  });
  const [tab, setTab] = useState<Tab>("expiring");
  const [window, setWindow] = useState<30 | 60 | 90>(30);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [expiring, setExpiring] = useState<ExpiringBatch[]>([]);
  const [gstMonth, setGstMonth] = useState<string>(currentMonth());
  const [analyticsMonth, setAnalyticsMonth] = useState<string>(currentMonth());
  const [gstData, setGstData] = useState<GstSummary | null>(null);
  const [gstr1Data, setGstr1Data] = useState<Gstr1Row[] | null>(null);
  const [salesData, setSalesData] = useState<SalesAnalytics | null>(null);
  const [staffData, setStaffData] = useState<StaffAnalytics | null>(null);
  const [pnlData, setPnlData] = useState<PnlData | null>(null);
  const [drugRegData, setDrugRegData] = useState<DrugRegRow[] | null>(null);
  const [drugRegMonth, setDrugRegMonth] = useState<string>(currentMonth());
  const [doctorData, setDoctorData] = useState<DoctorStat[] | null>(null);
  const [doctorMonth, setDoctorMonth] = useState<string>(currentMonth());
  const [purchaseData, setPurchaseData] = useState<PurchaseAnalytics | null>(null);
  const [purchaseMonth, setPurchaseMonth] = useState<string>(currentMonth());
  const [vendorData, setVendorData] = useState<VendorStat[] | null>(null);
  const [customerData, setCustomerData] = useState<CustomerStat[] | null>(null);
  const [customerMonth, setCustomerMonth] = useState<string>(currentMonth());
  const [trialBalanceData, setTrialBalanceData] = useState<TrialBalanceResp | null>(null);
  const [trialMonth, setTrialMonth] = useState<string>(currentMonth());
  const [balanceSheetData, setBalanceSheetData] = useState<BalanceSheetResp | null>(null);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(false);
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  const changeDrugRegMonth = (m: string) => { setDrugRegData(null); setDrugRegMonth(m); };
  const changeGstMonth = (m: string) => { setGstData(null); setGstr1Data(null); setGstMonth(m); };
  const changeAnalyticsMonth = (m: string) => { setSalesData(null); setStaffData(null); setPnlData(null); setAnalyticsMonth(m); };
  const changeDoctorMonth = (m: string) => { setDoctorData(null); setDoctorMonth(m); };
  const changePurchaseMonth = (m: string) => { setPurchaseData(null); setPurchaseMonth(m); };
  const changeCustomerMonth = (m: string) => { setCustomerData(null); setCustomerMonth(m); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "low") {
        setLowStock(await api<LowStockItem[]>("/reports/low-stock"));
      } else if (tab === "expiring") {
        setExpiring(await api<ExpiringBatch[]>(`/reports/expiring?window=${window}`));
      } else if (tab === "gst") {
        setGstData(await api<GstSummary>(`/reports/gst-summary?month=${gstMonth}`));
      } else if (tab === "analytics") {
        setSalesData(await api<SalesAnalytics>(`/analytics/sales?month=${analyticsMonth}`));
      } else if (tab === "staff") {
        setStaffData(await api<StaffAnalytics>(`/analytics/staff?month=${analyticsMonth}`));
      } else if (tab === "pnl") {
        setPnlData(await api<PnlData>(`/analytics/pnl?month=${analyticsMonth}`));
      } else if (tab === "drugreg") {
        setDrugRegData(await api<DrugRegRow[]>(`/reports/schedule-h?month=${drugRegMonth}`));
      } else if (tab === "doctors") {
        setDoctorData(await api<DoctorStat[]>(`/analytics/doctor-revenue?month=${doctorMonth}`));
      } else if (tab === "purchases") {
        setPurchaseData(await api<PurchaseAnalytics>(`/analytics/purchases?month=${purchaseMonth}`));
      } else if (tab === "vendors") {
        setVendorData(await api<VendorStat[]>("/analytics/vendors"));
      } else if (tab === "customers") {
        setCustomerData(await api<CustomerStat[]>(`/analytics/customers?month=${customerMonth}`));
      } else if (tab === "trialbalance") {
        const [df, dt] = [trialMonth + "-01", trialMonth + "-31"];
        setTrialBalanceData(await api<TrialBalanceResp>(`/analytics/trial-balance?date_from=${df}&date_to=${dt}`));
      } else if (tab === "balancesheet") {
        const today = new Date().toISOString().slice(0, 10);
        setBalanceSheetData(await api<BalanceSheetResp>(`/analytics/balance-sheet?as_of=${today}`));
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [tab, window, gstMonth, analyticsMonth, drugRegMonth, doctorMonth, purchaseMonth, customerMonth, trialMonth]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const exportGstr1 = async () => {
    try {
      setExporting(true);
      const rows = await api<Gstr1Row[]>(`/reports/gstr1?month=${gstMonth}`);
      setGstr1Data(rows);
      const header = "GST Rate (%),Taxable Value,CGST,SGST,Total Tax\n";
      const lines = rows.map((r) => `${r.gst_rate},${r.taxable_value},${r.cgst},${r.sgst},${r.total_tax}`);
      const csv = header + lines.join("\n");
      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `GSTR1_B2CS_${gstMonth}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const file = new File(Paths.cache, `GSTR1_B2CS_${gstMonth}.csv`);
        file.write(csv);
        await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: `GSTR-1 B2CS ${gstMonth}` });
      }
    } catch (e: any) {
      alertMsg("Export failed", e?.message ?? "Could not export GSTR-1 CSV");
    } finally {
      setExporting(false);
    }
  };

  const exportDrugReg = async () => {
    try {
      setExporting(true);
      const rows = drugRegData ?? await api<DrugRegRow[]>(`/reports/schedule-h?month=${drugRegMonth}`);
      if (!drugRegData) setDrugRegData(rows);
      const header = "Date,Bill No,Patient,Doctor,Rx No,Medicine,Strength,Qty\n";
      const lines = rows.map((r) =>
        [r.date, r.bill_no, r.patient_name, r.doctor_name, r.rx_no ?? "", r.medicine_name, r.strength ?? "", r.quantity].join(",")
      );
      const csv = header + lines.join("\n");
      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Schedule_H_Register_${drugRegMonth}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const file = new File(Paths.cache, `Schedule_H_Register_${drugRegMonth}.csv`);
        file.write(csv);
        await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: `Schedule H Register ${drugRegMonth}` });
      }
    } catch (e: any) {
      alertMsg("Export failed", e?.message ?? "Could not export");
    } finally {
      setExporting(false);
    }
  };

  const exportCSV = async (filename: string, header: string, rows: string[][]) => {
    const csv = [header, ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    if (Platform.OS === "web") {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } else {
      const { Share } = await import("react-native");
      await Share.share({ message: csv, title: filename });
    }
  };

  const exportPurchases = async () => {
    if (!purchaseData) return;
    setExporting(true);
    try {
      await exportCSV(
        `Purchases_${purchaseMonth}.csv`,
        "Supplier,Bills,Total Amount,Paid,Outstanding",
        purchaseData.by_supplier.map((s) => [
          s.supplier_name, String(s.count),
          String(s.total_amount), String(s.paid_amount),
          String(Math.round((s.total_amount - s.paid_amount) * 100) / 100),
        ])
      );
    } catch (e: any) { alertMsg("Export failed", e?.message ?? ""); }
    finally { setExporting(false); }
  };

  const exportVendors = async () => {
    if (!vendorData) return;
    setExporting(true);
    try {
      await exportCSV(
        "Vendors_Summary.csv",
        "Vendor,Bills,Total Purchased,Paid,Outstanding,Last Purchase",
        vendorData.map((v) => [
          v.name, String(v.purchase_count), String(v.total_purchases),
          String(v.total_paid), String(v.outstanding), v.last_purchase ?? "",
        ])
      );
    } catch (e: any) { alertMsg("Export failed", e?.message ?? ""); }
    finally { setExporting(false); }
  };

  const exportCustomers = async () => {
    if (!customerData) return;
    setExporting(true);
    try {
      await exportCSV(
        `Customers_${customerMonth}.csv`,
        "Name,Phone,Bills,Revenue,Discounts,Loyalty Points",
        customerData.map((c) => [
          c.customer_name, c.customer_phone, String(c.bill_count),
          String(c.revenue), String(c.discounts), String(c.loyalty_points),
        ])
      );
    } catch (e: any) { alertMsg("Export failed", e?.message ?? ""); }
    finally { setExporting(false); }
  };

  const exportDoctors = async () => {
    if (!doctorData) return;
    setExporting(true);
    try {
      await exportCSV(
        `Doctors_${doctorMonth}.csv`,
        "Doctor,Bills,Revenue",
        doctorData.map((d) => [d.doctor_name, String(d.bill_count), String(d.revenue)])
      );
    } catch (e: any) { alertMsg("Export failed", e?.message ?? ""); }
    finally { setExporting(false); }
  };

  const exportInventory = async () => {
    setExporting(true);
    try {
      const rows = tab === "expiring" ? expiring : lowStock;
      if (tab === "expiring") {
        await exportCSV(
          `Expiring_Batches_${window}d.csv`,
          "Medicine,Batch No,Expiry,Qty,MRP",
          (rows as ExpiringBatch[]).map((b) => [b.medicine_name, b.batch_no, b.expiry, String(b.quantity), String(b.mrp)])
        );
      } else {
        await exportCSV(
          "Low_Stock.csv",
          "Medicine,Pack,Stock,Reorder Level",
          (rows as LowStockItem[]).map((m) => [m.name, m.pack ?? "", String(m.total_stock), String(m.reorder_level)])
        );
      }
    } catch (e: any) { alertMsg("Export failed", e?.message ?? ""); }
    finally { setExporting(false); }
  };

  const isAnalyticsTab = tab === "analytics" || tab === "staff" || tab === "pnl";
  const isDoctorsTab = tab === "doctors";
  const isPurchasesTab = tab === "purchases";
  const isVendorsTab = tab === "vendors";
  const isCustomersTab = tab === "customers";
  const isTrialBalanceTab = tab === "trialbalance";

  const tabButtons = visibleTabs.map((t) => (
    <TouchableOpacity
      key={t.id}
      testID={`reports-tab-${t.id}`}
      style={[styles.tab, tab === t.id && styles.tabActive]}
      onPress={() => setTab(t.id)}
    >
      <Feather name={t.icon as any} size={13} color={tab === t.id ? COLORS.white : COLORS.textSecondary} />
      <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
    </TouchableOpacity>
  ));

  return (
    <PageShell scrollable={false} noPadding>
        <View style={styles.header}>
          <Text style={styles.title}>Reports</Text>
        </View>

        {/* Tab bar — desktop: flex-wrap row; mobile: horizontal scroll */}
        {isDesktop ? (
          <View style={styles.tabsDesktop}>{tabButtons}</View>
        ) : (
          <View style={{ height: 52 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} style={{ flex: 1 }}>
              {tabButtons}
            </ScrollView>
          </View>
        )}

      {/* Expiring window chips */}
      {tab === "expiring" && (
        <View style={{ height: 50 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.windowRow} style={{ flex: 1 }}>
            {[30, 60, 90].map((w) => (
              <TouchableOpacity
                key={w} testID={`reports-window-${w}`}
                style={[styles.chip, window === w && styles.chipActive]}
                onPress={() => setWindow(w as any)}
              >
                <Text style={[styles.chipText, window === w && styles.chipTextActive]}>{w} days</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* GST month nav */}
      {tab === "gst" && (
        <>
          <View style={styles.monthNav}>
            <TouchableOpacity testID="gst-prev-month" onPress={() => changeGstMonth(prevMonth(gstMonth))} style={styles.monthArrow}>
              <Feather name="chevron-left" size={22} color={COLORS.primary} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{monthLabel(gstMonth)}</Text>
            <TouchableOpacity testID="gst-next-month" onPress={() => { const n = nextMonth(gstMonth); if (n <= currentMonth()) changeGstMonth(n); }} style={styles.monthArrow}>
              <Feather name="chevron-right" size={22} color={gstMonth < currentMonth() ? COLORS.primary : COLORS.textMuted} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity testID="gstr1-export-btn" style={styles.exportBtn} onPress={exportGstr1} disabled={exporting}>
            {exporting ? <ActivityIndicator color={COLORS.white} size="small" /> : <Feather name="download" size={14} color={COLORS.white} />}
            <Text style={styles.exportBtnText}>Export GSTR-1 CSV</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Drug Register month nav */}
      {tab === "drugreg" && (
        <>
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={() => changeDrugRegMonth(prevMonth(drugRegMonth))} style={styles.monthArrow}>
              <Feather name="chevron-left" size={22} color={COLORS.primary} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{monthLabel(drugRegMonth)}</Text>
            <TouchableOpacity onPress={() => { const n = nextMonth(drugRegMonth); if (n <= currentMonth()) changeDrugRegMonth(n); }} style={styles.monthArrow}>
              <Feather name="chevron-right" size={22} color={drugRegMonth < currentMonth() ? COLORS.primary : COLORS.textMuted} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.exportBtn} onPress={exportDrugReg} disabled={exporting}>
            {exporting ? <ActivityIndicator color={COLORS.white} size="small" /> : <Feather name="download" size={14} color={COLORS.white} />}
            <Text style={styles.exportBtnText}>Export CSV</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Analytics/Staff/P&L month nav */}
      {isAnalyticsTab && (
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => changeAnalyticsMonth(prevMonth(analyticsMonth))} style={styles.monthArrow}>
            <Feather name="chevron-left" size={22} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{monthLabel(analyticsMonth)}</Text>
          <TouchableOpacity onPress={() => { const n = nextMonth(analyticsMonth); if (n <= currentMonth()) changeAnalyticsMonth(n); }} style={styles.monthArrow}>
            <Feather name="chevron-right" size={22} color={analyticsMonth < currentMonth() ? COLORS.primary : COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Doctors month nav + export */}
      {isDoctorsTab && (
        <>
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={() => changeDoctorMonth(prevMonth(doctorMonth))} style={styles.monthArrow}>
              <Feather name="chevron-left" size={22} color={COLORS.primary} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{monthLabel(doctorMonth)}</Text>
            <TouchableOpacity onPress={() => { const n = nextMonth(doctorMonth); if (n <= currentMonth()) changeDoctorMonth(n); }} style={styles.monthArrow}>
              <Feather name="chevron-right" size={22} color={doctorMonth < currentMonth() ? COLORS.primary : COLORS.textMuted} />
            </TouchableOpacity>
          </View>
          {doctorData && doctorData.length > 0 && (
            <TouchableOpacity style={styles.exportBtn} onPress={exportDoctors} disabled={exporting}>
              {exporting ? <ActivityIndicator color={COLORS.white} size="small" /> : <Feather name="download" size={14} color={COLORS.white} />}
              <Text style={styles.exportBtnText}>Export CSV</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Purchases month nav + export */}
      {isPurchasesTab && (
        <>
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={() => changePurchaseMonth(prevMonth(purchaseMonth))} style={styles.monthArrow}>
              <Feather name="chevron-left" size={22} color={COLORS.primary} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{monthLabel(purchaseMonth)}</Text>
            <TouchableOpacity onPress={() => { const n = nextMonth(purchaseMonth); if (n <= currentMonth()) changePurchaseMonth(n); }} style={styles.monthArrow}>
              <Feather name="chevron-right" size={22} color={purchaseMonth < currentMonth() ? COLORS.primary : COLORS.textMuted} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.exportBtn} onPress={exportPurchases} disabled={exporting || !purchaseData}>
            {exporting ? <ActivityIndicator color={COLORS.white} size="small" /> : <Feather name="download" size={14} color={COLORS.white} />}
            <Text style={styles.exportBtnText}>Export CSV</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Vendors export */}
      {isVendorsTab && vendorData && (
        <TouchableOpacity style={styles.exportBtn} onPress={exportVendors} disabled={exporting}>
          {exporting ? <ActivityIndicator color={COLORS.white} size="small" /> : <Feather name="download" size={14} color={COLORS.white} />}
          <Text style={styles.exportBtnText}>Export CSV</Text>
        </TouchableOpacity>
      )}

      {/* Customers month nav + export */}
      {isCustomersTab && (
        <>
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={() => changeCustomerMonth(prevMonth(customerMonth))} style={styles.monthArrow}>
              <Feather name="chevron-left" size={22} color={COLORS.primary} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{monthLabel(customerMonth)}</Text>
            <TouchableOpacity onPress={() => { const n = nextMonth(customerMonth); if (n <= currentMonth()) changeCustomerMonth(n); }} style={styles.monthArrow}>
              <Feather name="chevron-right" size={22} color={customerMonth < currentMonth() ? COLORS.primary : COLORS.textMuted} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.exportBtn} onPress={exportCustomers} disabled={exporting || !customerData}>
            {exporting ? <ActivityIndicator color={COLORS.white} size="small" /> : <Feather name="download" size={14} color={COLORS.white} />}
            <Text style={styles.exportBtnText}>Export CSV</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Trial Balance month nav */}
      {isTrialBalanceTab && (
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => { setTrialBalanceData(null); setTrialMonth(prevMonth(trialMonth)); }} style={styles.monthArrow}>
            <Feather name="chevron-left" size={22} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{monthLabel(trialMonth)}</Text>
          <TouchableOpacity onPress={() => { const n = nextMonth(trialMonth); if (n <= currentMonth()) { setTrialBalanceData(null); setTrialMonth(n); } }} style={styles.monthArrow}>
            <Feather name="chevron-right" size={22} color={trialMonth < currentMonth() ? COLORS.primary : COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Inventory export (expiring / low stock) */}
      {(tab === "expiring" || tab === "low") && (
        <TouchableOpacity style={[styles.exportBtn, styles.exportBtnInline]} onPress={exportInventory} disabled={exporting}>
          {exporting ? <ActivityIndicator color={COLORS.white} size="small" /> : <Feather name="download" size={14} color={COLORS.white} />}
          <Text style={styles.exportBtnText}>Export CSV</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100, gap: 8 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.primary} />}
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: 20 }} color={COLORS.primary} />
        ) : tab === "expiring" ? (
          expiring.length === 0 ? (
            <EmptyBlock icon="check-circle" label={`No batches expiring in ${window} days`} tone="success" />
          ) : expiring.map((b) => {
            const tone = expiryTone(b.expiry);
            return (
              <View key={b.id} style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{b.medicine_name}</Text>
                  <Text style={styles.cardMeta}>Batch {b.batch_no} · Qty {b.quantity} · {rupee(b.mrp)}</Text>
                  <View style={styles.tagRow}>
                    <View style={[styles.expiryBadge, { backgroundColor: tone.bg }]}>
                      <Text style={[styles.expiryBadgeText, { color: tone.fg }]}>{b.expiry} · {tone.label}</Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })
        ) : tab === "low" ? (
          lowStock.length === 0 ? (
            <EmptyBlock icon="check-circle" label="All stock is above reorder level" tone="success" />
          ) : lowStock.map((m) => (
            <View key={m.id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>{m.name}</Text>
                <Text style={styles.cardMeta}>{m.pack}</Text>
                <View style={styles.tagRow}>
                  <View style={[styles.expiryBadge, { backgroundColor: COLORS.dangerBg }]}>
                    <Text style={[styles.expiryBadgeText, { color: COLORS.danger }]}>{m.total_stock} left · reorder at {m.reorder_level}</Text>
                  </View>
                </View>
              </View>
            </View>
          ))
        ) : tab === "gst" ? (
          !gstData || gstData.bill_count === 0 ? (
            <EmptyBlock icon="file-text" label={`No bills for ${monthLabel(gstMonth)}`} tone="muted" />
          ) : (
            <>
              <View style={styles.gstSummaryCard}>
                <Text style={styles.gstSummaryTitle}>GSTR-1 Summary · {monthLabel(gstMonth)}</Text>
                <Text style={styles.gstBillCount}>{gstData.bill_count} invoice{gstData.bill_count !== 1 ? "s" : ""}</Text>
                <View style={styles.gstTotalsRow}>
                  <GstTotal label="Taxable" value={rupee(gstData.totals.taxable_value)} />
                  <GstTotal label="CGST" value={rupee(gstData.totals.cgst)} />
                  <GstTotal label="SGST" value={rupee(gstData.totals.sgst)} />
                  <GstTotal label="Total Tax" value={rupee(gstData.totals.total_tax)} accent />
                </View>
              </View>
              <Text style={styles.sectionLabel}>HSN-WISE BREAKDOWN</Text>
              <View style={styles.gstTableHeader}>
                <Text style={[styles.gstHeaderCell, { flex: 1 }]}>HSN</Text>
                <Text style={[styles.gstHeaderCell, { flex: 1.4, textAlign: "right" }]}>Taxable</Text>
                <Text style={[styles.gstHeaderCell, { width: 64, textAlign: "right" }]}>CGST</Text>
                <Text style={[styles.gstHeaderCell, { width: 64, textAlign: "right" }]}>SGST</Text>
                <Text style={[styles.gstHeaderCell, { width: 52, textAlign: "right" }]}>Inv</Text>
              </View>
              {gstData.rows.map((row) => (
                <View key={row.hsn} style={styles.gstRow}>
                  <Text style={[styles.gstCell, { flex: 1, fontWeight: "800" }]}>{row.hsn}</Text>
                  <Text style={[styles.gstCell, { flex: 1.4, textAlign: "right" }]}>{rupee(row.taxable_value)}</Text>
                  <Text style={[styles.gstCell, { width: 64, textAlign: "right" }]}>{rupee(row.cgst)}</Text>
                  <Text style={[styles.gstCell, { width: 64, textAlign: "right" }]}>{rupee(row.sgst)}</Text>
                  <Text style={[styles.gstCell, { width: 52, textAlign: "right", color: COLORS.textMuted }]}>{row.invoice_count}</Text>
                </View>
              ))}
              {gstr1Data && gstr1Data.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 8 }]}>B2CS SLAB-WISE (GSTR-1)</Text>
                  <View style={styles.gstTableHeader}>
                    <Text style={[styles.gstHeaderCell, { flex: 1 }]}>GST %</Text>
                    <Text style={[styles.gstHeaderCell, { flex: 1.4, textAlign: "right" }]}>Taxable</Text>
                    <Text style={[styles.gstHeaderCell, { width: 64, textAlign: "right" }]}>CGST</Text>
                    <Text style={[styles.gstHeaderCell, { width: 64, textAlign: "right" }]}>SGST</Text>
                  </View>
                  {gstr1Data.map((row) => (
                    <View key={row.gst_rate} style={styles.gstRow}>
                      <Text style={[styles.gstCell, { flex: 1, fontWeight: "800" }]}>{row.gst_rate}%</Text>
                      <Text style={[styles.gstCell, { flex: 1.4, textAlign: "right" }]}>{rupee(row.taxable_value)}</Text>
                      <Text style={[styles.gstCell, { width: 64, textAlign: "right" }]}>{rupee(row.cgst)}</Text>
                      <Text style={[styles.gstCell, { width: 64, textAlign: "right" }]}>{rupee(row.sgst)}</Text>
                    </View>
                  ))}
                </>
              )}
            </>
          )
        ) : tab === "drugreg" ? (
          !drugRegData || drugRegData.length === 0 ? (
            <EmptyBlock icon="clipboard" label={`No Schedule-H sales for ${monthLabel(drugRegMonth)}`} tone="muted" />
          ) : (
            <>
              <Text style={styles.sectionLabel}>SCHEDULE H / H1 DRUG REGISTER · {monthLabel(drugRegMonth)} ({drugRegData.length} entries)</Text>
              {drugRegData.map((r, i) => (
                <View key={i} style={styles.card}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
                    <Text style={[styles.cardTitle, { fontSize: 13 }]} numberOfLines={1}>{r.medicine_name}{r.strength ? ` ${r.strength}` : ""}</Text>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: COLORS.text }}>× {r.quantity}</Text>
                  </View>
                  <Text style={styles.cardMeta}>Bill {r.bill_no} · {r.date}</Text>
                  <Text style={styles.cardMeta}>Patient: {r.patient_name} · Dr. {r.doctor_name}</Text>
                  {r.rx_no ? <Text style={styles.cardMeta}>Rx: {r.rx_no}</Text> : null}
                </View>
              ))}
            </>
          )
        ) : tab === "analytics" ? (
          !isOwner ? <OwnerOnlyBlock /> :
          !salesData ? (
            <EmptyBlock icon="bar-chart-2" label={`No sales data for ${monthLabel(analyticsMonth)}`} tone="muted" />
          ) : <SalesTab data={salesData} />
        ) : tab === "staff" ? (
          !isOwner ? <OwnerOnlyBlock /> :
          !staffData || staffData.staff.length === 0 ? (
            <EmptyBlock icon="users" label={`No staff data for ${monthLabel(analyticsMonth)}`} tone="muted" />
          ) : <StaffTab data={staffData} />
        ) : tab === "pnl" ? (
          !isOwner ? <OwnerOnlyBlock /> :
          !pnlData ? (
            <EmptyBlock icon="trending-up" label={`No data for ${monthLabel(analyticsMonth)}`} tone="muted" />
          ) : <PnlTab data={pnlData} />
        ) : tab === "doctors" ? (
          !isOwner ? <OwnerOnlyBlock /> :
          !doctorData || doctorData.length === 0 ? (
            <EmptyBlock icon="user-check" label={`No doctor referral data for ${monthLabel(doctorMonth)}`} tone="muted" />
          ) : <DoctorsTab data={doctorData} month={doctorMonth} />
        ) : tab === "purchases" ? (
          !purchaseData ? (
            <EmptyBlock icon="shopping-cart" label={`No purchase data for ${monthLabel(purchaseMonth)}`} tone="muted" />
          ) : <PurchasesTab data={purchaseData} />
        ) : tab === "vendors" ? (
          !vendorData || vendorData.length === 0 ? (
            <EmptyBlock icon="truck" label="No vendors found" tone="muted" />
          ) : <VendorsTab data={vendorData} />
        ) : tab === "customers" ? (
          !customerData || customerData.length === 0 ? (
            <EmptyBlock icon="users" label={`No customer data for ${monthLabel(customerMonth)}`} tone="muted" />
          ) : <CustomersTab data={customerData} />
        ) : tab === "trialbalance" ? (
          !isOwner ? <OwnerOnlyBlock /> :
          !trialBalanceData ? (
            <EmptyBlock icon="list" label="No entries in this period" tone="muted" />
          ) : <TrialBalanceTab data={trialBalanceData} />
        ) : tab === "balancesheet" ? (
          !isOwner ? <OwnerOnlyBlock /> :
          !balanceSheetData ? (
            <EmptyBlock icon="layers" label="No data available" tone="muted" />
          ) : <BalanceSheetTab data={balanceSheetData} />
        ) : null}
      </ScrollView>
    </PageShell>
  );
}

// ── Sales Analytics Tab ──────────────────────────────────────────
function SalesTab({ data }: { data: SalesAnalytics }) {
  const maxQty = Math.max(...data.top_by_qty.slice(0, 10).map((m) => m.qty), 1);
  const maxHour = Math.max(...data.hourly_distribution.map((h) => h.bills), 1);
  const peakHourStr = data.peak_hour !== null
    ? `${data.peak_hour}:00–${data.peak_hour + 1}:00`
    : "—";

  return (
    <>
      {/* KPIs */}
      <View style={styles.kpiRow}>
        <KpiCard label="Revenue" value={rupee(data.total_revenue)} />
        <KpiCard label="Bills" value={String(data.bill_count)} />
        <KpiCard label="Peak Hour" value={peakHourStr} />
      </View>

      {/* Revenue by payment mode */}
      <Text style={styles.sectionLabel}>REVENUE BY PAYMENT MODE</Text>
      {data.by_payment_mode.map((m) => (
        <View key={m.mode} style={styles.card}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: COLORS.text, textTransform: "capitalize" }}>{m.mode}</Text>
            <Text style={{ fontSize: 15, fontWeight: "800", color: COLORS.primary }}>{rupee(m.total)}</Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.min(100, (m.total / data.total_revenue) * 100)}%` as any }]} />
          </View>
        </View>
      ))}

      {/* Top 10 by quantity */}
      {data.top_by_qty.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { marginTop: 8 }]}>TOP SELLERS (BY UNITS)</Text>
          {data.top_by_qty.slice(0, 10).map((m, i) => (
            <View key={m.id} style={styles.rankRow}>
              <Text style={styles.rankNum}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rankName} numberOfLines={1}>{m.name}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${(m.qty / maxQty) * 100}%` as any, backgroundColor: COLORS.primary }]} />
                </View>
              </View>
              <Text style={styles.rankValue}>{m.qty} units</Text>
            </View>
          ))}
        </>
      )}

      {/* Hourly distribution mini-chart */}
      {data.hourly_distribution.some((h) => h.bills > 0) && (
        <>
          <Text style={[styles.sectionLabel, { marginTop: 8 }]}>HOURLY BILLING PATTERN</Text>
          <View style={styles.card}>
            <View style={styles.hourChart}>
              {data.hourly_distribution.map((h) => (
                <View key={h.hour} style={styles.hourCol}>
                  <View style={[styles.hourBar, { height: maxHour > 0 ? `${Math.max(4, (h.bills / maxHour) * 80)}%` as any : "4%" }]} />
                  {h.hour % 6 === 0 && <Text style={styles.hourLabel}>{h.hour}h</Text>}
                </View>
              ))}
            </View>
          </View>
        </>
      )}

      {/* Slow movers */}
      {data.slow_movers.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { marginTop: 8 }]}>SLOW MOVERS</Text>
          {data.slow_movers.map((m) => (
            <View key={m.id} style={[styles.card, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
              <Text style={[styles.cardTitle, { flex: 1 }]} numberOfLines={1}>{m.name}</Text>
              <Text style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: "600" }}>{m.qty} sold</Text>
            </View>
          ))}
        </>
      )}
    </>
  );
}

// ── Staff Tab ───────────────────────────────────────────────────
function StaffTab({ data }: { data: StaffAnalytics }) {
  const maxRev = Math.max(...data.staff.map((s) => s.revenue), 1);
  return (
    <>
      <View style={styles.kpiRow}>
        <KpiCard label="Total Bills" value={String(data.total_bills)} />
        <KpiCard label="Staff Count" value={String(data.staff.length)} />
      </View>
      <Text style={styles.sectionLabel}>PERFORMANCE BY STAFF</Text>
      {data.staff.map((s, i) => (
        <View key={s.email} style={styles.card}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
            <View style={styles.staffAvatar}>
              <Text style={styles.staffAvatarText}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{s.email}</Text>
              <Text style={styles.cardMeta}>{s.bill_count} bills · {rupee(s.revenue)} revenue</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${(s.revenue / maxRev) * 100}%` as any }]} />
              </View>
            </View>
          </View>
          {s.discount_given > 0 && (
            <Text style={[styles.cardMeta, { marginTop: 4, color: COLORS.warning }]}>
              Discounts given: {rupee(s.discount_given)}
            </Text>
          )}
        </View>
      ))}
    </>
  );
}

// ── P&L Tab ─────────────────────────────────────────────────────
function PnlTab({ data }: { data: PnlData }) {
  const router = useRouter();
  const profitColor = data.gross_profit >= 0 ? COLORS.success : COLORS.danger;
  return (
    <>
      {/* Margin hero card */}
      <View style={[styles.gstSummaryCard, { backgroundColor: COLORS.text }]}>
        <Text style={[styles.gstSummaryTitle, { color: "#94A3B8" }]}>GROSS MARGIN · {monthLabel(data.month)}</Text>
        <Text style={[styles.gstBillCount, { color: COLORS.white, fontSize: 42, fontWeight: "900", letterSpacing: -1, marginVertical: 4 }]}>
          {data.margin_pct}%
        </Text>
        <Text style={{ color: data.gross_profit >= 0 ? "#86EFAC" : "#FCA5A5", fontSize: 14, fontWeight: "700" }}>
          {rupee(data.gross_profit)} gross profit
        </Text>
      </View>

      {/* Line items */}
      <Text style={styles.sectionLabel}>BREAKDOWN</Text>
      <PnlLine label="Gross Revenue (before discount)" value={rupee(data.gross_revenue)} />
      <PnlLine label="Discounts Given" value={`– ${rupee(data.discounts_given)}`} negative />
      <PnlLine label="Net Revenue" value={rupee(data.revenue)} bold />
      <PnlLine label="Cost of Goods (Purchases)" value={`– ${rupee(data.cogs)}`} negative />
      <PnlLine label="Gross Profit" value={rupee(data.gross_profit)} bold accent={data.gross_profit >= 0} />
      {(data.total_expenses ?? 0) > 0 && (
        <>
          <PnlLine label="Operating Expenses" value={`– ${rupee(data.total_expenses)}`} negative />
          {data.expenses_by_category && data.expenses_by_category.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 4 }]}>EXPENSE BREAKDOWN</Text>
              {data.expenses_by_category.map((cat) => {
                const pct = data.total_expenses > 0 ? (cat.amount / data.total_expenses) * 100 : 0;
                return (
                  <View key={cat.category} style={styles.expCatRow}>
                    <Text style={styles.expCatLabel}>{cat.category.charAt(0).toUpperCase() + cat.category.slice(1)}</Text>
                    <View style={styles.expCatBarWrap}>
                      <View style={[styles.expCatBar, { width: `${pct}%` as any }]} />
                    </View>
                    <Text style={styles.expCatPct}>{pct.toFixed(0)}%</Text>
                    <Text style={styles.expCatAmt}>{rupee(cat.amount)}</Text>
                  </View>
                );
              })}
            </>
          )}
          <PnlLine label="Net Profit" value={rupee(data.net_profit ?? data.gross_profit)} bold accent={(data.net_profit ?? data.gross_profit) >= 0} />
        </>
      )}

      {/* Footer stats */}
      <View style={styles.kpiRow}>
        <KpiCard label="Bills" value={String(data.bill_count)} />
        <KpiCard label="Purchases" value={String(data.purchase_count)} />
        <KpiCard label="Margin" value={`${data.margin_pct}%`} />
      </View>

      {data.cogs === 0 && (
        <View style={styles.infoNote}>
          <Feather name="info" size={14} color={COLORS.textMuted} />
          <Text style={styles.infoNoteText}>
            No purchases recorded for this month. Add purchase entries to see accurate COGS.
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.pnlBreakdownBtn}
        onPress={() => router.push("/pnl-breakdown" as any)}
      >
        <Feather name="bar-chart-2" size={15} color={COLORS.primary} />
        <Text style={styles.pnlBreakdownBtnText}>View Full P&L Breakdown</Text>
        <Feather name="chevron-right" size={15} color={COLORS.primary} />
      </TouchableOpacity>
    </>
  );
}

function DoctorsTab({ data, month }: { data: DoctorStat[]; month: string }) {
  const router = useRouter();
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  return (
    <>
      <View style={styles.kpiRow}>
        <KpiCard label="Doctors" value={String(data.length)} />
        <KpiCard label="Total Rev." value={rupee(totalRevenue)} />
        <KpiCard label="Top Doctor" value={data[0]?.doctor_name?.split(" ")[0] ?? "—"} />
      </View>
      {data.map((d, i) => (
        <TouchableOpacity
          key={d.doctor_id ?? i}
          style={styles.card}
          onPress={() => router.push({ pathname: "/doctor-bills", params: { doctor_id: d.doctor_id, doctor_name: d.doctor_name, month } } as any)}
          activeOpacity={0.75}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{d.doctor_name}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.cardTitle, { color: COLORS.primary }]}>{rupee(d.revenue)}</Text>
              <Feather name="chevron-right" size={14} color={COLORS.textMuted} />
            </View>
          </View>
          <Text style={styles.cardMeta}>{d.bill_count} bills · tap to see</Text>
          <View style={{ height: 4, backgroundColor: COLORS.border, borderRadius: 2, marginTop: 6 }}>
            <View style={{ height: 4, width: `${(d.revenue / maxRevenue) * 100}%`, backgroundColor: COLORS.primary, borderRadius: 2 }} />
          </View>
        </TouchableOpacity>
      ))}
    </>
  );
}

function PurchasesTab({ data }: { data: PurchaseAnalytics }) {
  const maxAmt = Math.max(...data.by_supplier.map((s) => s.total_amount), 1);
  return (
    <>
      <View style={styles.kpiRow}>
        <KpiCard label="Total Spend" value={rupee(data.total_amount)} />
        <KpiCard label="Bills" value={String(data.purchase_count)} />
        <KpiCard label="Outstanding" value={rupee(Math.max(0, data.total_amount - data.total_paid))} />
      </View>
      {data.by_supplier.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>BY SUPPLIER</Text>
          {data.by_supplier.map((s, i) => (
            <View key={i} style={styles.card}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>{s.supplier_name}</Text>
                <Text style={[styles.cardTitle, { color: COLORS.primary }]}>{rupee(s.total_amount)}</Text>
              </View>
              <Text style={styles.cardMeta}>{s.count} bills · paid {rupee(s.paid_amount)}</Text>
              <View style={{ height: 4, backgroundColor: COLORS.border, borderRadius: 2, marginTop: 6 }}>
                <View style={{ height: 4, width: `${(s.total_amount / maxAmt) * 100}%`, backgroundColor: COLORS.primary, borderRadius: 2 }} />
              </View>
            </View>
          ))}
        </>
      )}
      {data.top_medicines.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { marginTop: 8 }]}>TOP PURCHASED MEDICINES</Text>
          {data.top_medicines.map((m, i) => (
            <View key={i} style={styles.card}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={styles.cardTitle} numberOfLines={1}>{m.medicine_name}</Text>
                <Text style={[styles.cardTitle, { color: COLORS.primary }]}>{rupee(m.total_cost)}</Text>
              </View>
              <Text style={styles.cardMeta}>{m.total_qty} units</Text>
            </View>
          ))}
        </>
      )}
    </>
  );
}

function VendorsTab({ data }: { data: VendorStat[] }) {
  return (
    <>
      <View style={styles.kpiRow}>
        <KpiCard label="Vendors" value={String(data.length)} />
        <KpiCard label="Total Purchased" value={rupee(data.reduce((s, v) => s + v.total_purchases, 0))} />
        <KpiCard label="Outstanding" value={rupee(data.reduce((s, v) => s + Math.max(0, v.outstanding), 0))} />
      </View>
      {data.map((v) => (
        <View key={v.id} style={styles.card}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{v.name}</Text>
            <Text style={[styles.cardTitle, { color: v.outstanding > 0 ? COLORS.danger : COLORS.success }]}>
              {v.outstanding > 0 ? `Due ${rupee(v.outstanding)}` : "Settled"}
            </Text>
          </View>
          <Text style={styles.cardMeta}>
            {v.purchase_count} bills · ₹{v.total_purchases.toLocaleString("en-IN")} total
            {v.last_purchase ? ` · Last: ${v.last_purchase}` : ""}
          </Text>
        </View>
      ))}
    </>
  );
}

function CustomersTab({ data }: { data: CustomerStat[] }) {
  const maxRev = Math.max(...data.map((c) => c.revenue), 1);
  return (
    <>
      <View style={styles.kpiRow}>
        <KpiCard label="Customers" value={String(data.length)} />
        <KpiCard label="Revenue" value={rupee(data.reduce((s, c) => s + c.revenue, 0))} />
        <KpiCard label="Top Customer" value={data[0]?.customer_name?.split(" ")[0] ?? "—"} />
      </View>
      {data.map((c, i) => (
        <View key={c.customer_id ?? i} style={styles.card}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{c.customer_name}</Text>
            <Text style={[styles.cardTitle, { color: COLORS.primary }]}>{rupee(c.revenue)}</Text>
          </View>
          <Text style={styles.cardMeta}>
            {c.bill_count} bills · {c.customer_phone}
            {c.loyalty_points ? ` · ${c.loyalty_points} pts` : ""}
          </Text>
          <View style={{ height: 4, backgroundColor: COLORS.border, borderRadius: 2, marginTop: 6 }}>
            <View style={{ height: 4, width: `${(c.revenue / maxRev) * 100}%`, backgroundColor: COLORS.primary, borderRadius: 2 }} />
          </View>
        </View>
      ))}
    </>
  );
}

function PnlLine({ label, value, negative, bold, accent }: { label: string; value: string; negative?: boolean; bold?: boolean; accent?: boolean }) {
  return (
    <View style={[styles.pnlLine, bold && styles.pnlLineBold]}>
      <Text style={[styles.pnlLabel, bold && { fontWeight: "800", color: COLORS.text }]}>{label}</Text>
      <Text style={[styles.pnlValue, negative && { color: COLORS.danger }, accent && { color: COLORS.success }, bold && { fontWeight: "800" }]}>{value}</Text>
    </View>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function GstTotal({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={[styles.gstTotalValue, accent && { color: COLORS.primary }]}>{value}</Text>
      <Text style={styles.gstTotalLabel}>{label}</Text>
    </View>
  );
}

function OwnerOnlyBlock() {
  return (
    <View style={{ alignItems: "center", padding: 48, gap: 12 }}>
      <Feather name="lock" size={40} color={COLORS.textMuted} />
      <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.text }}>Owner Only</Text>
      <Text style={{ fontSize: 14, color: COLORS.textMuted, textAlign: "center" }}>
        This report is restricted to the owner account.
      </Text>
    </View>
  );
}

function EmptyBlock({ icon, label, tone }: { icon: string; label: string; tone: "success" | "muted" }) {
  const fg = tone === "success" ? COLORS.success : COLORS.textMuted;
  return (
    <View style={styles.emptyBlock}>
      <Feather name={icon as any} size={40} color={fg} />
      <Text style={{ color: fg, fontSize: 15, fontWeight: "600", marginTop: 8 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: "800", color: COLORS.text, letterSpacing: -0.5 },
  tabs: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: 6, alignItems: "center" },
  tabsDesktop: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  tab: {
    flexDirection: "row", gap: 5, alignItems: "center",
    paddingHorizontal: 14, height: 36,
    borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.white },
  windowRow: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: 8 },
  chip: { flexShrink: 0, height: 34, paddingHorizontal: SPACING.md, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, fontWeight: "700", color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.white },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: SPACING.md },
  monthArrow: { padding: 6 },
  monthLabel: { fontSize: 16, fontWeight: "800", color: COLORS.text, minWidth: 180, textAlign: "center" },
  exportBtn: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary, marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, paddingVertical: 10, borderRadius: RADIUS.md, minHeight: 42 },
  exportBtnInline: { alignSelf: "flex-end", paddingHorizontal: SPACING.lg, marginHorizontal: SPACING.lg },
  exportBtnText: { color: COLORS.white, fontWeight: "700", fontSize: 13 },
  card: { padding: SPACING.md, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  cardTitle: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  cardMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  tagRow: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  expiryBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.pill },
  expiryBadgeText: { fontSize: 12, fontWeight: "700" },
  emptyBlock: { padding: 48, alignItems: "center", justifyContent: "center" },
  // GST
  gstSummaryCard: { padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, gap: 8 },
  gstSummaryTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, color: COLORS.textMuted },
  gstBillCount: { fontSize: 13, fontWeight: "600", color: COLORS.textSecondary },
  gstTotalsRow: { flexDirection: "row", marginTop: 4 },
  gstTotalValue: { fontSize: 15, fontWeight: "800", color: COLORS.text },
  gstTotalLabel: { fontSize: 10, fontWeight: "700", color: COLORS.textMuted, letterSpacing: 0.5, marginTop: 2 },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: COLORS.textMuted, marginTop: 4 },
  gstTableHeader: { flexDirection: "row", paddingHorizontal: SPACING.md, paddingVertical: 8, backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border },
  gstHeaderCell: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, color: COLORS.textMuted },
  gstRow: { flexDirection: "row", paddingHorizontal: SPACING.md, paddingVertical: 10, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  gstCell: { fontSize: 13, color: COLORS.text },
  // Analytics
  kpiRow: { flexDirection: "row", gap: SPACING.sm },
  kpiCard: { flex: 1, backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, alignItems: "center", gap: 4 },
  kpiValue: { fontSize: 18, fontWeight: "900", color: COLORS.text, letterSpacing: -0.5 },
  kpiLabel: { fontSize: 10, fontWeight: "700", color: COLORS.textMuted, letterSpacing: 0.5, textAlign: "center" },
  barTrack: { height: 4, backgroundColor: COLORS.border, borderRadius: 2, marginTop: 6, overflow: "hidden" },
  barFill: { height: 4, backgroundColor: COLORS.primaryLight, borderRadius: 2 },
  rankRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.white, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  rankNum: { width: 22, fontSize: 13, fontWeight: "900", color: COLORS.textMuted, textAlign: "center" },
  rankName: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  rankValue: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, minWidth: 64, textAlign: "right" },
  hourChart: { flexDirection: "row", alignItems: "flex-end", height: 80, gap: 2 },
  hourCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" },
  hourBar: { width: "100%", backgroundColor: COLORS.primary, borderRadius: 2, opacity: 0.75 },
  hourLabel: { fontSize: 8, color: COLORS.textMuted, marginTop: 2 },
  // Staff
  staffAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  staffAvatarText: { fontSize: 14, fontWeight: "800", color: COLORS.primary },
  // P&L
  pnlLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, paddingHorizontal: SPACING.md, backgroundColor: COLORS.white, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border },
  pnlLineBold: { borderColor: COLORS.primary },
  pnlLabel: { fontSize: 13, color: COLORS.textSecondary, flex: 1, fontWeight: "600" },
  pnlValue: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  infoNote: { flexDirection: "row", gap: 8, padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border },
  infoNoteText: { flex: 1, fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
  expCatRow: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    backgroundColor: COLORS.white, borderRadius: RADIUS.sm,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, paddingVertical: 8,
  },
  expCatLabel: { fontSize: 12, fontWeight: "700", color: COLORS.text, width: 88 },
  expCatBarWrap: { flex: 1, height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: "hidden" },
  expCatBar: { height: 6, backgroundColor: "#F97316", borderRadius: 3 },
  pnlBreakdownBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm,
    backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.primary + "40",
    paddingVertical: SPACING.md,
  },
  pnlBreakdownBtnText: { fontSize: 14, fontWeight: "700", color: COLORS.primary },
  expCatPct: { fontSize: 11, fontWeight: "700", color: COLORS.textMuted, width: 30, textAlign: "right" },
  expCatAmt: { fontSize: 12, fontWeight: "800", color: COLORS.danger, width: 72, textAlign: "right" },
});

// ── Trial Balance Tab ────────────────────────────────────────────
function TrialBalanceTab({ data }: { data: TrialBalanceResp }) {
  return (
    <>
      <View style={{ backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: COLORS.text }}>
          Trial Balance · {data.date_from} to {data.date_to}
        </Text>
        <Text style={{ fontSize: 11, color: data.balanced ? "#16A34A" : COLORS.danger, fontWeight: "700", marginTop: 4 }}>
          {data.balanced ? "✓ Balanced" : "⚠ Not balanced"} · Total Dr {rupee(data.total_debit)} / Cr {rupee(data.total_credit)}
        </Text>
      </View>

      <View style={{ flexDirection: "row", backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.border }}>
        <Text style={{ flex: 1, fontSize: 10, fontWeight: "800", color: COLORS.textMuted, letterSpacing: 0.5 }}>ACCOUNT</Text>
        <Text style={{ width: 80, fontSize: 10, fontWeight: "800", color: "#16A34A", textAlign: "right", letterSpacing: 0.5 }}>DEBIT</Text>
        <Text style={{ width: 80, fontSize: 10, fontWeight: "800", color: "#2563EB", textAlign: "right", letterSpacing: 0.5 }}>CREDIT</Text>
      </View>

      {data.rows.filter((r) => r.debit > 0 || r.credit > 0).map((row, i) => (
        <View key={i} style={{ flexDirection: "row", backgroundColor: COLORS.white, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" }}>
          <Text style={{ flex: 1, fontSize: 13, color: COLORS.text }} numberOfLines={1}>{row.account}</Text>
          <Text style={{ width: 80, fontSize: 12, fontWeight: "700", color: "#16A34A", textAlign: "right", fontVariant: ["tabular-nums"] }}>
            {row.debit > 0 ? rupee(row.debit) : "—"}
          </Text>
          <Text style={{ width: 80, fontSize: 12, fontWeight: "700", color: "#2563EB", textAlign: "right", fontVariant: ["tabular-nums"] }}>
            {row.credit > 0 ? rupee(row.credit) : "—"}
          </Text>
        </View>
      ))}

      <View style={{ flexDirection: "row", backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, paddingVertical: 10, borderWidth: 2, borderColor: COLORS.border, alignItems: "center" }}>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: "800", color: COLORS.text }}>TOTAL</Text>
        <Text style={{ width: 80, fontSize: 13, fontWeight: "900", color: "#16A34A", textAlign: "right" }}>{rupee(data.total_debit)}</Text>
        <Text style={{ width: 80, fontSize: 13, fontWeight: "900", color: "#2563EB", textAlign: "right" }}>{rupee(data.total_credit)}</Text>
      </View>
    </>
  );
}

// ── Balance Sheet Tab ────────────────────────────────────────────
function BalanceSheetTab({ data }: { data: BalanceSheetResp }) {
  const Section = ({ title, color, items, total }: { title: string; color: string; items: { label: string; value: number }[]; total: number }) => (
    <View style={{ backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden", marginBottom: 8 }}>
      <View style={{ backgroundColor: color, paddingHorizontal: SPACING.md, paddingVertical: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: "800", color: COLORS.white, letterSpacing: 0.5 }}>{title}</Text>
      </View>
      {items.map(({ label, value }, i) => (
        <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: SPACING.md, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: COLORS.border }}>
          <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>{label}</Text>
          <Text style={{ fontSize: 13, fontWeight: "700", color: COLORS.text, fontVariant: ["tabular-nums"] }}>{rupee(value)}</Text>
        </View>
      ))}
      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: SPACING.md, paddingVertical: 10, borderTopWidth: 2, borderTopColor: COLORS.border }}>
        <Text style={{ fontSize: 13, fontWeight: "800", color: COLORS.text }}>Total</Text>
        <Text style={{ fontSize: 14, fontWeight: "900", color: COLORS.text, fontVariant: ["tabular-nums"] }}>{rupee(total)}</Text>
      </View>
    </View>
  );

  return (
    <>
      <Text style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: "700", marginBottom: 8 }}>As of {data.as_of}</Text>
      <Text style={{ fontSize: 10, fontWeight: "800", color: COLORS.textMuted, letterSpacing: 1, marginBottom: 4 }}>ASSETS</Text>
      <Section
        title="CURRENT ASSETS"
        color="#16A34A"
        items={[
          { label: "Cash & Bank", value: data.assets.cash },
          { label: "Inventory (at cost)", value: data.assets.inventory },
          { label: "Receivables (Credit Bills)", value: data.assets.receivables },
        ]}
        total={data.assets.total}
      />
      <Text style={{ fontSize: 10, fontWeight: "800", color: COLORS.textMuted, letterSpacing: 1, marginBottom: 4 }}>LIABILITIES</Text>
      <Section
        title="CURRENT LIABILITIES"
        color="#DC2626"
        items={[{ label: "Accounts Payable (Suppliers)", value: data.liabilities.payables }]}
        total={data.liabilities.total}
      />
      <Text style={{ fontSize: 10, fontWeight: "800", color: COLORS.textMuted, letterSpacing: 1, marginBottom: 4 }}>EQUITY</Text>
      <Section
        title="OWNER'S EQUITY"
        color="#7C3AED"
        items={[{ label: "Retained Earnings (Net Profit)", value: data.equity.retained_earnings }]}
        total={data.equity.total}
      />
      <View style={{ backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 2, borderColor: data.balanced ? "#16A34A" : COLORS.danger, padding: SPACING.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 13, fontWeight: "800", color: COLORS.text }}>Total Assets</Text>
          <Text style={{ fontSize: 14, fontWeight: "900", color: COLORS.text }}>{rupee(data.assets.total)}</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: "800", color: COLORS.text }}>Liabilities + Equity</Text>
          <Text style={{ fontSize: 14, fontWeight: "900", color: COLORS.text }}>{rupee(data.liabilities.total + data.equity.total)}</Text>
        </View>
        <Text style={{ fontSize: 11, fontWeight: "700", color: data.balanced ? "#16A34A" : COLORS.danger, marginTop: 6 }}>
          {data.balanced ? "✓ Balance sheet balances" : "⚠ Does not balance — journal entries may be needed"}
        </Text>
      </View>
    </>
  );
}
