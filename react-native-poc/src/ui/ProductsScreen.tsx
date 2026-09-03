import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { loadCatalog, getBusinessType, getFinancialSettings, getReceiptBusinessProfile, CatalogResult } from '../application/catalogService';
import { getOrderHistoryDetail } from '../application/orderHistoryService';
import { submitOrder } from '../application/orderService';
import { completePaymentOperation } from '../application/paymentService';
import { getDeviceConfig } from '../application/authService';
import { enqueuePrintJob } from '../application/printService';
import { getPrinterProfile } from '../infrastructure/printerProfileStore';
import { shouldPrintCustomerReceipt, shouldPrintKitchenTicket, shouldPrintReceiptLogo } from '../domain/printerProfile';
import { supabase } from '../infrastructure/supabaseClient';
import { buildOrderPayload, buildDineInRegisterPayload, buildDineInPayPayload } from '../domain/order';
import type { ReceiptData, KitchenTicketData, ReceiptLine } from '../domain/receipt';
import type { Product } from '../domain/catalog';
import { isRetailBusinessType } from '../domain/catalog';
import type { CartLine, ModifierDefinition, OrderChannel } from '../domain/cart';
import type { CashierProfile } from '../domain/auth';
import { useCart } from './useCart';
import ModifierModal from './ModifierModal';
import PaymentModal from './PaymentModal';
import CustomerPickerModal from './CustomerPickerModal';
import LoyaltyRedeemModal from './LoyaltyRedeemModal';
import type { Customer } from '../domain/customer';

const DISCOUNT_OPTIONS = [0, 5, 10, 15, 20];
const CHANNEL_LABELS: Record<OrderChannel, string> = {
  dine_in: 'بالمطعم',
  pickup: 'استلام',
  delivery: 'توصيل',
};

/** Feature Parity Pass (Real Receipt Rendering) -- turns a cart line's
 *  `config` (groupId -> selected option id(s), domain/cart.ts's real
 *  shape) into the human-readable modifier labels the PWA's receipt
 *  prints per item (receipt.items[].mods). Looks the option up in the
 *  SAME ModifierDefinition already loaded for cart pricing/editing --
 *  not a second, redefined modifier model. */
function cartLineToModLabels(item: CartLine, modifiersByProductId: Record<number, ModifierDefinition>): string[] {
  const def = modifiersByProductId[item.productId];
  if (!def || !item.config) return [];
  const labels: string[] = [];
  for (const group of def.groups) {
    const selected = item.config[group.id];
    const ids = Array.isArray(selected) ? selected : selected != null ? [selected] : [];
    for (const id of ids) {
      const option = group.options.find(o => o.id === id);
      if (option) labels.push(option.name);
    }
  }
  return labels;
}

/** Checkpoint 10 (Print Queue) -- builds real receipt line data from the
 *  cart, using each line's already-verified unit price (domain/cart.ts's
 *  own math, Checkpoint 4) rather than recalculating anything.
 *  Feature Parity Pass extended this with real mods/note (previously
 *  always blank placeholders the ASCII renderer never printed anyway). */
function cartToReceiptLines(
  cart: CartLine[],
  productsById: Map<number, Product>,
  unitPriceOf: (item: CartLine) => number,
  modifiersByProductId: Record<number, ModifierDefinition> = {},
): ReceiptLine[] {
  return cart.map(item => {
    const product = productsById.get(item.productId);
    const unitPrice = unitPriceOf(item);
    return {
      // Real bug found during the Feature Parity audit: this preferred
      // nameEn, so any product with an English name populated printed in
      // English regardless of the cashier's UI language. The PWA's real
      // receipt/kitchen builders always use the primary Arabic name
      // (p.name) unconditionally -- receipts are never English, even
      // when the POS UI itself is toggled to English.
      name: product?.name || `#${item.productId}`,
      qty: item.qty,
      unitPrice,
      lineTotal: unitPrice * item.qty,
      mods: cartLineToModLabels(item, modifiersByProductId),
      note: item.note || undefined,
    };
  });
}

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
export interface SelectedTableContext {
  id: number;
  number: number;
  activeOrderId: number | null;
}

export default function ProductsScreen({
  cashier,
  selectedTable = null,
  onExitTableContext,
}: {
  cashier: CashierProfile;
  /** Checkpoint 7 (Dine-in / Tables) -- when set, this screen's cart is
   *  attached to a real table (see ui/TablesScreen.tsx). Registering an
   *  order sends the table's real id instead of null, and an existing
   *  active_order_id (a table already 'serving'/'awaiting_payment')
   *  seeds the Pay/Add-Round state immediately instead of requiring a
   *  fresh registration first. When null, dine-in still works exactly as
   *  Checkpoints 5/6 built it (table_id: null, an explicitly supported
   *  "dine-in without a table" case). */
  selectedTable?: SelectedTableContext | null;
  onExitTableContext?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState<CatalogResult | null>(null);
  const [financial, setFinancial] = useState({ vatRegistered: true, vatRate: 0.15, pricesIncludeVat: true });
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [modifierTarget, setModifierTarget] = useState<Product | null>(null);
  const [businessType, setBusinessType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // The web PWA switches this same screen from a side-by-side products+cart
  // layout to a stacked one at max-width:760px (rakeen-pos-additions.css) --
  // this app runs on phones almost exclusively, so without the same
  // breakpoint the cart column was rendering at a sliver of its real width,
  // clipping every price/button in it. Mirrors that breakpoint here.
  const { width: windowWidth } = useWindowDimensions();
  const isNarrow = windowWidth < 760;

  useEffect(() => {
    (async () => {
      try {
        const type = await getBusinessType(cashier.business_id);
        setBusinessType(type);
        const [result, settings] = await Promise.all([
          loadCatalog(cashier.business_id, type),
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
    const byCategory = !activeCategoryId ? catalog.products : catalog.products.filter(p => p.categoryId === activeCategoryId);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return byCategory;
    // Feature Parity Pass -- Barcode/Search. Ported from the PWA's real
    // search-box filtering (name substring match) -- barcode matching
    // itself happens separately, on Enter, in handleSearchSubmit below,
    // exactly matching the source's own split between the 'input' and
    // 'keydown' listeners on the same field.
    return byCategory.filter(p => p.name.toLowerCase().includes(q) || (p.nameEn || '').toLowerCase().includes(q));
  }, [catalog, activeCategoryId, searchQuery]);

  /** Feature Parity Pass -- Barcode. Ported from the PWA's real
   *  searchInput 'keydown' handler (a USB/Bluetooth barcode scanner
   *  types the code into whatever field is focused, then sends Enter --
   *  same combined search+scan field here). An exact barcode match adds
   *  straight to cart (going through the same handleTapProduct every
   *  grid tap already uses, so modifier-required products still open
   *  their modal -- never silently skipped); no match shows the same
   *  "no product with this barcode" toast, but ONLY for a retail
   *  business, matching isRetailBusiness()'s real gate -- other business
   *  types just keep their typed text as a plain (now unmatched) search
   *  term. */
  const handleSearchSubmit = () => {
    const raw = searchQuery.trim();
    if (!raw || !catalog) return;
    const product = catalog.products.find(p => p.barcode === raw);
    if (product) {
      handleTapProduct(product);
      setSearchQuery('');
      setSubmitStatus(`أُضيف: ${product.name}`);
    } else if (isRetailBusinessType(businessType)) {
      setSubmitStatus('ما فيه منتج بهذا الباركود');
    }
  };

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
  const [lastRegisteredDineInOrderId, setLastRegisteredDineInOrderId] = useState<number | null>(
    selectedTable?.activeOrderId ?? null,
  );
  const [dineInOrderTotal, setDineInOrderTotal] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: number | null; name: string; phone: string | null; points: number } | null>(null);
  const [loyaltyRedeemOpen, setLoyaltyRedeemOpen] = useState(false);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);

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
        customerName: selectedCustomer?.name ?? null,
        customerPhone: selectedCustomer?.phone ?? null,
        customerId: selectedCustomer?.id ?? null,
        discountPct: cart.discountPct,
        discountAmount: cart.totals.discount,
        vatAmount: cart.totals.vat,
        total: cart.totals.total,
        subtotal: cart.totals.subtotal,
        channel: 'dine_in',
        deliveryPlatformId: null,
        platformInvoiceLast4: null,
        tableId: selectedTable ? selectedTable.id : null,
        existingOrderId: lastRegisteredDineInOrderId, // adding a round to the SAME order if one was already registered this session
      });
      const result = await submitOrder(payload);
      if (result.immediate) {
        // register_dine_in_order returns the real order id -- Checkpoint
        // 5 already proved this via a live scratch test; now actually
        // captured so "Pay Order #X" / add-a-round can target it.
        if (result.orderId != null) setLastRegisteredDineInOrderId(result.orderId);
        setSubmitStatus(`✅ تم تسجيل الطلب (بدون دفع بعد)`);
        // Real kitchen-ticket enqueue -- matches submitTableOrderRegistration's
        // own "prints kitchen ticket" step in the PWA, now gated on the
        // real per-device DEVICE.printKitchenTicket toggle (Feature
        // Parity Pass -- Printing Configuration), which defaults OFF
        // just like the PWA's own default.
        const printerProfileForKitchen = await getPrinterProfile();
        if (shouldPrintKitchenTicket(printerProfileForKitchen)) {
          enqueuePrintJob('kitchen', {
            orderId: result.orderId ?? null,
            tableNumber: selectedTable?.number ?? null,
            lines: cartToReceiptLines(cart.cart, productsById, cart.unitPriceOf, catalog.modifiersByProductId),
            branchName: device.branchName ?? undefined,
            createdAtISO: new Date().toISOString(),
            metaLabel: CHANNEL_LABELS.dine_in + (selectedTable ? ` — طاولة ${selectedTable.number}` : ''),
          } satisfies KitchenTicketData).catch(() => {});
        }
        cart.clearCart();
        // register_dine_in_order already flipped the table to 'serving'
        // server-side -- return to the floor view so that's visible
        // immediately, matching submitTableOrderRegistration's own
        // navigation in the PWA.
        if (selectedTable) onExitTableContext?.();
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
      const payload = buildDineInPayPayload(
        lastRegisteredDineInOrderId,
        method,
        cashAmount,
        selectedCustomer?.name ?? null,
        selectedCustomer?.phone ?? null,
        selectedCustomer?.id ?? null,
      );
      const outcome = await completePaymentOperation(payload, { openDrawer: method === 'cash' });
      setSubmitStatus(
        `دفع: ${outcome.paymentState}${outcome.paymentError ? ` (${outcome.paymentError})` : ''} — درج: ${outcome.drawerState}${outcome.drawerError ? ` (${outcome.drawerError})` : ''}`,
      );
      if (outcome.paymentState === 'PAYMENT_COMPLETED') {
        // Isolated in its own try/catch on purpose -- a real bug found
        // during the TestFlight-readiness audit: getReceiptBusinessProfile
        // is a network call, and this whole block used to run unguarded
        // inside the same try as completePaymentOperation. Payment had
        // ALREADY succeeded (offline-safe, queue-first) by this point; a
        // network hiccup fetching the VAT number/logo for the receipt
        // must never be allowed to fall into the outer catch and (a)
        // overwrite the correct "دفع: PAYMENT_COMPLETED" status with a
        // false "unexpected error", or (b) skip clearing
        // lastRegisteredDineInOrderId/selectedCustomer below, which would
        // leave the UI thinking this table's order is still open even
        // though it was genuinely just paid.
        try {
          const device = await getDeviceConfig();
          const profile = device.businessId != null ? await getReceiptBusinessProfile(device.businessId) : null;
          const printerProfileForReceipt = await getPrinterProfile();
          // Real order subtotal/discount/vat/items -- a real bug found
          // during the Feature Parity audit: this used to hardcode
          // `lines: [], discount: 0, vat: 0` with a comment claiming the
          // extra query was out of scope. That meant every dine-in
          // settlement receipt printed a WRONG (zero) VAT amount, which
          // also fed the ZATCA QR -- a real compliance/data-correctness
          // bug for any VAT-registered business, not just a cosmetic
          // gap. pay_dine_in_order has already written the real,
          // authoritative totals to the orders row by this point, so
          // fetching them (the same query Order History's detail view
          // already uses) is both correct and cheap.
          const orderDetail = await getOrderHistoryDetail(lastRegisteredDineInOrderId);
          // Feature Parity Pass -- Printing Configuration: gated on the
          // real DEVICE.printCustomerReceipt toggle (defaults ON, matching
          // the PWA) instead of always printing.
          if (shouldPrintCustomerReceipt(printerProfileForReceipt)) {
            enqueuePrintJob('receipt', {
              orderId: lastRegisteredDineInOrderId,
              lines: (orderDetail?.items ?? []).map(it => ({
                name: it.name,
                qty: it.qty,
                unitPrice: it.unitPrice,
                lineTotal: it.lineTotal,
                mods: it.mods,
                note: it.note || undefined,
              })),
              subtotal: orderDetail?.subtotal ?? dineInOrderTotal,
              discount: orderDetail?.discountAmount ?? 0,
              vat: orderDetail?.vatAmount ?? 0,
              total: orderDetail?.total ?? dineInOrderTotal,
              paymentMethod: method,
              change: method === 'cash' && cashAmount != null ? Math.max(0, cashAmount - (orderDetail?.total ?? dineInOrderTotal)) : 0,
              businessName: device.businessName ?? undefined,
              branchName: device.branchName ?? undefined,
              vatNumber: profile?.vatNumber || undefined,
              logoUrl: shouldPrintReceiptLogo(printerProfileForReceipt) ? profile?.logoUrl || undefined : undefined,
              customMessage: profile?.customMessage || undefined,
              createdAtISO: new Date().toISOString(),
              metaLabel: CHANNEL_LABELS.dine_in + (selectedTable ? ` — طاولة ${selectedTable.number}` : ''),
            } satisfies ReceiptData).catch(() => {});
          }
        } catch {
          // Never let a receipt-metadata fetch failure look like the sale
          // itself failed -- the payment above already succeeded.
        }
        setLastRegisteredDineInOrderId(null);
        setSelectedCustomer(null); // transaction fully settled -- start clean for the next table/customer
        // pay_dine_in_order already flipped the table to 'cleaning'
        // server-side (Checkpoint 6) -- return to the floor view.
        if (selectedTable) onExitTableContext?.();
      }
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
        customerName: selectedCustomer?.name ?? null,
        customerPhone: selectedCustomer?.phone ?? null,
        customerId: selectedCustomer?.id ?? null,
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
        // Real receipt enqueue -- matches autoPrintOnCheckout's own
        // customer-receipt step in the PWA. Printing never waits on cloud
        // confirmation (queue-first): PAYMENT_SYNC_PENDING still prints,
        // matching "LAN printer independent of Internet/Cloud." Real
        // order id now comes from outcome.orderId (paymentService.ts fix,
        // Feature Parity audit) when the RPC ran immediately; still
        // correctly null/"Order (offline)" when genuinely queued offline.
        //
        // Isolated in its own try/catch -- same real bug and same fix as
        // handlePayDineInOrder above: this branch explicitly includes
        // PAYMENT_SYNC_PENDING (still offline, order safely queued
        // locally) specifically BECAUSE printing must never wait on
        // Internet/Cloud. A network call here throwing into the outer
        // catch would contradict that by turning an offline-but-successful
        // sale into a false "unexpected error" and skip clearing the cart.
        try {
          const profile = device.businessId != null ? await getReceiptBusinessProfile(device.businessId) : null;
          const printerProfileForReceipt = await getPrinterProfile();
          if (shouldPrintCustomerReceipt(printerProfileForReceipt)) {
            enqueuePrintJob('receipt', {
              orderId: outcome.orderId ?? null,
              lines: cartToReceiptLines(cart.cart, productsById, cart.unitPriceOf, catalog.modifiersByProductId),
              subtotal: cart.totals.subtotal,
              discount: cart.totals.discount,
              vat: cart.totals.vat,
              total: cart.totals.total,
              paymentMethod: method,
              change: method === 'cash' && cashAmount != null ? Math.max(0, cashAmount - cart.totals.total) : 0,
              businessName: device.businessName ?? undefined,
              branchName: device.branchName ?? undefined,
              vatNumber: profile?.vatNumber || undefined,
              logoUrl: shouldPrintReceiptLogo(printerProfileForReceipt) ? profile?.logoUrl || undefined : undefined,
              customMessage: profile?.customMessage || undefined,
              createdAtISO: new Date().toISOString(),
              metaLabel: CHANNEL_LABELS[cart.orderChannel] || cart.orderChannel,
            } satisfies ReceiptData).catch(() => {});
          }
          // Real bug found during the Feature Parity audit: a kitchen
          // ticket was only ever enqueued from handleRegisterDineInOrder
          // -- pickup/delivery checkout never printed one at all, even
          // with the toggle on. PWA's real autoPrintOnCheckout prints a
          // kitchen ticket for EVERY channel except a resumed dine-in tab
          // close (`!wasResumingOrder`) -- this IS a fresh order, not a
          // resume, so it belongs here exactly like dine-in registration.
          if (shouldPrintKitchenTicket(printerProfileForReceipt)) {
            enqueuePrintJob('kitchen', {
              orderId: outcome.orderId ?? null,
              tableNumber: null,
              lines: cartToReceiptLines(cart.cart, productsById, cart.unitPriceOf, catalog.modifiersByProductId),
              branchName: device.branchName ?? undefined,
              createdAtISO: new Date().toISOString(),
              metaLabel: CHANNEL_LABELS[cart.orderChannel] || cart.orderChannel,
            } satisfies KitchenTicketData).catch(() => {});
          }
        } catch {
          // Never let a receipt-metadata fetch failure look like the sale
          // itself failed -- the payment above already succeeded/queued.
        }
        cart.clearCart(); // safe in the SQLite queue either way, per Checkpoint 5
        setSelectedCustomer(null); // transaction fully settled -- start clean for the next customer
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
      {selectedTable && (
        <View style={styles.tableBanner}>
          <Text style={styles.tableBannerText}>طاولة {selectedTable.number}</Text>
          {!!onExitTableContext && (
            <TouchableOpacity onPress={onExitTableContext}>
              <Text style={styles.tableBannerLink}>‹ الطاولات</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {catalog.usingOfflineSnapshot && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>لا يوجد اتصال — يعمل بمنيو محفوظ محليًا</Text>
        </View>
      )}

      <View style={[styles.mainRow, isNarrow && styles.mainRowNarrow]}>
        <View style={[styles.productsCol, isNarrow && styles.productsColNarrow]}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearchSubmit}
            placeholder="ابحث أو امسح باركود..."
            returnKeyType="search"
          />
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
            style={[isNarrow && styles.gridListNarrow]}
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

        <View style={[styles.cartCol, isNarrow && styles.cartColNarrow]}>
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

          <TouchableOpacity style={styles.customerRow} onPress={() => setCustomerPickerOpen(true)}>
            <Text style={styles.customerRowLabel}>
              {selectedCustomer ? `${selectedCustomer.name}${selectedCustomer.phone ? ` — ${selectedCustomer.phone}` : ''}` : 'إضافة عميل (اختياري)'}
            </Text>
            {selectedCustomer && (
              <TouchableOpacity onPress={() => setSelectedCustomer(null)}>
                <Text style={styles.customerRowClear}>إزالة</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          {/* Feature Parity Pass -- Loyalty. Only for an existing customer
              with a real id -- a brand-new customer typed at checkout has
              no real balance to redeem yet, matching the PWA's own rule. */}
          {selectedCustomer?.id != null && (
            <TouchableOpacity style={styles.loyaltyRow} onPress={() => setLoyaltyRedeemOpen(true)}>
              <Text style={styles.loyaltyRowText}>🎁 استبدال بالنقاط ({selectedCustomer.points} نقطة)</Text>
            </TouchableOpacity>
          )}

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

      <CustomerPickerModal
        visible={customerPickerOpen}
        businessId={cashier.business_id}
        onCancel={() => setCustomerPickerOpen(false)}
        onSelect={customer => {
          setSelectedCustomer(customer);
          setCustomerPickerOpen(false);
        }}
      />

      {selectedCustomer?.id != null && (
        <LoyaltyRedeemModal
          visible={loyaltyRedeemOpen}
          customerId={selectedCustomer.id}
          customerName={selectedCustomer.name}
          customerPoints={selectedCustomer.points}
          redeemableProducts={catalog.products.filter(p => p.pointsRedeemPrice != null)}
          onRedeem={productId => cart.addPointsRedemptionProduct(productId)}
          onClose={() => setLoyaltyRedeemOpen(false)}
        />
      )}

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
  tableBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#e8eaf6',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tableBannerText: { fontSize: 13, fontWeight: '700', color: '#3f51b5' },
  tableBannerLink: { fontSize: 13, color: '#3f51b5', fontWeight: '700' },
  mainRow: { flex: 1, flexDirection: 'row' },
  mainRowNarrow: { flexDirection: 'column' },
  productsCol: { flex: 2 },
  productsColNarrow: { flex: 0, height: '52%' },
  gridListNarrow: { flex: 1 },
  cartCol: { flex: 1, backgroundColor: '#fff', borderLeftWidth: 1, borderLeftColor: '#e0e0e0' },
  cartColNarrow: { borderLeftWidth: 0, borderTopWidth: 8, borderTopColor: '#f2f5f0' },
  searchInput: {
    marginHorizontal: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    backgroundColor: '#fff',
  },
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
  customerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f2f5f0',
  },
  customerRowLabel: { fontSize: 12, color: '#333', fontWeight: '600' },
  customerRowClear: { fontSize: 11, color: '#c0392b' },
  loyaltyRow: { backgroundColor: '#fff3e0', borderRadius: 10, padding: 10, marginBottom: 10, alignItems: 'center' },
  loyaltyRowText: { fontSize: 12, fontWeight: '700', color: '#e65100' },
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
