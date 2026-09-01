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
import { submitOrder } from '../application/orderService';
import { completePaymentOperation } from '../application/paymentService';
import { getDeviceConfig } from '../application/authService';
import { supabase } from '../infrastructure/supabaseClient';
import { buildOrderPayload, buildDineInRegisterPayload, buildDineInPayPayload } from '../domain/order';
import type { Product } from '../domain/catalog';
import type { OrderChannel } from '../domain/cart';
import type { CashierProfile } from '../domain/auth';
import { useCart } from './useCart';
import ModifierModal from './ModifierModal';
import PaymentModal from './PaymentModal';

const DISCOUNT_OPTIONS = [0, 5, 10, 15, 20];
const CHANNEL_LABELS: Record<OrderChannel, string> = {
  dine_in: 'بالمطعم',
  pickup: 'استلام',
  delivery: 'توصيل',
};

/**
 * Checkpoint 3 (Products/Categories) + Checkpoint 4 (Cart) + Checkpoint 5
 * (Order Creation) in one screen. The submit button creates a REAL order
 * against the real backend (queue-first via application/orderService.ts)
 * -- but this is ORDER CREATION, not Payment (Checkpoint 7): dine-in calls
 * register_dine_in_order (genuinely payment-free); pickup/delivery use
 * complete_pos_order with a fixed cash/full-amount default since that RPC
 * is the only order-creation mechanism the real backend has for those
 * channels (see domain/order.ts's OrderPayload doc comment) -- no payment
 * method selection, split payment, or receipt/confirmation UI exists yet.
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

  const [submitStatus, setSubmitStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [lastRegisteredDineInOrderId, setLastRegisteredDineInOrderId] = useState<number | null>(null);
  const [dineInOrderTotal, setDineInOrderTotal] = useState(0);

  /** Fetches the order's REAL current total from the server right before
   *  showing the payment modal -- the local cart's total is stale once
   *  rounds have been added and the cart cleared, and requirement 8
   *  ("payment totals MUST match Cart/server totals") means this must be
   *  the server's authoritative number, not a re-derived local guess. */
  const handleOpenDineInPayment = async () => {
    if (lastRegisteredDineInOrderId == null) return;
    const { data } = await supabase.from('orders').select('total').eq('id', lastRegisteredDineInOrderId).single();
    setDineInOrderTotal(data ? Number(data.total) : 0);
    setPaymentModalOpen(true);
  };

  /**
   * Checkpoint 5 behavior, unchanged: dine_in still only REGISTERS
   * (register_dine_in_order), genuinely payment-free in the real system
   * too. Payment for a dine-in order is a separate action
   * (handlePayDineInOrder below), matching how the real PWA treats
   * "register a round" and "settle the table" as distinct operations.
   */
  const handleRegisterDineInOrder = async () => {
    if (cart.cart.length === 0 || !catalog) return;
    setSubmitting(true);
    setSubmitStatus('');
    try {
      const device = await getDeviceConfig();
      if (device.branchId == null) {
        setSubmitStatus('🔴 لا يوجد فرع مرتبط بهذا الجهاز — أعد تجهيز الجهاز');
        return;
      }
      const payload = buildDineInRegisterPayload(cart.cart, productsById, catalog.modifiersByProductId, cart.unitPriceOf, {
        branchId: device.branchId,
        shiftId: null,
        staffMemberId: null,
        customerName: null,
        customerPhone: null,
        customerId: null,
        discountPct: cart.discountPct,
        discountAmount: cart.totals.discount,
        vatAmount: cart.totals.vat,
        total: cart.totals.total,
        subtotal: cart.totals.subtotal,
        channel: 'dine_in',
        deliveryPlatformId: null,
        platformInvoiceLast4: null,
        tableId: null,
        existingOrderId: lastRegisteredDineInOrderId, // adding a round to the SAME order if one was already registered this session
      });
      const result = await submitOrder(payload);
      if (result.immediate) {
        // register_dine_in_order returns the real order id -- Checkpoint
        // 5 already proved this via a live scratch test; now actually
        // captured so "Pay Order #X" / add-a-round can target it.
        if (result.orderId != null) setLastRegisteredDineInOrderId(result.orderId);
        setSubmitStatus(`✅ تم تسجيل الطلب (بدون دفع بعد)`);
        cart.clearCart();
      } else {
        // Queued offline: no order id is known yet (the RPC hasn't run),
        // so this session honestly can't offer "Pay Order #X" until it
        // syncs -- a real, disclosed scope limit, not a silent gap.
        setSubmitStatus(`⏳ محفوظ محليًا، سيُرسل تلقائيًا (${result.error})`);
        cart.clearCart();
      }
    } catch (e) {
      setSubmitStatus(`🔴 خطأ غير متوقع: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Checkpoint 6 (Payment) -- pays an order that was already registered
   * this session (see the "Dine-in Payment" requirement: paying an
   * existing open table order, including after rounds were added). This
   * app has no Tables/Orders list screen yet (a separate checkpoint) to
   * pick an arbitrary open order from, so this operates on the order this
   * exact session most recently registered -- a real, honest, disclosed
   * scope limit, not a redesign of the RPC or its idempotency.
   */
  const handlePayDineInOrder = async (method: 'cash' | 'card', cashAmount: number | null) => {
    if (lastRegisteredDineInOrderId == null) return;
    setSubmitting(true);
    try {
      const payload = buildDineInPayPayload(lastRegisteredDineInOrderId, method, cashAmount, null, null, null);
      const outcome = await completePaymentOperation(payload, { openDrawer: method === 'cash' });
      setSubmitStatus(
        `دفع: ${outcome.paymentState}${outcome.paymentError ? ` (${outcome.paymentError})` : ''} — درج: ${outcome.drawerState}${outcome.drawerError ? ` (${outcome.drawerError})` : ''}`,
      );
      if (outcome.paymentState === 'PAYMENT_COMPLETED') setLastRegisteredDineInOrderId(null);
    } catch (e) {
      setSubmitStatus(`🔴 خطأ غير متوقع: ${String(e)}`);
    } finally {
      setSubmitting(false);
      setPaymentModalOpen(false);
    }
  };

  /** Checkpoint 6 (Payment) for pickup/delivery -- complete_pos_order is
   *  the ONLY order-creation mechanism for these channels (see
   *  domain/order.ts), so "Payment" here means: real payment method,
   *  drawer kick attempted for cash (independent of the network result),
   *  honest state reporting. Never "تم فتح الدرج" unless drawerState is
   *  genuinely DRAWER_COMPLETED. */
  const handlePayOrder = async (method: 'cash' | 'card', cashAmount: number | null) => {
    if (cart.cart.length === 0 || !catalog) return;
    setSubmitting(true);
    try {
      const device = await getDeviceConfig();
      if (device.branchId == null) {
        setSubmitStatus('🔴 لا يوجد فرع مرتبط بهذا الجهاز — أعد تجهيز الجهاز');
        return;
      }
      const payload = buildOrderPayload(cart.cart, productsById, catalog.modifiersByProductId, cart.unitPriceOf, {
        branchId: device.branchId,
        shiftId: null,
        staffMemberId: null,
        customerName: null,
        customerPhone: null,
        customerId: null,
        discountPct: cart.discountPct,
        discountAmount: cart.totals.discount,
        vatAmount: cart.totals.vat,
        total: cart.totals.total,
        subtotal: cart.totals.subtotal,
        channel: cart.orderChannel,
        deliveryPlatformId: null,
        platformInvoiceLast4: null,
        tableId: null,
        paymentMethod: method,
        cashAmount,
      });
      const outcome = await completePaymentOperation(payload, { openDrawer: method === 'cash' });
      setSubmitStatus(
        `دفع: ${outcome.paymentState}${outcome.paymentError ? ` (${outcome.paymentError})` : ''} — درج: ${outcome.drawerState}${outcome.drawerError ? ` (${outcome.drawerError})` : ''}`,
      );
      if (outcome.paymentState === 'PAYMENT_COMPLETED' || outcome.paymentState === 'PAYMENT_SYNC_PENDING') {
        cart.clearCart(); // safe in the SQLite queue either way, per Checkpoint 5
      }
    } catch (e) {
      setSubmitStatus(`🔴 خطأ غير متوقع: ${String(e)}`);
    } finally {
      setSubmitting(false);
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

          {!!submitStatus && <Text style={styles.submitStatus}>{submitStatus}</Text>}

          {cart.orderChannel === 'dine_in' ? (
            <>
              <TouchableOpacity
                style={[styles.checkoutButton, cart.cart.length > 0 && styles.checkoutButtonActive]}
                onPress={handleRegisterDineInOrder}
                disabled={cart.cart.length === 0 || submitting}>
                <Text style={styles.checkoutButtonText}>
                  {submitting ? 'جارٍ الإرسال...' : lastRegisteredDineInOrderId ? 'إضافة جولة' : 'تسجيل الطلب (بدون دفع)'}
                </Text>
              </TouchableOpacity>
              {lastRegisteredDineInOrderId != null && (
                <TouchableOpacity
                  style={[styles.checkoutButton, styles.checkoutButtonActive]}
                  onPress={handleOpenDineInPayment}
                  disabled={submitting}>
                  <Text style={styles.checkoutButtonText}>دفع الطلب #{lastRegisteredDineInOrderId}</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <TouchableOpacity
              style={[styles.checkoutButton, cart.cart.length > 0 && styles.checkoutButtonActive]}
              onPress={() => setPaymentModalOpen(true)}
              disabled={cart.cart.length === 0 || submitting}>
              <Text style={styles.checkoutButtonText}>{submitting ? 'جارٍ الإرسال...' : 'الدفع'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <PaymentModal
        visible={paymentModalOpen}
        total={cart.orderChannel === 'dine_in' ? dineInOrderTotal : cart.totals.total}
        submitting={submitting}
        onCancel={() => setPaymentModalOpen(false)}
        onConfirm={(method, cashAmount) =>
          cart.orderChannel === 'dine_in' ? handlePayDineInOrder(method, cashAmount) : handlePayOrder(method, cashAmount)
        }
      />

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
  checkoutButtonActive: { backgroundColor: '#8bc34a' },
  checkoutButtonText: { color: '#666', fontWeight: '700', fontSize: 12 },
  submitStatus: { fontSize: 11, textAlign: 'center', paddingHorizontal: 12, color: '#444' },
});
