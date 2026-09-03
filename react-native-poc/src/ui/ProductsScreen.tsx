import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, TouchableOpacity } from './tappable';
import GradientFill from './GradientFill';
import Svg, { Circle, Line, Path, Polygon, Polyline } from 'react-native-svg';
import { createStyles, fonts, gradients, layout, radii, spacing, useTheme } from './theme';
import { CategoryIcon, iconForCategoryName } from './categoryIcons';
import Money from './Money';
import { useShell } from './shell';
import {
  loadCatalog,
  getBusinessType,
  getFinancialSettings,
  getHideProductImages,
  getReceiptBusinessProfile,
  CatalogResult,
} from '../application/catalogService';
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
import { buildDefaultConfig } from '../domain/cart';
import type { CartLine, ModifierDefinition, OrderChannel } from '../domain/cart';
import type { CashierProfile } from '../domain/auth';
import { useCart } from './useCart';
import ModifierModal from './ModifierModal';
import PaymentModal from './PaymentModal';
import type { PaymentMethod } from '../domain/payment';
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

/**
 * `.home-zones`, whose scroll model flips at the breakpoint.
 *
 * At >=761px the shell is a fixed 100vh frame: `.screens{flex:1;
 * overflow:hidden}` and `.home-zones{flex:1; overflow:hidden}`
 * (rakeen-pos.css:144,149), so the three zones divide one screenful and
 * nothing scrolls except each zone's own list.
 *
 * At <=760px the source deliberately gives that up and lets the PAGE
 * scroll instead (rakeen-pos-additions.css:435-448):
 *
 *   body { overflow:auto; height:auto; min-height:100vh }
 *   .app  { height:auto; min-height:100vh;
 *           padding-bottom: calc(68px + env(safe-area-inset-bottom)) }
 *   .screens, .home-zones, .products-zone, .order-panel { overflow:visible }
 *
 * -- because the stacked phone layout (grid, then the whole cart under
 * it) does not fit in one screenful and is not meant to. The bars go
 * position:fixed and `.app` reserves the bottom nav's 68px so the last
 * control still clears it.
 *
 * A React Native tree has no page scroll to inherit, and an RN View
 * neither clips nor scrolls its overflow -- so porting only the sizes
 * and not the scroll model left the order panel squeezed into whatever
 * the grid did not take and painting the rest straight off the bottom of
 * the screen, behind the bottom nav. That is the bug this wrapper fixes:
 * on a phone the column becomes a real scroller, exactly as the page is
 * in the source. The bottom nav is an ordinary flex sibling at this width
 * (App.tsx), so it bounds this ScrollView instead of overlapping it --
 * which is what `.app`'s padding-bottom buys in CSS.
 */
function HomeZones({
  narrow,
  style,
  contentContainerStyle,
  children,
}: {
  narrow: boolean;
  style: StyleProp<ViewStyle>;
  contentContainerStyle: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  if (!narrow) {
    return <View style={style}>{children}</View>;
  }
  return (
    <ScrollView
      style={style}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
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
  /**
   * searchInput's 'input' listener debounces the grid re-render by 200ms
   * (rakeen-pos.js:1049) -- its own comment: a full grid re-render is
   * real work on weak hardware because every card repaints its shadow and
   * gradient, so it happens once per typing pause rather than once per
   * keystroke. The field itself stays instant; only the value the grid
   * filters on lags, which is exactly what the source does.
   *
   * handleSearchSubmit deliberately reads searchQuery, not this: the
   * source's Enter/barcode path reads e.target.value directly and never
   * waits for the debounce.
   */
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { colors } = useTheme();
  const styles = useStyles();

  // #favToggle / .fav-star -- both session-scoped, see toggleFavourite.
  const [showFavOnly, setShowFavOnly] = useState(false);
  const [favIds, setFavIds] = useState<Set<number>>(() => new Set());
  /** POS_HIDE_PRODUCT_IMAGES. Initialised to the source's own default of
   *  true so the very first paint matches what loadPosData() would have
   *  had -- starting at false would flash real photos onto every tile and
   *  then pull them back once the businesses row arrives. */
  const [hideImages, setHideImages] = useState(true);

  /** .discount-panel is `display:none` until .discount-toggle opens it. */
  const [discountPanelOpen, setDiscountPanelOpen] = useState(false);

  /** Which line currently has its .oi-note-input revealed. The source
   *  tracks this in the DOM by toggling `.open` on that one input; a
   *  single id is the same thing without the DOM. */
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  /** .clear-btn's arm/confirm flag, plus the 3s timer that drops it --
   *  `let clearArmed = false, clearArmTimer` (rakeen-pos.js:1416). The
   *  timer lives in a ref, not state, because re-arming has to cancel the
   *  PREVIOUS timeout: a value captured in a render closure would leave
   *  the stale one running and disarm the button early. */
  const [clearArmed, setClearArmed] = useState(false);
  const clearArmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** state.lastTransaction -- the sale just completed, shown on the empty
   *  cart so the cashier can reprint without leaving Home. Session-only
   *  in the source too: it is a plain `state` field, never persisted. */
  const [lastTransaction, setLastTransaction] = useState<{ total: number; time: string } | null>(null);


  useEffect(
    () => () => {
      if (clearArmTimer.current) clearTimeout(clearArmTimer.current);
    },
    [],
  );



  /**
   * The same breakpoint pair the PWA uses, not an approximation:
   *  - `@media (min-width:761px)` (rakeen-pos.css:375) is where the order
   *    panel appears beside the grid at all; below it,
   *    rakeen-pos-additions.css:434 stacks .home-zones into a column.
   *  - `@media (max-width:1100px) and (min-width:761px)` (additions:416)
   *    narrows that panel from 360px to 300px.
   * The panel is a FIXED-width column in the source (.order-panel:252 --
   * `width:360px; flex-shrink:0`), never flex:1, which is why it has to
   * be a real width here too rather than an equal share of the row.
   */
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { sideBySide, orderPanelWidth, insetTop, insetBottom } = useShell();
  const isNarrow = !sideBySide;

  /**
   * At >=761px the topbar and bottom nav are absolutely positioned and
   * `.screens` runs full height behind them, so each of Home's own
   * columns pushes itself clear (rakeen-pos.css:440-442):
   *   .cat-sidebar     padding-top: --topbar-h + 14, padding-bottom: 14 + 68
   *   .products-toolbar padding-top: --topbar-h + 18
   *   .product-grid    padding-bottom: 22 + 68
   * .order-panel is deliberately left alone -- that is the entire reason
   * the bars stop short of it, so it reaches the true top and bottom.
   */
  const catRailInset = sideBySide ? { paddingTop: insetTop + 14, paddingBottom: 14 + insetBottom } : null;
  const toolbarInset = sideBySide ? { paddingTop: insetTop + 18 } : null;
  const gridInset = sideBySide ? { paddingBottom: 22 + insetBottom } : null;

  /**
   * `.product-grid`'s `repeat(auto-fill, minmax(128px,1fr))` -- 122px at
   * <=760px (rakeen-pos-additions.css:488). FlatList takes a fixed
   * numColumns, so auto-fill is reproduced by dividing the real available
   * width (viewport minus the category rail, the order panel and the
   * grid's own 20px side padding) by that minimum tile width.
   */
  const gridColumns = useMemo(() => {
    const minTile = isNarrow ? 122 : 128;
    const sidePadding = 20 * 2;
    const available = isNarrow
      ? windowWidth - sidePadding
      : windowWidth - layout.catSidebarWidth - orderPanelWidth - sidePadding;
    return Math.max(1, Math.floor(available / minTile));
  }, [isNarrow, windowWidth, orderPanelWidth]);

  useEffect(() => {
    (async () => {
      try {
        const type = await getBusinessType(cashier.business_id);
        setBusinessType(type);
        const [result, settings, hideImgs] = await Promise.all([
          loadCatalog(cashier.business_id, type),
          getFinancialSettings(cashier.business_id),
          getHideProductImages(cashier.business_id),
        ]);
        setCatalog(result);
        setFinancial(settings);
        setHideImages(hideImgs);
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


  /** #lastTxReprint. The source's own handler is a toast and nothing
   *  more (`showToast('تمت إعادة الطباعة')`, rakeen-pos.js:1012) -- it
   *  does NOT re-enqueue a print job, because by that point the receipt
   *  payload has already been discarded with the cart. Reproduced as-is
   *  rather than "improved" into a real reprint, which would be new
   *  behaviour this app's source does not have. */
  const handleReprintLast = useCallback(() => {
    setSubmitStatus('تمت إعادة الطباعة');
  }, []);

  /** clearOrderBtn's two-tap arm/confirm (rakeen-pos.js:1417). */
  const handleClearOrder = useCallback(() => {
    if (cart.cart.length === 0) return;
    if (!clearArmed) {
      setClearArmed(true);
      clearArmTimer.current = setTimeout(() => setClearArmed(false), 3000);
      return;
    }
    if (clearArmTimer.current) clearTimeout(clearArmTimer.current);
    setClearArmed(false);
    // clearCart() already zeroes discountPct (useCart.ts:87), matching
    // the source's own `state.cart = []; state.discountPct = 0`.
    cart.clearCart();
    setDiscountPanelOpen(false);
    setSubmitStatus('\u062a\u0645 \u0625\u0641\u0631\u0627\u063a \u0627\u0644\u0637\u0644\u0628');
  }, [cart, clearArmed]);

  const visibleProducts = useMemo<Product[]>(() => {
    if (!catalog) return [];
    const byCategory = !activeCategoryId ? catalog.products : catalog.products.filter(p => p.categoryId === activeCategoryId);
    // renderProductGrid()'s own filter order: category, then favourites,
    // then the search term.
    const byFav = showFavOnly ? byCategory.filter(p => favIds.has(p.id)) : byCategory;
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return byFav;
    // Feature Parity Pass -- Barcode/Search. Ported from the PWA's real
    // search-box filtering (name substring match) -- barcode matching
    // itself happens separately, on Enter, in handleSearchSubmit below,
    // exactly matching the source's own split between the 'input' and
    // 'keydown' listeners on the same field.
    return byFav.filter(p => p.name.toLowerCase().includes(q) || (p.nameEn || '').toLowerCase().includes(q));
  }, [catalog, activeCategoryId, debouncedQuery, showFavOnly, favIds]);

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

  /**
   * openProductFlow(productId, forceCustomize) -- rakeen-pos.js:791.
   *
   * A plain tap does NOT open the modifier modal just because a product
   * has modifiers: the source only customises when the definition says
   * `alwaysCustomize` (derived identically here and there as "has a
   * required group") or when the interaction was a long press. Otherwise
   * it adds the product with its DEFAULT configuration, which is what
   * makes tapping a drink with a size group a one-tap sale instead of a
   * modal every time. This used to open the modal unconditionally.
   */
  const handleTapProduct = (product: Product, forceCustomize = false) => {
    const modDef = catalog?.modifiersByProductId[product.id];
    if (!modDef) {
      cart.addProduct(product.id); // simple product -- always instant
      return;
    }
    if (modDef.alwaysCustomize || forceCustomize) {
      setModifierTarget(product);
      return;
    }
    cart.addWithConfig(product.id, buildDefaultConfig(modDef), 1);
  };

  /** .fav-star's click handler: toggles in memory and re-renders. Session
   *  -scoped on purpose -- loadPosData() sets `fav:false` on every product
   *  each boot, so the PWA's favourites never survive a reload either. */
  const toggleFavourite = (productId: number) => {
    setFavIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
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
  const handlePayDineInOrder = async (method: PaymentMethod, cashAmount: number | null) => {
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
  const handlePayOrder = async (method: PaymentMethod, cashAmount: number | null) => {
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
        // state.lastTransaction, recorded just BEFORE the cart is wiped
        // (rakeen-pos.js:3257) -- the empty panel's .last-tx-card reads
        // from it, so capturing it after the clear would always store 0.
        setLastTransaction({
          total: cart.totals.total,
          time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
        });
        cart.clearCart(); // safe in the SQLite queue either way, per Checkpoint 5
        // `document.getElementById('discountToggle').textContent = '+ خصم'`
        // (:3269) -- the toggle's label AND its panel go back to rest.
        setDiscountPanelOpen(false);
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
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accentText} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!catalog || catalog.categories.length === 0) {
    return (
      <View style={[styles.root, styles.center]}>
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
            <TouchableOpacity onPress={onExitTableContext} style={styles.tableBannerBack}>
              {/* .modal-back's chevron -- points RIGHT, because "back" in
                  an RTL layout goes toward the inline start (the right
                  edge). A left-pointing glyph here was an LTR habit. */}
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.accentText} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <Polyline points="9 18 15 12 9 6" />
              </Svg>
              <Text style={styles.tableBannerLink}>الطاولات</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {catalog.usingOfflineSnapshot && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>لا يوجد اتصال — يعمل بمنيو محفوظ محليًا</Text>
        </View>
      )}

      {/* .home-zones -- source order is cat-sidebar, products-zone,
          order-panel. The category rail comes BEFORE the search toolbar,
          which is why it stacks above it (not below) on a phone. */}
      <HomeZones
        narrow={isNarrow}
        style={isNarrow ? styles.homeZonesNarrow : styles.homeZones}
        contentContainerStyle={styles.homeZonesNarrowContent}>
        {/* .cat-sidebar: an 84px vertical rail at >=761px, a horizontal
            scrolling strip of pills below that (additions.css:475-478). */}
        <ScrollView
          horizontal={isNarrow}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          style={[styles.catSidebar, isNarrow && styles.catSidebarNarrow]}
          contentContainerStyle={[styles.catSidebarContent, isNarrow && styles.catSidebarContentNarrow, catRailInset]}>
          {catalog.categories.map(cat => {
            const active = activeCategoryId === cat.id;
            const tint = active ? colors.flagGreenDeep : colors.muted;
            const iconSize = isNarrow ? 15 : 17;
            return (
              <Pressable
                key={cat.id}
                style={({ pressed }) => [
                  styles.catBtn,
                  isNarrow && styles.catBtnNarrow,
                  active && styles.catBtnActive,
                  !active && pressed && styles.catBtnPressed,
                ]}
                onPress={() => setActiveCategoryId(cat.id)}>
                {/* .cat-btn .ci -- icon derived from the category name by
                    the same keyword rules as iconForCategory(). */}
                <CategoryIcon name={iconForCategoryName(cat.name)} width={iconSize} height={iconSize} stroke={tint} />
                <Text style={[styles.catBtnText, active && styles.catBtnTextActive]} numberOfLines={isNarrow ? 1 : 2}>
                  {cat.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* .products-zone */}
        <View style={[styles.productsZone, isNarrow && styles.productsZoneNarrow]}>
          {/* .products-toolbar -- search box + favourites toggle, in that order */}
          <View style={[styles.productsToolbar, toolbarInset]}>
            <View style={styles.searchBox}>
              {/* .search-box svg -- same circle+line magnifier, ported path-for-path */}
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.muted} strokeWidth={2} strokeLinecap="round" style={styles.searchIcon}>
                <Circle cx={11} cy={11} r={7} />
                <Line x1={21} y1={21} x2={16.65} y2={16.65} />
              </Svg>
              <TextInput
                style={styles.searchInput}
                placeholderTextColor={colors.muted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearchSubmit}
                placeholder="ابحث أو امسح باركود..."
                returnKeyType="search"
              />
            </View>
            {/* .fav-toggle -- 48px pill beside the search box */}
            <TouchableOpacity
              style={[styles.favToggle, showFavOnly && styles.favToggleActive]}
              onPress={() => setShowFavOnly(v => !v)}
              activeOpacity={0.8}>
              <Text style={[styles.favToggleText, showFavOnly && styles.favToggleTextActive]}>★</Text>
            </TouchableOpacity>
          </View>

          {/* .product-grid */}
          <FlatList
            key={`grid-${gridColumns}`}
            style={isNarrow ? { maxHeight: windowHeight * 0.6 } : undefined}
            nestedScrollEnabled={isNarrow}
            data={visibleProducts}
            keyExtractor={p => String(p.id)}
            numColumns={gridColumns}
            columnWrapperStyle={gridColumns > 1 ? styles.gridRow : undefined}
            contentContainerStyle={[styles.grid, gridInset]}
            renderItem={({ item }) => (
              <ProductCard
                product={item}
                categoryName={catalog.categories.find(c => c.id === item.categoryId)?.name ?? ''}
                hasMods={!!catalog.modifiersByProductId[item.id]}
                isFav={favIds.has(item.id)}
                hideImages={hideImages}
                onPress={() => handleTapProduct(item)}
                onLongPress={() => handleTapProduct(item, true)}
                onToggleFav={() => toggleFavourite(item.id)}
              />
            )}
            // .grid-empty
            ListEmptyComponent={<Text style={styles.gridEmpty}>ما فيه نتائج مطابقة</Text>}
          />
        </View>

        <View style={[styles.cartCol, isNarrow ? styles.cartColNarrow : { width: orderPanelWidth }]}>
          {/* .order-items -- `flex:1; min-height:110px; padding:6px 18px` */}
          <ScrollView
            style={[
              styles.cartLines,
              // `.order-items{flex:1}` at >=761px; `max-height:40vh` at
              // <=760px (rakeen-pos-additions.css:497), where the panel is
              // sized by its content rather than by a leftover flex share.
              isNarrow ? { flexGrow: 1, flexBasis: 'auto', maxHeight: windowHeight * 0.4 } : styles.cartLinesWide,
            ]}
            contentContainerStyle={cart.cart.length === 0 ? styles.cartLinesEmpty : undefined}>
            {cart.cart.length === 0 ? (
              /* .order-empty -- renderOrder()'s own empty branch
                 (rakeen-pos.js:1054): a 38x38 half-opacity shopping-cart
                 glyph over the line "اضغط منتج عشان يضاف". This screen
                 previously showed a bare "السلة فارغة" string that exists
                 nowhere in the source. */
              <View style={styles.orderEmpty}>
                <Svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke={colors.muted} strokeWidth={1.5} opacity={0.5}>
                  <Circle cx={9} cy={21} r={1} />
                  <Circle cx={20} cy={21} r={1} />
                  <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </Svg>
                <Text style={styles.orderEmptyText}>اضغط منتج عشان يضاف</Text>
                {/* .last-tx-card -- only when a previous sale exists in
                    this session, exactly as `state.lastTransaction ? ... : ''`. */}
                {lastTransaction && (
                  <View style={styles.lastTxCard}>
                    <View style={styles.lastTxInfo}>
                      <Text style={styles.lastTxLabel}>آخر عملية</Text>
                      <View style={styles.lastTxValue}>
                        <Money value={lastTransaction.total} size={11} />
                        <Text style={styles.lastTxTime}> — {lastTransaction.time}</Text>
                      </View>
                    </View>
                    <TouchableOpacity style={styles.lastTxReprint} onPress={handleReprintLast} activeOpacity={0.8}>
                      <Text style={styles.lastTxReprintText}>إعادة طباعة</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : (
              cart.cart.map(line => {
                const product = productsById.get(line.productId);
                const unitPrice = cart.unitPriceOf(line);
                const modLabels = cartLineToModLabels(line, catalog.modifiersByProductId);
                return (
                  // .order-item > .oi-row -- child order is qty stepper,
                  // info, line total, remove.
                  // .order-item wraps .oi-row plus the config chips and
                  // the note affordances underneath it.
                  <View key={line.lineId} style={styles.cartLine}>
                    <View style={styles.oiRow}>
                    {/* .oi-qty -- a surf1 pill wrapping the two buttons */}
                    <View style={styles.qtyControls}>
                      <TouchableOpacity onPress={() => cart.changeQty(line.lineId, -1)} style={styles.qtyButton}>
                        {/* U+2212 MINUS SIGN, as in the source markup --
                            not a hyphen, which renders visibly shorter
                            and sits off-centre against the "+". */}
                        <Text style={styles.qtyButtonText}>{'\u2212'}</Text>
                      </TouchableOpacity>
                      <Text style={styles.qtyValue}>{line.qty}</Text>
                      <TouchableOpacity onPress={() => cart.changeQty(line.lineId, 1)} style={styles.qtyButton}>
                        <Text style={styles.qtyButtonText}>+</Text>
                      </TouchableOpacity>
                    </View>
                    {/* .oi-info */}
                    <View style={styles.cartLineInfo}>
                      <Text style={styles.cartLineName} numberOfLines={2}>
                        {product?.name || '—'}
                        {line.isPointsRedemption ? ' 🎁' : ''}
                      </Text>
                      {/* .oi-unit -- rendered ONLY at qty > 1 and never
                          for a points redemption, and reading
                          "<price> / حبة", not a bare price. */}
                      {line.qty > 1 && !line.isPointsRedemption && (
                        <View style={styles.cartLinePrice}>
                          <Money value={unitPrice} size={10} color={colors.muted} />
                          <Text style={styles.cartLineUnitSuffix}> / حبة</Text>
                        </View>
                      )}
                    </View>
                    {/* .oi-total -- "نقاط" instead of a figure for a
                        points redemption, which costs no money. */}
                    {line.isPointsRedemption ? (
                      <Text style={styles.cartLineTotal}>نقاط</Text>
                    ) : (
                      <Money value={unitPrice * line.qty} size={12.5} style={styles.cartLineTotalBox} />
                    )}
                      {/* .oi-remove */}
                      <TouchableOpacity onPress={() => cart.removeFromCart(line.lineId)} style={styles.cartLineRemove} hitSlop={6}>
                        <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={colors.muted} strokeWidth={2} strokeLinecap="round">
                          <Line x1={18} y1={6} x2={6} y2={18} />
                          <Line x1={6} y1={6} x2={18} y2={18} />
                        </Svg>
                      </TouchableOpacity>
                    </View>

                    {/* .oi-config -- the chosen modifier options as chips
                        under the line. formatConfigLabels() also returns a
                        `critical` flag driving .oi-config-tag.critical (an
                        amber variant), but loadPosData()'s option mapper
                        (rakeen-pos.js:6005) builds each option as
                        {id, name, price, default} and never sets
                        `critical` -- so `!!opt.critical` is false for every
                        real product and the amber variant cannot fire.
                        Rendered without it rather than inventing a source
                        for a flag production never populates. */}
                    {modLabels.length > 0 && (
                      <View style={styles.oiConfig}>
                        {modLabels.map((label, i) => (
                          <View key={`${label}-${i}`} style={styles.oiConfigTag}>
                            <Text style={styles.oiConfigTagText}>{label}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Once a note exists the link is REPLACED by the text
                        (`i.note ? <div class="oi-note-text"> : <button
                        class="oi-note-link">`), so they are never both on
                        screen. The input itself is `display:none` until
                        .open is added by the link's own handler. */}
                    {line.note ? (
                      <TouchableOpacity
                        onPress={() => {
                          setNoteDraft(line.note);
                          setEditingNote(line.lineId);
                        }}
                        activeOpacity={0.7}>
                        <Text style={styles.oiNoteText}>📝 {line.note}</Text>
                      </TouchableOpacity>
                    ) : editingNote !== line.lineId ? (
                      <TouchableOpacity
                        onPress={() => {
                          setNoteDraft('');
                          setEditingNote(line.lineId);
                        }}
                        style={styles.oiNoteLink}
                        activeOpacity={0.7}>
                        <Text style={styles.oiNoteLinkText}>+ ملاحظة</Text>
                      </TouchableOpacity>
                    ) : null}
                    {editingNote === line.lineId && (
                      <TextInput
                        style={styles.oiNoteInput}
                        value={noteDraft}
                        onChangeText={setNoteDraft}
                        placeholder="بدون بصل، إضافي صوص..."
                        placeholderTextColor={colors.muted}
                        autoFocus
                        // The source saves on BLUR, not on every keystroke.
                        // RN's blur event carries only `target`, so the
                        // value is held in a draft alongside the open id.
                        onBlur={() => {
                          cart.setLineNote(line.lineId, noteDraft);
                          setEditingNote(null);
                        }}
                      />
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* .op-discount-row -- a dashed toggle that EXPANDS the options,
              which are hidden until then (`.discount-panel{display:none}`
              / `.open{display:flex}`). This screen previously showed all
              five percentages permanently, which is a different control. */}
          <View style={styles.opDiscountRow}>
            <TouchableOpacity
              style={styles.discountToggle}
              onPress={() => setDiscountPanelOpen(o => !o)}
              activeOpacity={0.8}>
              {/* The toggle's own label carries the active state -- the
                  source rewrites its textContent on pick (:1144). */}
              <Text style={styles.discountToggleText}>
                {cart.discountPct > 0 ? `خصم ${cart.discountPct}٪ مفعّل` : '+ خصم'}
              </Text>
            </TouchableOpacity>
            {discountPanelOpen && (
              <View style={styles.discountPanel}>
                {DISCOUNT_OPTIONS.map(pct => {
                  const active = pct > 0 && cart.discountPct === pct;
                  return (
                    <TouchableOpacity
                      key={pct}
                      style={[styles.discountChip, active && styles.discountChipActive]}
                      onPress={() => {
                        cart.setDiscountPct(pct);
                        // The panel closes on any pick, إلغاء included.
                        setDiscountPanelOpen(false);
                      }}
                      activeOpacity={0.8}>
                      <Text style={[styles.discountChipText, active && styles.discountChipTextActive]}>
                        {pct === 0 ? 'إلغاء' : `${pct}٪`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* The order panel has NO customer chip and NO points-redeem
              strip. rakeen-pos.css defines .customer-chip but nothing ever
              renders it (confirmed live: customerChipExists === false), the
              customer is attached in the payment popup's own step, and
              updatePointsRedeemStrip() is a deliberate no-op whose comment
              gives the reason: the one-tap redeem picker "let a cashier open
              the redeem picker with one tap and no real cardholder consent".
              openPointsRedeemModal() is still defined but has no call site
              anywhere in the source. Redemption's sanctioned path is the
              الولاء payment tab, which requires the customer's own
              confirmation. Both rows removed rather than kept as a
              convenience the source specifically withdrew. */}

          {/* .order-summary. renderOrder() (rakeen-pos.js:1120) emits these
              rows in exactly this order, and the first one -- the item
              COUNT, `state.cart.reduce((s,i)=>s+i.qty,0)` -- was missing
              here entirely. */}
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>عدد الأصناف</Text>
              <Text style={styles.totalsValue}>{cart.cart.reduce((n, i) => n + i.qty, 0)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>المجموع الفرعي</Text>
              <Money value={cart.totals.subtotal} size={11.5} />
            </View>
            {cart.totals.discount > 0 && (
              // .sum-row.discount -- the label carries the percentage,
              // and the figure is NEGATIVE (`rkMoney(-discount)`).
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>{`خصم (${cart.discountPct}٪)`}</Text>
                <Money value={-cart.totals.discount} size={11.5} color={colors.accentText} />
              </View>
            )}
            <View style={styles.totalsRow}>
              {/* The VAT label gains "(شاملة ضمن الإجمالي)" when prices
                  are VAT-inclusive, so the figure is not read as an
                  addition on top of the total. */}
              <Text style={styles.totalsLabel}>
                ضريبة القيمة المضافة{financial?.pricesIncludeVat ? ' (شاملة ضمن الإجمالي)' : ''}
              </Text>
              <Money value={cart.totals.vat} size={11.5} />
            </View>
            <View style={[styles.totalsRow, styles.totalsRowFinal]}>
              <Text style={styles.totalsLabelFinal}>الإجمالي</Text>
              <Money value={cart.totals.total} size={17} color={colors.accentText} />
            </View>
          </View>

          {!!submitStatus && <Text style={styles.submitStatus}>{submitStatus}</Text>}

          {/* .order-actions -- `padding:8px 18px 14px; gap:6px`, holding
              the pay button and, under it, .clear-btn. */}
          <View style={styles.orderActions}>
            {cart.orderChannel === 'dine_in' ? (
              <>
                <PayButton
                  label={submitting ? 'جارٍ الإرسال...' : lastRegisteredDineInOrderId ? 'إضافة للطلب' : 'تسجيل الطلب'}
                  onPress={handleRegisterDineInOrder}
                  disabled={cart.cart.length === 0 || submitting}
                />
                {lastRegisteredDineInOrderId != null && (
                  <PayButton
                    label={`دفع الطلب #${lastRegisteredDineInOrderId}`}
                    onPress={handleOpenDineInPayment}
                    disabled={submitting}
                  />
                )}
              </>
            ) : (
              /* #payBtn is a two-part label -- #payBtnLabel then
                 #payBtnAmount (rakeen-pos.js:1126-1128) -- so it reads
                 "ادفع — 12.50", never a bare "الدفع". */
              <PayButton
                label={submitting ? 'جارٍ الإرسال...' : 'ادفع'}
                amount={submitting ? undefined : cart.totals.total}
                onPress={() => setPaymentModalOpen(true)}
                disabled={cart.cart.length === 0 || submitting}
              />
            )}

            {/* .clear-btn -- a two-tap arm/confirm with no blocking
                dialog, and a 3s timeout that disarms it (:1417). The
                armed state restyles the button (.armed) AND swaps its
                label. Was missing from this screen entirely. */}
            <TouchableOpacity
              style={[styles.clearBtn, clearArmed && styles.clearBtnArmed]}
              onPress={handleClearOrder}
              activeOpacity={0.8}>
              <Text style={[styles.clearBtnText, clearArmed && styles.clearBtnTextArmed]}>
                {clearArmed ? 'اضغط مرة ثانية للتأكيد' : 'إفراغ الطلب'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </HomeZones>

      {/* The modal now owns the channel and customer steps, because that
          is where the source puts them -- #pmChannelRow and
          renderCustomerStep() are both frames of this popup's own step
          stack, not controls on the Home screen. */}
      <PaymentModal
        visible={paymentModalOpen}
        total={cart.orderChannel === 'dine_in' ? dineInOrderTotal : cart.totals.total}
        submitting={submitting}
        onCancel={() => setPaymentModalOpen(false)}
        businessId={cashier.business_id}
        channel={cart.orderChannel}
        onChannelChange={cart.setOrderChannel}
        customer={selectedCustomer}
        onCustomerChange={setSelectedCustomer}
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
          onConfirm={(config, qty) => {
            cart.addWithConfig(modifierTarget.id, config, qty);
            setModifierTarget(null);
          }}
        />
      )}
    </View>
  );
}

/** .pay-btn (rakeen-pos.css:342) -- lime gradient, disabled state swaps to
 *  a flat surf2/muted look instead of the gradient (":disabled" rule). */
/**
 * .product-card, structured exactly as renderProductGrid() builds it:
 *
 *   .fav-star        top / inline-start, toggles the favourite
 *   .customize-dot   top / inline-end, ONLY when the product has modifiers
 *   .product-icon    the gradient tile -- and .product-price lives INSIDE
 *                    it (bottom / inline-end of the tile, not the card)
 *   .product-name
 *   .product-cat     category name, or "<n> د · <category>" for a service
 *
 * Long press is the source's 480ms timer that opens the customise flow;
 * a plain tap runs the normal one. Tapping the star must NOT also add to
 * cart, which the source enforces with an early `closest('.fav-star')`
 * check -- here the star is simply its own touchable above the card.
 */
function ProductCard({
  product,
  categoryName,
  hasMods,
  isFav,
  hideImages,
  onPress,
  onLongPress,
  onToggleFav,
}: {
  product: Product;
  categoryName: string;
  hasMods: boolean;
  isFav: boolean;
  hideImages: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onToggleFav: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const imageSrc = !hideImages ? product.imageThumbUrl || product.imageUrl : null;
  const meta = product.isService && product.durationMinutes
    ? `${product.durationMinutes} د${categoryName ? ` · ${categoryName}` : ''}`
    : categoryName;
  return (
    <TouchableOpacity
      style={styles.productCard}
      onPress={onPress}
      onLongPress={onLongPress}
      // rakeen-pos.js's pressTimer fires at 480ms
      delayLongPress={480}
      activeOpacity={0.85}>
      <View style={styles.productIcon}>
        <GradientFill gradient={gradients.productIcon} radius={radii.md} />
        {/* renderProducts() (rakeen-pos.js:603) picks exactly one of these
            two as .product-icon's content:
              (p.image && !POS_HIDE_PRODUCT_IMAGES)
                ? `<img src="${p.imageThumb || p.image}">`
                : ICONS[p.icon]
            -- the thumb preferred over the full-size photo, and the
            category icon whenever the business hides photos (which is the
            default; see getHideProductImages). The tile was previously an
            empty gradient in both cases. */}
        {imageSrc ? (
          // .product-icon img -- 100%/100%, object-fit:cover, r-md.
          <Image source={{ uri: imageSrc }} style={styles.productImage} resizeMode="cover" />
        ) : (
          // .product-icon svg -- a flat 26x26, inheriting the tile's
          // `color` (flagGreenDeep in light, lime in dark).
          <CategoryIcon
            name={iconForCategoryName(categoryName)}
            width={26}
            height={26}
            stroke={colors.productIconInk}
          />
        )}
        {/* .product-price sits inside .product-icon, which is the
            position:relative ancestor it is anchored to. */}
        <View style={styles.productPriceChip}>
          <Money value={product.price} size={11} color={colors.accentText} />
        </View>
      </View>
      <Text style={styles.productName} numberOfLines={2}>
        {product.name}
      </Text>
      {!!meta && <Text style={styles.productCat}>{meta}</Text>}

      {/* .fav-star */}
      <TouchableOpacity
        style={[styles.favStar, isFav && styles.favStarOn]}
        onPress={onToggleFav}
        hitSlop={6}
        activeOpacity={0.7}>
        <Svg
          width={13}
          height={13}
          viewBox="0 0 24 24"
          fill={isFav ? colors.limeDeep : 'none'}
          stroke={isFav ? colors.limeDeep : colors.ivory}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={isFav ? 1 : 0.75}>
          <Polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </Svg>
      </TouchableOpacity>

      {/* .customize-dot -- only for products that have modifier groups */}
      {hasMods && (
        <View style={styles.customizeDot}>
          <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={colors.graphite} strokeWidth={2.5} strokeLinecap="round">
            <Line x1={12} y1={5} x2={12} y2={19} />
            <Line x1={5} y1={12} x2={19} y2={12} />
          </Svg>
        </View>
      )}
    </TouchableOpacity>
  );
}

/**
 * #payBtn is two spans, not one string: #payBtnLabel then #payBtnAmount,
 * the latter written with `innerHTML = rkMoney(total)`
 * (rakeen-pos.js:1126-1128). So `amount` is passed as a NUMBER and drawn
 * by <Money>, giving it the same fraction/riyal treatment as every other
 * figure -- interpolating it into `label` would flatten it back to a
 * plain string.
 */
function PayButton({
  label,
  amount,
  onPress,
  disabled,
}: {
  label: string;
  amount?: number;
  onPress: () => void;
  disabled: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const content = (
    <>
      <Text style={[styles.payButtonText, disabled && styles.payButtonTextDisabled]}>{label}</Text>
      {amount != null && (
        <>
          <Text style={[styles.payButtonText, disabled && styles.payButtonTextDisabled]}>{' \u2014 '}</Text>
          <Money value={amount} size={15} color={disabled ? colors.muted : colors.flagGreenDeep} />
        </>
      )}
    </>
  );
  if (disabled) {
    return <View style={[styles.payButton, styles.payButtonDisabled]}>{content}</View>;
  }
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <View style={styles.payButton}>
        <GradientFill gradient={gradients.payButton} radius={radii.md} />
        {content}
      </View>
    </TouchableOpacity>
  );
}

// Every rule below is annotated with the exact rakeen-pos.css / additions
// selector it ports -- see theme.ts's own header for the sourcing rule.
const useStyles = createStyles((colors, shadows) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing[6] },
  subtitle: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted, textAlign: 'center', padding: spacing[3] },
  error: { fontFamily: fonts.sansBold, color: colors.danger, fontSize: 13, textAlign: 'center' },
  offlineBanner: { backgroundColor: `rgba(${colors.amberRgb},0.15)`, padding: spacing[2] },
  offlineBannerText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.amber, textAlign: 'center' },
  // No direct PWA equivalent (dine-in table context banner is RN-only
  // chrome) -- built from the same surf/line/lime tokens as everything else
  // rather than inventing new colors.
  tableBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surf2,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  tableBannerText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text },
  tableBannerBack: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tableBannerLink: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.accentText },
  // .home-zones -- `flex:1; display:flex` (row), column at <=760px
  homeZones: { flex: 1, flexDirection: 'row' },
  // At <=760px this is the page scroller (see HomeZones): it fills
  // .screens, and its CONTENT is the stacked column that may be taller.
  homeZonesNarrow: { flex: 1 },
  // `.app{min-height:100vh}` -- when the stack is shorter than the screen
  // the order panel takes up the slack instead of leaving a bare strip;
  // when it is taller, flexGrow does nothing and the column scrolls.
  homeZonesNarrowContent: { flexGrow: 1 },
  // .products-zone -- `flex:1; min-width:0`
  productsZone: { flex: 1, minWidth: 0 },
  productsZoneNarrow: { flex: 0 },
  // .order-panel -- `width:360px; flex-shrink:0` (the live width is set
  // inline from the breakpoint, see orderPanelWidth). `border-inline-start`
  // in an RTL document resolves to the panel's RIGHT edge, which is what
  // borderStart maps to once I18nManager RTL is on.
  cartCol: {
    flexShrink: 0,
    backgroundColor: colors.cardBg,
    borderStartWidth: 1,
    borderStartColor: colors.line,
    // `.order-panel{overflow:hidden}` (rakeen-pos.css:252). RN Views do
    // not clip by default, so without this an overflowing child paints
    // outside the column -- over the absolutely-positioned bottom nav at
    // >=761px, and off the bottom of the screen below it.
    overflow: 'hidden',
  },
  // @media (max-width:760px): `width:100%; border-inline-start:none;
  // border-top:8px solid var(--surf1)`
  // flexGrow (not flex:1) is the difference between "take the slack if
  // there is any" and "take exactly the leftover, content be damned" --
  // the latter is what pushed the pay button off the bottom of a phone.
  // flexShrink stays 0, so the panel can never be compressed below the
  // height its own controls need.
  // `.order-panel{...; overflow:visible}` at <=760px -- the clip above is
  // a >=761px measure (a fixed-height column); here the panel is sized by
  // its own content inside the page scroller and has nothing to clip.
  cartColNarrow: {
    width: '100%',
    flexGrow: 1,
    borderStartWidth: 0,
    borderTopWidth: 8,
    borderTopColor: colors.surf1,
    overflow: 'visible',
  },
  // .products-toolbar -- `display:flex; gap:10px; padding:18px 20px 12px`
  productsToolbar: { flexDirection: 'row', gap: 10, paddingTop: 18, paddingHorizontal: 20, paddingBottom: 12 },
  // .search-box -- `flex:1; position:relative`
  searchBox: { flex: 1, position: 'relative' },
  searchIcon: { position: 'absolute', left: 15, top: '50%', marginTop: -8, zIndex: 1 },
  // .search-box input
  searchInput: {
    paddingVertical: 13,
    paddingLeft: 42,
    paddingRight: 16,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surf1,
    color: colors.text,
    fontFamily: fonts.sansSemiBold,
    fontSize: 13.5,
    textAlign: 'right',
  },
  // .fav-toggle -- `width:48px; flex-shrink:0; border-radius:var(--r-full)`
  favToggle: {
    width: 48,
    flexShrink: 0,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surf1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favToggleActive: { backgroundColor: colors.lime, borderColor: colors.lime },
  favToggleText: { fontSize: 18, color: colors.muted },
  favToggleTextActive: { color: colors.flagGreenDeep },
  // .cat-sidebar -- `width:84px; flex-shrink:0; flex-direction:column;
  // gap:6px; padding:14px 8px; border-inline-end:1px solid var(--line);
  // background:var(--surf1)`
  catSidebar: {
    width: layout.catSidebarWidth,
    flexGrow: 0,
    flexShrink: 0,
    borderEndWidth: 1,
    borderEndColor: colors.line,
    backgroundColor: colors.surf1,
  },
  catSidebarContent: { gap: 6, paddingVertical: 14, paddingHorizontal: 8 },
  // additions.css:475 -- `width:100%; flex-direction:row; overflow-x:auto;
  // border-inline-end:none; border-bottom:1px solid var(--line);
  // padding:10px 12px; background:none`
  catSidebarNarrow: {
    width: '100%',
    flexGrow: 0,
    borderEndWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: 'transparent',
  },
  catSidebarContentNarrow: { gap: 6, paddingVertical: 10, paddingHorizontal: 12 },
  // .cat-btn -- `padding:10px 4px; border-radius:var(--r-md); gap:5px;
  // font-weight:700; font-size:10px; line-height:1.25`
  catBtn: {
    flexShrink: 0,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  // additions.css:476 -- `flex-direction:row; padding:8px 14px;
  // border-radius:var(--r-full); white-space:nowrap; width:auto`
  catBtnNarrow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 14, borderRadius: radii.full },
  catBtnPressed: { backgroundColor: colors.surf2 },
  // .cat-btn.active -- lime fill plus `0 6px 16px rgba(lime-deep, .35)`
  catBtnActive: {
    backgroundColor: colors.lime,
    borderColor: colors.lime,
    shadowColor: colors.limeDeep,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 4,
  },
  catBtnText: { fontFamily: fonts.sansBold, fontSize: 10, color: colors.muted, textAlign: 'center', lineHeight: 13 },
  catBtnTextActive: { color: colors.flagGreenDeep },
  // .product-grid -- `padding:4px 20px 22px; gap:10px`
  grid: { paddingTop: 4, paddingHorizontal: 20, paddingBottom: 22, gap: 10 },
  gridRow: { gap: 10 },
  // .grid-empty
  gridEmpty: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  // .product-card
  productCard: {
    // `1fr` grid track: the row's gap already provides the 10px spacing,
    // so the card must not add a margin of its own on top of it.
    flex: 1,
    position: 'relative',
    // NOT overflow:hidden -- .fav-star/.customize-dot sit at the card's
    // very edge and the source lets them paint there.
    backgroundColor: colors.cardBg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 12,
    ...shadows.sm,
  },
  // .product-icon -- `position:relative` so .product-price anchors to it
  productIcon: { width: '100%', height: 72, borderRadius: radii.md, marginBottom: 7, position: 'relative' },
  // .product-name
  productName: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text, lineHeight: 16 },
  // .product-cat -- `font-size:10px; font-weight:600; margin-top:1px`
  productCat: { fontFamily: fonts.sansSemiBold, fontSize: 10, color: colors.muted, marginTop: 1 },
  // .fav-star -- `top:8px; inset-inline-start:8px; 24px circle`
  favStar: {
    position: 'absolute',
    top: 8,
    start: 8,
    zIndex: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,15,10,0.5)',
  },
  favStarOn: { backgroundColor: `rgba(${colors.limeDeepRgb},0.3)` },
  // .customize-dot -- `top:8px; inset-inline-end:8px; 22px circle;
  // background:var(--sand); box-shadow:0 0 0 2px var(--card-bg)`
  customizeDot: {
    position: 'absolute',
    top: 8,
    end: 8,
    zIndex: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sand,
    // the CSS spread-only shadow is a 2px ring in the card colour
    borderWidth: 2,
    borderColor: colors.cardBg,
  },
  // .product-price -- absolutely positioned chip, bottom-LEFT in this RTL
  // app (inset-inline-end resolves to left, not right -- see JSX comment).
  productPriceChip: {
    position: 'absolute',
    bottom: 5,
    // `inset-inline-end:5px` -- `end` is RN's auto-flipping counterpart,
    // so this resolves to the left edge under RTL exactly as the CSS does.
    end: 5,
    backgroundColor: colors.priceChipBg,
    borderRadius: radii.full,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  // .product-price -- --lime-deep, overridden to --lime in dark
  productPrice: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.accentText, writingDirection: 'ltr' },
  // .channel-row
  channelRow: { flexDirection: 'row', gap: 4, padding: 4, backgroundColor: colors.surf1, borderRadius: radii.full, marginHorizontal: spacing[4], marginTop: spacing[3] },
  // .channel-btn
  channelTab: { flex: 1, paddingVertical: 8, paddingHorizontal: 4, borderRadius: radii.full, alignItems: 'center' },
  channelTabActive: {
    backgroundColor: colors.lime,
    shadowColor: colors.limeDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 3,
  },
  channelTabText: { fontFamily: fonts.sansBold, fontSize: 11.5, color: colors.muted },
  channelTabTextActive: { color: colors.flagGreenDeep },
  // .product-icon img
  productImage: { width: '100%', height: '100%', borderRadius: radii.md },
  // .order-items -- `flex:1; min-height:110px; overflow-y:auto; padding:6px 18px`
  //
  // min-height is deliberately NOT ported. In CSS it is a floor for an
  // empty cart on a roomy screen; in RN it is a hard Yoga constraint that
  // wins over flexShrink, so on a short viewport (iPhone landscape: a
  // 390pt-tall order panel) it kept 110pt for the item list and pushed
  // the totals and the pay button out through the bottom of the panel.
  // The empty state renders ~110pt of its own content anyway.
  cartLines: { minHeight: 0, paddingHorizontal: 18, paddingVertical: 6 },
  cartLinesWide: { flex: 1 },
  // .order-empty is `height:100%`, which only centres if the scroll
  // content is allowed to fill the viewport -- hence flexGrow on the
  // container rather than a height on the child.
  cartLinesEmpty: { flexGrow: 1 },
  // .order-empty -- `height:100%; gap:12px; padding:20px`, centred
  orderEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
  },
  // .order-empty p
  orderEmptyText: { fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.muted, textAlign: 'center' },
  // .last-tx-card
  lastTxCard: {
    marginTop: 6,
    width: '100%',
    padding: 14,
    borderRadius: radii.md,
    backgroundColor: colors.surf1,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 8,
  },
  // .last-tx-info -- `justify-content:space-between`
  lastTxInfo: { flexDirection: 'row', justifyContent: 'space-between' },
  lastTxLabel: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.text },
  // the amount half is .mono in the source markup
  // .last-tx-info's second span -- an rkMoney box followed by the time
  lastTxValue: { flexDirection: 'row', alignItems: 'baseline' },
  lastTxTime: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.text },
  // .last-tx-reprint
  lastTxReprint: {
    padding: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  lastTxReprintText: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.muted },
  // .op-discount-row -- `padding:12px 18px 0`
  opDiscountRow: { paddingTop: 12, paddingHorizontal: 18 },
  // .discount-toggle -- a DASHED, borderless-background full-width button
  discountToggle: {
    width: '100%',
    padding: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountToggleText: { fontFamily: fonts.sansBold, fontSize: 11.5, color: colors.muted },
  // .discount-panel.open -- `margin-top:8px; gap:6px; display:flex`
  discountPanel: { flexDirection: 'row', gap: 6, marginTop: 8 },
  // .order-actions -- `padding:8px 18px 14px; gap:6px`
  orderActions: { paddingTop: 8, paddingHorizontal: 18, paddingBottom: 14, gap: 6 },
  // .clear-btn
  clearBtn: {
    width: '100%',
    padding: 8,
    borderRadius: radii.md,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  // .clear-btn.armed -- a literal rgba(224,138,106,0.15), not a token
  clearBtnArmed: { backgroundColor: 'rgba(224,138,106,0.15)' },
  clearBtnText: { fontFamily: fonts.sansBold, fontSize: 11.5, color: colors.muted },
  clearBtnTextArmed: { color: colors.danger },
  // .order-item (`padding:8px 0; border-bottom`) + .oi-row (`gap:8px`)
  // .order-item -- `padding:8px 0; border-bottom:1px solid var(--line)`
  cartLine: {
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  // .oi-row -- `display:flex; align-items:center; gap:8px`
  oiRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  // .oi-config -- `flex-wrap:wrap; gap:4px; margin-top:4px`
  oiConfig: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  // .oi-config-tag
  oiConfigTag: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: radii.full, backgroundColor: colors.surf2 },
  oiConfigTagText: { fontFamily: fonts.sansBold, fontSize: 9.5, color: colors.muted },
  // .oi-note-link -- `padding-inline-start:0`, so it sits flush
  oiNoteLink: { marginTop: 3, alignSelf: 'flex-start' },
  oiNoteLinkText: { fontFamily: fonts.sansMedium, fontSize: 10, color: colors.muted },
  // .oi-note-text -- `opacity:0.7` on the normal text colour
  oiNoteText: { fontFamily: fonts.sansSemiBold, fontSize: 10, color: colors.text, opacity: 0.7, marginTop: 3 },
  // .oi-note-input
  oiNoteInput: {
    width: '100%',
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surf1,
    color: colors.text,
    fontFamily: fonts.sansMedium,
    fontSize: 11.5,
    textAlign: 'right',
  },
  // .oi-info -- `flex:1; min-width:0`
  cartLineInfo: { flex: 1, minWidth: 0 },
  // .oi-name -- 2-line clamp, line-height 1.3 * 12.5px
  cartLineName: { fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.text, lineHeight: 16 },
  // .oi-unit
  cartLinePrice: { flexDirection: 'row', alignItems: 'baseline', marginTop: 1 },
  cartLineUnitSuffix: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.muted },
  // .oi-total -- mono, 800, 12.5px, flex-shrink:0
  cartLineTotal: { fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.text, flexShrink: 0 },
  cartLineTotalBox: { flexShrink: 0 },
  // .oi-remove -- 20px, muted, 12px glyph
  cartLineRemove: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  // .oi-qty -- `gap:4px; flex-shrink:0; background:var(--surf1);
  // border-radius:var(--r-full); padding:2px`
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    backgroundColor: colors.surf1,
    borderRadius: radii.full,
    padding: 2,
  },
  // .qty-btn
  qtyButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  qtyButtonText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text },
  // .qty-val
  qtyValue: { fontFamily: fonts.sansBold, fontSize: 11.5, minWidth: 16, textAlign: 'center', color: colors.text },
  // .disc-btn
  discountChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surf1,
    alignItems: 'center',
  },
  discountChipActive: { backgroundColor: colors.lime, borderColor: colors.lime },
  discountChipText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text },
  discountChipTextActive: { color: colors.flagGreenDeep },
  // NOTE: rakeen-pos.css defines a .customer-chip rule, but it's dead CSS
  // -- the real PWA never renders it. Its actual customer-attach flow is
  // a step INSIDE the payment modal (renderCustomerStep(), triggered by
  // "الدفع"), not a persistent button in the cart panel like this. That's
  // a flow/UX placement difference, not a styling one -- moving it would
  // mean restructuring the payment sequence, so it's left as-is here and
  // flagged rather than silently changed. Values below reuse this file's
  // own surf1/line/full-pill language for consistency, not a real class.
  customerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surf1,
    paddingVertical: 7,
    paddingHorizontal: spacing[3],
    marginHorizontal: spacing[4],
    marginTop: spacing[2],
  },
  customerRowSet: { borderColor: colors.limeDeep, backgroundColor: `rgba(${colors.limeRgb},0.08)` },
  customerRowLabel: { flex: 1, fontFamily: fonts.sansBold, fontSize: 11.5, color: colors.muted },
  customerRowLabelSet: { color: colors.text },
  customerRowClear: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.danger },
  // No dedicated PWA class found for the loyalty-redeem strip -- built from
  // the same amber token used for other "attention, optional action" UI.
  loyaltyRow: {
    backgroundColor: `rgba(${colors.amberRgb},0.12)`,
    borderRadius: radii.md,
    padding: spacing[3],
    marginHorizontal: spacing[4],
    marginTop: spacing[2],
    alignItems: 'center',
  },
  loyaltyRowText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.amber },
  // .order-summary / .sum-row
  // .order-summary -- `padding:6px 18px; gap:2px`
  totalsBox: { paddingHorizontal: 18, paddingVertical: 6, gap: 2 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  totalsRowFinal: { marginTop: 2, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.line, borderStyle: 'dashed' },
  totalsLabel: { fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.muted },
  totalsValue: { fontFamily: fonts.monoMedium, fontSize: 11.5, color: colors.muted, writingDirection: 'ltr' },
  totalsValueDiscount: { color: colors.limeDeep },
  totalsLabelFinal: { fontFamily: fonts.sansBold, fontSize: 13.5, color: colors.text },
  // .sum-row.total .mono -- --lime-deep, overridden to --lime in dark
  totalsValueFinal: { fontFamily: fonts.monoBold, fontSize: 17, color: colors.accentText, writingDirection: 'ltr' },
  // .pay-btn, inside .order-actions's own padding:8px 18px 14px
  // .pay-btn -- `width:100%; padding:13px; border-radius:var(--r-md);
  // box-shadow:0 10px 24px rgba(var(--lime-deep-rgb), 0.35)`. The inline
  // margins that used to sit here are gone: .order-actions now supplies
  // the 18px padding and the 6px gap, so keeping them doubled the inset.
  payButton: {
    // Solid fallback under the GradientFill layer: if the gradient ever
    // fails to paint, the button degrades to flat lime at the right
    // size instead of vanishing. It also gives iOS an opaque layer to
    // derive the shadow from. The disabled style overrides it.
    backgroundColor: colors.lime,
    flexDirection: 'row',
    width: '100%',
    padding: 13,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.limeDeep,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 6,
  },
  // .pay-btn:disabled drops the shadow along with the gradient.
  payButtonDisabled: { backgroundColor: colors.surf2, shadowOpacity: 0, elevation: 0 },
  payButtonText: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.flagGreenDeep },
  payButtonTextDisabled: { color: colors.muted },
  submitStatus: { fontFamily: fonts.sansSemiBold, fontSize: 11, textAlign: 'center', paddingHorizontal: spacing[4], color: colors.muted },
  }),
);
