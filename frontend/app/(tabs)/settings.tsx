import { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { PageShell } from "@/src/components/PageShell";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { confirmDestructive } from "@/src/confirm";
import { alertMsg } from "@/src/dialog";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { useSync } from "@/src/sync";
import { useStoreConfigContext, STORE_TYPE_OPTIONS } from "@/src/storeConfig";

type Shop = {
  name: string;
  address: string;
  phone: string;
  gstin: string;
  dl_no: string;
  gst_rate: number;
  mode: string;
  invoice_prefix: string;
};

export default function Settings() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const sync = useSync();
  const { config, reload: reloadConfig } = useStoreConfigContext();
  const [shop, setShop] = useState<Shop | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pwModal, setPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api<Shop>("/shop");
      setShop(s);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!shop) return;
    if (user?.role !== "owner") {
      alertMsg("Owner only", "Only the shop owner can update the profile.");
      return;
    }
    setSaving(true);
    try {
      await api("/shop", { method: "PUT", body: shop });
      await reloadConfig();
      alertMsg("Saved", "Shop profile updated.");
    } catch (e: any) {
      alertMsg("Save failed", e?.message || "");
    } finally {
      setSaving(false);
    }
  };

  const doLogout = async () => {
    confirmDestructive("Sign out?", "You'll need to sign in again.", "Sign out", async () => {
      await logout();
      router.replace("/login");
    });
  };

  const changePassword = async () => {
    if (!pwForm.current || !pwForm.next) { alertMsg("Required", "Fill all fields"); return; }
    if (pwForm.next.length < 8) { alertMsg("Too short", "New password must be at least 8 characters"); return; }
    if (pwForm.next !== pwForm.confirm) { alertMsg("Mismatch", "New passwords don't match"); return; }
    setPwSaving(true);
    try {
      await api("/auth/change-password", { method: "POST", body: { current_password: pwForm.current, new_password: pwForm.next } });
      setPwModal(false);
      setPwForm({ current: "", next: "", confirm: "" });
      alertMsg("Done", "Password changed successfully.");
    } catch (e: any) {
      alertMsg("Failed", e?.message || "Incorrect current password");
    } finally { setPwSaving(false); }
  };

  if (loading || !shop) {
    return (
      <PageShell scrollable={false}>
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      </PageShell>
    );
  }

  const readOnly = user?.role !== "owner";

  return (
    <PageShell scrollable={false} noPadding>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100, gap: SPACING.lg }}>
        <Text style={styles.title}>Settings</Text>

        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Feather name="user" size={26} color={COLORS.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user?.name}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
          </View>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user?.role?.toUpperCase()}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>SHOP PROFILE</Text>
        <View style={styles.card}>
          <FieldRow label="Shop name" value={shop.name} onChange={(v) => setShop({ ...shop, name: v })} readOnly={readOnly} testID="settings-shop-name" />
          <FieldRow label="Address" value={shop.address} onChange={(v) => setShop({ ...shop, address: v })} readOnly={readOnly} multiline testID="settings-shop-address" />
          <FieldRow label="Phone" value={shop.phone} onChange={(v) => setShop({ ...shop, phone: v })} readOnly={readOnly} keyboardType="phone-pad" testID="settings-shop-phone" />
          <FieldRow label="GSTIN" value={shop.gstin} onChange={(v) => setShop({ ...shop, gstin: v })} readOnly={readOnly} testID="settings-gstin" />
          {config.dl_no_label && (
            <FieldRow label={config.dl_no_label} value={shop.dl_no} onChange={(v) => setShop({ ...shop, dl_no: v })} readOnly={readOnly} testID="settings-dl" />
          )}
          <FieldRow label="Invoice Prefix (e.g. INV, RX, GST)" value={shop.invoice_prefix ?? "INV"} onChange={(v) => setShop({ ...shop, invoice_prefix: v })} readOnly={readOnly} testID="settings-invoice-prefix" />
        </View>

        {/* Store type picker — owner only */}
        {!readOnly && (
          <>
            <Text style={styles.sectionLabel}>STORE TYPE</Text>
            <View style={styles.storeTypeGrid}>
              {STORE_TYPE_OPTIONS.map((opt) => {
                const active = (shop.mode || "pharmacy") === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.storeTypeCard, active && styles.storeTypeCardActive]}
                    onPress={() => setShop({ ...shop, mode: opt.value })}
                  >
                    <Feather name={opt.icon as any} size={18} color={active ? COLORS.primary : COLORS.textMuted} />
                    <Text style={[styles.storeTypeLabel, active && styles.storeTypeLabelActive]}>
                      {opt.label}
                    </Text>
                    {active && <View style={styles.storeTypeCheck}><Feather name="check" size={10} color={COLORS.white} /></View>}
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.storeTypeHint}>
              Changing store type updates labels, visible fields, and report tabs across the app.
            </Text>
          </>
        )}

        {!readOnly && (
          <TouchableOpacity
            testID="settings-save-button"
            style={styles.primaryBtn}
            onPress={save}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator color={COLORS.white} /> : (
              <>
                <Feather name="save" size={20} color={COLORS.white} />
                <Text style={styles.primaryBtnText}>Save Profile</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {user?.role === "owner" && (
          <>
            <Text style={styles.sectionLabel}>TEAM</Text>
            <TouchableOpacity
              testID="settings-manage-staff"
              style={styles.linkRow}
              onPress={() => router.push("/staff")}
            >
              <Feather name="users" size={20} color={COLORS.primary} />
              <Text style={styles.linkText}>Manage staff</Text>
              <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </>
        )}

        <Text style={styles.sectionLabel}>ACCOUNTS</Text>
        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/general-ledger" as any)}>
          <Feather name="book-open" size={20} color={COLORS.primary} />
          <Text style={styles.linkText}>General Ledger</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/cashflow" as any)}>
          <Feather name="activity" size={20} color={COLORS.primary} />
          <Text style={styles.linkText}>Cash Flow</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>BUSINESS</Text>
        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/customers")}>
          <Feather name="users" size={20} color={COLORS.primary} />
          <Text style={styles.linkText}>Customers &amp; Credit</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/suppliers")}>
          <Feather name="truck" size={20} color={COLORS.primary} />
          <Text style={styles.linkText}>Suppliers &amp; Purchases</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
        {config.doctor_referrals && (
          <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/doctors")}>
            <Feather name="user-check" size={20} color={COLORS.primary} />
            <Text style={styles.linkText}>{config.referrer_label ?? "Doctor"}s &amp; Referrals</Text>
            <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/purchase-returns" as any)}>
          <Feather name="corner-up-left" size={20} color={COLORS.warning} />
          <Text style={styles.linkText}>Purchase Returns (Debit Notes)</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/barcode-labels")}>
          <Feather name="tag" size={20} color={COLORS.primary} />
          <Text style={styles.linkText}>Barcode Label Printing</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/stock-adjust")}>
          <Feather name="edit-3" size={20} color={COLORS.warning} />
          <Text style={styles.linkText}>Stock Adjustment / Write-off</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/eod-close")}>
          <Feather name="moon" size={20} color={COLORS.primary} />
          <Text style={styles.linkText}>EOD Cash Closing</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>OTHER</Text>
        <TouchableOpacity
          testID="settings-history"
          style={styles.linkRow}
          onPress={() => router.push("/history")}
        >
          <Feather name="clock" size={20} color={COLORS.primary} />
          <Text style={styles.linkText}>Bill history</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        {user?.role === "owner" && (
          <TouchableOpacity
            testID="settings-import-csv"
            style={styles.linkRow}
            onPress={() => router.push("/import-csv")}
          >
            <Feather name="upload" size={20} color={COLORS.primary} />
            <Text style={styles.linkText}>Import medicines (CSV)</Text>
            <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          testID="settings-outbox"
          style={styles.linkRow}
          onPress={() => router.push("/outbox")}
        >
          <Feather name="upload-cloud" size={20} color={sync.pendingCount > 0 ? COLORS.warning : COLORS.primary} />
          <Text style={styles.linkText}>
            Offline queue
            {sync.pendingCount > 0 ? ` · ${sync.pendingCount} pending` : ""}
          </Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/reorder")}>
          <Feather name="refresh-cw" size={20} color={COLORS.warning} />
          <Text style={styles.linkText}>Reorder Centre</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/audit-log" as any)}>
          <Feather name="shield" size={20} color={COLORS.primary} />
          <Text style={styles.linkText}>Audit Log</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/notification-settings" as any)}>
          <Feather name="bell" size={20} color={COLORS.primary} />
          <Text style={styles.linkText}>Notification Settings</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/batch-writeoff" as any)}>
          <Feather name="trash-2" size={20} color={COLORS.danger} />
          <Text style={styles.linkText}>Expiry Write-Off</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/setup-2fa" as any)}>
          <Feather name="shield" size={20} color="#7C3AED" />
          <Text style={styles.linkText}>Two-Factor Auth (2FA)</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/app-lock-setup")}>
          <Feather name="lock" size={20} color={COLORS.primary} />
          <Text style={styles.linkText}>App Lock (PIN / Biometric)</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/subscription-plan" as any)}>
          <Feather name="star" size={20} color="#D97706" />
          <Text style={styles.linkText}>Subscription Plan</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/shop-switcher" as any)}>
          <Feather name="home" size={20} color="#059669" />
          <Text style={styles.linkText}>Multi-Store Manager</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/journal-entries" as any)}>
          <Feather name="book" size={20} color={COLORS.primary} />
          <Text style={styles.linkText}>Journal Entries</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/stockout-risk" as any)}>
          <Feather name="alert-triangle" size={20} color={COLORS.danger} />
          <Text style={styles.linkText}>Stock-Out Risk Forecast</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        {config.symptom_suggest && (
          <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/medicine-suggest" as any)}>
            <Feather name="activity" size={20} color="#16A34A" />
            <Text style={styles.linkText}>{config.product_label} by Symptom</Text>
            <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/scan-invoice" as any)}>
          <Feather name="file-text" size={20} color={COLORS.primary} />
          <Text style={styles.linkText}>Scan Invoice (OCR)</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/backup" as any)}>
          <Feather name="download-cloud" size={20} color="#2563EB" />
          <Text style={styles.linkText}>Backup & Data Retention</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkRow} onPress={() => { setPwForm({ current: "", next: "", confirm: "" }); setPwModal(true); }}>
          <Feather name="key" size={20} color={COLORS.primary} />
          <Text style={styles.linkText}>Change Password</Text>
          <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="settings-logout"
          style={[styles.linkRow, { borderColor: COLORS.dangerBg }]}
          onPress={doLogout}
        >
          <Feather name="log-out" size={20} color={COLORS.danger} />
          <Text style={[styles.linkText, { color: COLORS.danger }]}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Password Change Modal */}
      <Modal visible={pwModal} animationType="slide" transparent onRequestClose={() => setPwModal(false)}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Change Password</Text>
              <TouchableOpacity onPress={() => setPwModal(false)}>
                <Feather name="x" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: SPACING.lg, gap: SPACING.md }}>
              <PwField label="Current Password" value={pwForm.current} onChange={(v) => setPwForm({ ...pwForm, current: v })} />
              <PwField label="New Password (min 8 chars)" value={pwForm.next} onChange={(v) => setPwForm({ ...pwForm, next: v })} />
              <PwField label="Confirm New Password" value={pwForm.confirm} onChange={(v) => setPwForm({ ...pwForm, confirm: v })} />
              <TouchableOpacity style={[styles.primaryBtn, pwSaving && { opacity: 0.6 }]} onPress={changePassword} disabled={pwSaving}>
                {pwSaving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.primaryBtnText}>Update Password</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </PageShell>
  );
}

type FieldRowProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  multiline?: boolean;
  keyboardType?: import("react-native").KeyboardTypeOptions;
  testID?: string;
};
function PwField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.textSecondary }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, backgroundColor: COLORS.surface }}>
        <TextInput style={{ flex: 1, height: 48, paddingHorizontal: SPACING.md, fontSize: 15, color: COLORS.text }} value={value} onChangeText={onChange} secureTextEntry={!show} autoCapitalize="none" placeholderTextColor={COLORS.textMuted} />
        <TouchableOpacity onPress={() => setShow(!show)} style={{ padding: SPACING.md }}>
          <Feather name={show ? "eye-off" : "eye"} size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function FieldRow({ label, value, onChange, readOnly, multiline, keyboardType, testID }: FieldRowProps) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        style={[styles.field, multiline && { minHeight: 80, textAlignVertical: "top" }]}
        value={value}
        onChangeText={onChange}
        editable={!readOnly}
        multiline={multiline}
        keyboardType={keyboardType}
        placeholderTextColor={COLORS.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: "800", color: COLORS.text, letterSpacing: -0.5 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.lg,
    backgroundColor: COLORS.text,
    borderRadius: RADIUS.lg,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: { color: COLORS.white, fontSize: 17, fontWeight: "800" },
  profileEmail: { color: "#CBD5E1", fontSize: 12, marginTop: 2 },
  roleBadge: {
    backgroundColor: "rgba(37,99,235,0.25)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
  },
  roleText: { fontSize: 10, fontWeight: "800", color: "#DBEAFE", letterSpacing: 1 },
  card: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
  },
  fieldLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.textSecondary },
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    fontSize: 15,
    color: COLORS.text,
  },
  primaryBtn: {
    minHeight: 56,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  linkText: { flex: 1, fontSize: 15, fontWeight: "600", color: COLORS.text },
  storeTypeGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm,
  },
  storeTypeCard: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    position: "relative",
  },
  storeTypeCardActive: {
    borderColor: COLORS.primary, backgroundColor: "#EFF6FF",
  },
  storeTypeLabel: { fontSize: 12, fontWeight: "600", color: COLORS.textSecondary },
  storeTypeLabelActive: { color: COLORS.primary },
  storeTypeCheck: {
    position: "absolute", top: -5, right: -5,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: "center", justifyContent: "center",
  },
  storeTypeHint: {
    fontSize: 11, color: COLORS.textMuted, lineHeight: 16, marginTop: 4,
  },
  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
});
