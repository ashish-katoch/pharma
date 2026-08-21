import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, TextInput,
} from "react-native";
import { PageShell } from "@/src/components/PageShell";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { api, setToken } from "@/src/api";
import { COLORS, SPACING, RADIUS } from "@/src/theme";

type Shop = { id: string; name: string; address?: string; phone?: string };
type SwitchResp = { access_token: string; token_type: string; shop_id: string; shop_name: string };

export default function ShopSwitcherScreen() {
  const router = useRouter();
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const loadShops = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Shop[]>("/shops");
      setShops(data);
    } catch (e: unknown) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadShops(); }, [loadShops]));

  const switchShop = async (shopId: string, shopName: string) => {
    setSwitching(shopId);
    try {
      const resp = await api<SwitchResp>("/auth/switch-shop", {
        method: "POST",
        body: { shop_id: shopId },
      });
      await setToken(resp.access_token);
      Alert.alert("Switched", `Now operating as "${resp.shop_name}"`, [
        { text: "OK", onPress: () => router.replace("/(tabs)/home") },
      ]);
    } catch (e: unknown) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setSwitching(null);
    }
  };

  const createShop = async () => {
    if (!newName.trim()) { Alert.alert("Name required"); return; }
    setCreating(true);
    try {
      await api<Shop>("/shops", {
        method: "POST",
        body: { name: newName.trim(), address: newAddress.trim(), phone: newPhone.trim() },
      });
      setNewName(""); setNewAddress(""); setNewPhone("");
      setShowCreate(false);
      await loadShops();
    } catch (e: unknown) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const deleteShop = (shop: Shop) => {
    Alert.alert(
      "Delete Shop",
      `Remove "${shop.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api(`/shops/${shop.id}`, { method: "DELETE" });
              await loadShops();
            } catch (e: unknown) {
              Alert.alert("Error", (e as Error).message);
            }
          },
        },
      ]
    );
  };

  const AddBtn = (
    <TouchableOpacity onPress={() => setShowCreate((v) => !v)} style={styles.addBtn}>
      <Feather name={showCreate ? "x" : "plus"} size={18} color={COLORS.white} />
    </TouchableOpacity>
  );

  return (
    <PageShell title="Multi-Store" showBack scrollable={false} noPadding rightAction={AddBtn}>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Create new shop form */}
        {showCreate && (
          <View style={styles.createCard}>
            <Text style={styles.createTitle}>Add New Store</Text>
            <Text style={styles.fieldLabel}>Store Name *</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. City Branch"
              placeholderTextColor={COLORS.textMuted}
            />
            <Text style={styles.fieldLabel}>Address</Text>
            <TextInput
              style={styles.input}
              value={newAddress}
              onChangeText={setNewAddress}
              placeholder="Street, City"
              placeholderTextColor={COLORS.textMuted}
            />
            <Text style={styles.fieldLabel}>Phone</Text>
            <TextInput
              style={styles.input}
              value={newPhone}
              onChangeText={setNewPhone}
              placeholder="+91 98765 43210"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="phone-pad"
            />
            <TouchableOpacity
              style={[styles.createBtn, creating && { opacity: 0.6 }]}
              onPress={createShop}
              disabled={creating}
            >
              {creating
                ? <ActivityIndicator color={COLORS.white} />
                : <Text style={styles.createBtnText}>Create Store</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Feather name="info" size={14} color={COLORS.primary} />
          <Text style={styles.infoText}>
            Each store has its own inventory, billing, and reports. Tap a store to switch your active session.
          </Text>
        </View>

        {/* Shop list */}
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading stores…</Text>
          </View>
        ) : shops.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="home" size={32} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>No stores yet. Tap + to add one.</Text>
          </View>
        ) : (
          shops.map((shop) => (
            <View key={shop.id} style={styles.shopCard}>
              <View style={styles.shopIcon}>
                <Feather name="home" size={20} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shopName}>{shop.name}</Text>
                {shop.address ? (
                  <Text style={styles.shopMeta}>{shop.address}</Text>
                ) : null}
                {shop.phone ? (
                  <Text style={styles.shopMeta}>{shop.phone}</Text>
                ) : null}
              </View>
              <View style={styles.shopActions}>
                <TouchableOpacity
                  style={[styles.switchBtn, switching === shop.id && { opacity: 0.6 }]}
                  onPress={() => switchShop(shop.id, shop.name)}
                  disabled={switching === shop.id}
                >
                  {switching === shop.id
                    ? <ActivityIndicator size="small" color={COLORS.white} />
                    : <Text style={styles.switchBtnText}>Switch</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => deleteShop(shop)}
                >
                  <Feather name="trash-2" size={14} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: COLORS.primary,
    alignItems: "center", justifyContent: "center",
  },
  scroll: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 },
  createCard: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, gap: SPACING.sm,
  },
  createTitle: { fontSize: 15, fontWeight: "700", color: COLORS.text, marginBottom: SPACING.sm },
  fieldLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5, color: COLORS.textSecondary },
  input: {
    minHeight: 48, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, fontSize: 15, color: COLORS.text,
  },
  createBtn: {
    marginTop: SPACING.sm, backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md, minHeight: 48,
    alignItems: "center", justifyContent: "center",
  },
  createBtnText: { color: COLORS.white, fontWeight: "700", fontSize: 15 },
  infoBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm,
    backgroundColor: "#EFF6FF", borderRadius: RADIUS.md, padding: SPACING.md,
    borderWidth: 1, borderColor: "#BFDBFE",
  },
  infoText: { flex: 1, fontSize: 13, color: COLORS.primary, lineHeight: 18 },
  loadingRow: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    padding: SPACING.xl, justifyContent: "center",
  },
  loadingText: { fontSize: 14, color: COLORS.textSecondary },
  emptyCard: {
    alignItems: "center", gap: SPACING.md, padding: SPACING.xxl,
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  emptyText: { fontSize: 14, color: COLORS.textMuted, textAlign: "center" },
  shopCard: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
  },
  shopIcon: {
    width: 44, height: 44, borderRadius: RADIUS.md,
    backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center",
  },
  shopName: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  shopMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  shopActions: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  switchBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md, paddingVertical: 8,
    minWidth: 64, alignItems: "center", justifyContent: "center",
  },
  switchBtnText: { color: COLORS.white, fontWeight: "700", fontSize: 13 },
  deleteBtn: {
    width: 34, height: 34, borderRadius: RADIUS.sm,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center",
  },
});
