import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { loadCatalog, getBusinessType, getFinancialSettings, CatalogResult } from '../application/catalogService';
import type { Product } from '../domain/catalog';
import type { OrderChannel } from '../domain/cart';
import type { CashierProfile } from '../domain/auth';
import { useCart } from './useCart';
import ModifierModal from './ModifierModal';

const DISCOUNT_OPTIONS = [0, 5, 10, 15, 20];
const CHANNEL_LABELS: Record<OrderChannel, string> = {
  dine_in: 'بالمطعم',
  pickup: 'استلام',
  delivery: 'توصيل',
};

/**
 * Checkpoint 3 screen extended for Checkpoint 4 (Cart) -- real categories/
 * products (unchanged from Checkpoint 3) plus a real cart: modifier
 * groups, quantities, percentage discount, order channel, and the exact
 * subtotal/discount/VAT/total math from domain/cart.ts. Order submission/
 * payment is a later checkpoint -- the "إتمام الطلب" button below is
 * intentionally a dead end for now (disabled with a note), per the
 * explicit instruction not to move to payment before Cart has functional
 * parity.
 */
export default function ProductsScreen({ cashier }: { cashier: CashierProfile }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState<CatalogResult | null>(null);
  const [financial, setFinancial] = useState({ vatRegistered: true, vatRate: 0.15, pricesIncludeVat: true });
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [modifierTarget, setModifierTarget] = useState<Product | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const businessType = await getBusinessType(cashier.business_id);
        const [result, settings] = await Promise.all([
          loadCatalog(cashier.business_id, businessType),
          getFinancialSettings(cashier.business_id),
        ]);
        setCatalog(result);
        setFinancial(settings);
        if (result.categories.length > 0) {
          setActiveCategoryId(result.categories[0].id);
        }
      } catch (e) {
        setError('تعذر تحميل المنتجات — تحقق من الاتصال.');
      } finally {
        setLoading(false);
      }
    })();
  }, [cashier.business_id]);

  const productsById = useMemo(() => {
    const map = new Map<number, Product>();
    catalog?.products.forEach(p => map.set(p.id, p));
    return map;
  }, [catalog]);

  const cart = useCart(
    productsById,
    catalog?.modifiersByProductId || {},
    financial.vatRegistered,
    financial.vatRate,
    financial.pricesIncludeVat,
  );

  const visibleProducts = useMemo<Product[]>(() => {
    if (!catalog) return [];
    if (!activeCategoryId) return catalog.products;
    return catalog.products.filter(p => p.categoryId === activeCategoryId);
  }, [catalog, activeCategoryId]);

  const handleTapProduct = (product: Product) => {
    const modDef = catalog?.modifiersByProductId[product.id];
    if (modDef) {
      setModifierTarget(product);
    } else {
      cart.addProduct(product.id);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!catalog || catalog.categories.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.subtitle}>لا يوجد منتجات لهذا المشروع.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {catalog.usingOfflineSnapshot && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>لا يوجد اتصال — يعمل بمنيو محفوظ محليًا</Text>
        </View>
      )}

      <View style={styles.mainRow}>
        <View style={styles.productsCol}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryBar}>
            {catalog.categories.map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryTab, activeCategoryId === cat.id && styles.categoryTabActive]}
                onPress={() => setActiveCategoryId(cat.id)}>
                <Text
                  style={[styles.categoryTabText, activeCategoryId === cat.id && styles.categoryTabTextActive]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <FlatList
            data={visibleProducts}
            keyExtractor={p => String(p.id)}
            numColumns={2}
            contentContainerStyle={styles.grid}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.productCard} onPress={() => handleTapProduct(item)}>
                <Text style={styles.productName} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.productPrice}>{item.price.toFixed(2)} ر.س</Text>
                {item.isService && item.durationMinutes ? (
                  <Text style={styles.productMeta}>{item.durationMinutes} د</Text>
                ) : null}
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.subtitle}>لا يوجد منتجات في هذا التصنيف.</Text>}
          />
        </View>

        <View style={styles.cartCol}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.channelBar}>
            {(Object.keys(CHANNEL_LABELS) as OrderChannel[]).map(ch => (
              <TouchableOpacity
                key={ch}
                style={[styles.channelTab, cart.orderChannel === ch && styles.channelTabActive]}
                onPress={() => cart.setOrderChannel(ch)}>
                <Text style={[styles.channelTabText, cart.orderChannel === ch && styles.channelTabTextActive]}>
                  {CHANNEL_LABELS[ch]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView style={styles.cartLines}>
            {cart.cart.length === 0 && <Text style={styles.subtitle}>السلة فارغة</Text>}
            {cart.cart.map(line => {
              const product = productsById.get(line.productId);
              return (
                <View key={line.lineId} style={styles.cartLine}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cartLineName} numberOfLines={1}>
                      {product?.name || '—'}
                    </Text>
                    <Text style={styles.cartLinePrice}>{cart.unitPriceOf(line).toFixed(2)} ر.س</Text>
                  </View>
                  <View style={styles.qtyControls}>
                    <TouchableOpacity onPress={() => cart.changeQty(line.lineId, -1)} style={styles.qtyButton}>
                      <Text style={styles.qtyButtonText}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.qtyValue}>{line.qty}</Text>
                    <TouchableOpacity onPress={() => cart.changeQty(line.lineId, 1)} style={styles.qtyButton}>
                      <Text style={styles.qtyButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.discountBar}>
            {DISCOUNT_OPTIONS.map(pct => (
              <TouchableOpacity
                key={pct}
                style={[styles.discountChip, cart.discountPct === pct && styles.discountChipActive]}
                onPress={() => cart.setDiscountPct(pct)}>
                <Text style={[styles.discountChipText, cart.discountPct === pct && styles.discountChipTextActive]}>
                  {pct === 0 ? 'بدون خصم' : `${pct}%`}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>المجموع الفرعي</Text>
              <Text style={styles.totalsValue}>{cart.totals.subtotal.toFixed(2)}</Text>
            </View>
            {cart.totals.discount > 0 && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>الخصم</Text>
                <Text style={styles.totalsValue}>-{cart.totals.discount.toFixed(2)}</Text>
              </View>
            )}
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>ضريبة القيمة المضافة</Text>
              <Text style={styles.totalsValue}>{cart.totals.vat.toFixed(2)}</Text>
            </View>
            <View style={[styles.totalsRow, styles.totalsRowFinal]}>
              <Text style={styles.totalsLabelFinal}>الإجمالي</Text>
              <Text style={styles.totalsValueFinal}>{cart.totals.total.toFixed(2)} ر.س</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.checkoutButton} disabled>
            <Text style={styles.checkoutButtonText}>إتمام الطلب (Checkpoint 5-7)</Text>
          </TouchableOpacity>
        </View>
      </View>

      {modifierTarget && catalog.modifiersByProductId[modifierTarget.id] && (
        <ModifierModal
          visible
          productName={modifierTarget.name}
          modDef={catalog.modifiersByProductId[modifierTarget.id]}
          onCancel={() => setModifierTarget(null)}
          onConfirm={config => {
            cart.addWithConfig(modifierTarget.id, config, 1);
            setModifierTarget(null);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f2f5f0' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  subtitle: { fontSize: 13, color: '#666', textAlign: 'center', padding: 12 },
  error: { color: '#c0392b', fontSize: 14, textAlign: 'center' },
  offlineBanner: { backgroundColor: '#fff3cd', padding: 8 },
  offlineBannerText: { fontSize: 12, color: '#856404', textAlign: 'center' },
  mainRow: { flex: 1, flexDirection: 'row' },
  productsCol: { flex: 2 },
  cartCol: { flex: 1, backgroundColor: '#fff', borderLeftWidth: 1, borderLeftColor: '#e0e0e0' },
  categoryBar: { flexGrow: 0, paddingHorizontal: 8, paddingVertical: 10 },
  categoryTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  categoryTabActive: { backgroundColor: '#8bc34a', borderColor: '#8bc34a' },
  categoryTabText: { fontSize: 13, color: '#444' },
  categoryTabTextActive: { color: '#1a1a1a', fontWeight: '700' },
  grid: { padding: 8 },
  productCard: {
    flex: 1,
    margin: 6,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    minHeight: 90,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  productName: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  productPrice: { fontSize: 13, color: '#2e7d32', fontWeight: '600' },
  productMeta: { fontSize: 11, color: '#888', marginTop: 4 },
  channelBar: { flexGrow: 0, padding: 8 },
  channelTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f2f5f0',
    marginHorizontal: 3,
  },
  channelTabActive: { backgroundColor: '#3f51b5' },
  channelTabText: { fontSize: 11, color: '#444' },
  channelTabTextActive: { color: '#fff', fontWeight: '700' },
  cartLines: { flex: 1, paddingHorizontal: 10 },
  cartLine: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  cartLineName: { fontSize: 13, fontWeight: '600' },
  cartLinePrice: { fontSize: 11, color: '#666' },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyButtonText: { fontSize: 15, fontWeight: '700' },
  qtyValue: { fontSize: 13, minWidth: 18, textAlign: 'center' },
  discountBar: { flexGrow: 0, paddingHorizontal: 8, paddingTop: 6 },
  discountChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#f2f5f0',
    marginHorizontal: 3,
  },
  discountChipActive: { backgroundColor: '#ff9800' },
  discountChipText: { fontSize: 11, color: '#444' },
  discountChipTextActive: { color: '#fff', fontWeight: '700' },
  totalsBox: { padding: 12, borderTopWidth: 1, borderTopColor: '#e0e0e0' },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totalsRowFinal: { marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#eee' },
  totalsLabel: { fontSize: 12, color: '#666' },
  totalsValue: { fontSize: 12, color: '#333' },
  totalsLabelFinal: { fontSize: 14, fontWeight: '800' },
  totalsValueFinal: { fontSize: 14, fontWeight: '800', color: '#2e7d32' },
  checkoutButton: { backgroundColor: '#ccc', padding: 14, alignItems: 'center', margin: 12, borderRadius: 10 },
  checkoutButtonText: { color: '#666', fontWeight: '700', fontSize: 12 },
});
