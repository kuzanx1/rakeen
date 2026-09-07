import { useCallback, useMemo, useRef, useState } from 'react';
import {
  CartLine,
  CartLineConfig,
  ModifierDefinition,
  OrderChannel,
  addPointsRedemptionToCart,
  addFreeRewardToCart,
  addToCartWithConfig,
  buildDefaultConfig,
  cartTotals,
  changeQty as changeQtyPure,
  lineUnitPrice,
  removeFromCart as removeFromCartPure,
} from '../domain/cart';
import type { Product } from '../domain/catalog';

/**
 * React-side orchestration for the pure domain/cart.ts engine -- this is
 * the "application layer" for Cart specifically. No I/O of any kind: the
 * current PWA keeps its cart in an in-memory `state.cart` object only
 * (grepped directly -- no localStorage/IndexedDB write for the
 * in-progress cart anywhere), lost on reload. This hook preserves that
 * exact behavior (in-memory useState only) rather than inventing NEW
 * persistence the source app doesn't have -- "preserve cart persistence
 * requirements" means preserving the absence of persistence here, not
 * adding it.
 */
export function useCart(
  productsById: Map<number, Product>,
  modifiersByProductId: Record<number, ModifierDefinition>,
  vatRegistered: boolean,
  vatRate: number,
  pricesIncludeVat: boolean,
) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountPct, setDiscountPct] = useState(0);
  const [orderChannel, setOrderChannel] = useState<OrderChannel>('dine_in');
  const [deliveryPlatformId] = useState<string | null>(null); // platform selection is a later, delivery-specific checkpoint
  const lineIdCounter = useRef(1);
  const nextLineId = useCallback(() => lineIdCounter.current++, []);

  const unitPriceOf = useCallback(
    (item: CartLine) => {
      const product = productsById.get(item.productId);
      const basePrice = product?.price ?? 0;
      const modDef = modifiersByProductId[item.productId];
      return lineUnitPrice(item, basePrice, modDef, orderChannel, deliveryPlatformId);
    },
    [productsById, modifiersByProductId, orderChannel, deliveryPlatformId],
  );

  /** Simple products (no modifier definition) always fast-add instantly --
   *  matches addToCart()'s real behavior in rakeen-pos.js exactly. */
  /**
   * رصيدُ المكافأة: مصروفٌ من محفظة العميل ولم يُطبَّق على صنفٍ بعد.
   *
   * الخصمُ يقع لحظة التأكيد -- قبل اختيار الصنف. فهو ملكُ العميل من
   * تلك اللحظة، وليس سطراً يضيع بضغطة حذف: يمسح الكاشير الكوب، فيعود
   * الرصيد إلى يده، ويضغط صنفاً غيره فيدخل بصفر بلا تأكيدٍ ثانٍ.
   *
   *   rewardArm        -- أُكِّد ولم يُخصم بعد (يحمل رقم الطلب).
   *   freeRewardCredit -- خُصم ومُسح سطرُه، فيُطبَّق بلا خصمٍ ثانٍ.
   *
   * (نظيرها في الويب: state.rewardArm / state.freeRewardCredit.)
   */
  const [rewardArm, setRewardArm] = useState<number | null>(null);
  const [freeRewardCredit, setFreeRewardCredit] = useState(0);

  const addProduct = useCallback(
    (productId: number) => {
      const modDef = modifiersByProductId[productId];
      const config = modDef ? buildDefaultConfig(modDef) : null;
      setCart(prev => addToCartWithConfig(prev, productId, config, 1, nextLineId));
    },
    [modifiersByProductId, nextLineId],
  );

  const addWithConfig = useCallback(
    (productId: number, config: CartLineConfig | null, qty: number) => {
      setCart(prev => addToCartWithConfig(prev, productId, config, qty, nextLineId));
    },
    [nextLineId],
  );

  /** Feature Parity Pass -- Loyalty. Always a fresh free line -- see
   *  domain/cart.ts's addPointsRedemptionToCart doc comment. */
  const addPointsRedemptionProduct = useCallback(
    (productId: number) => {
      setCart(prev => addPointsRedemptionToCart(prev, productId, nextLineId));
    },
    [nextLineId],
  );

  /** المكافأة المجانية بعد تأكيد صاحبها -- سطرٌ بسعر صفر بلا ثمن نقاط. */
  const addFreeRewardProduct = useCallback(
    (productId: number) => {
      setCart(prev => addFreeRewardToCart(prev, productId, nextLineId));
    },
    [],
  );

  const changeQty = useCallback((lineId: number, delta: number) => {
    setCart(prev => {
      const line = prev.find(l => l.lineId === lineId);
      // النزول إلى الصفر حذفٌ -- فيُعاد الرصيد كما يُعاد عند الحذف.
      if (line?.isFreeReward && line.qty + delta <= 0) setFreeRewardCredit(c => c + 1);
      return changeQtyPure(prev, lineId, delta);
    });
  }, []);

  /**
   * وحذفُ السطر المجاني يُعيد الرصيد، لا يُسقطه.
   *
   * المكافأة انخصمت من محفظته وانتهت -- فحذفُ سطرها لا يُرجعها إليه،
   * إنما يُضيعها. والعميل يغيّر رأيه في الصنف لا في المكافأة.
   */
  const removeFromCart = useCallback((lineId: number) => {
    setCart(prev => {
      const line = prev.find(l => l.lineId === lineId);
      if (line?.isFreeReward) setFreeRewardCredit(c => c + 1);
      return removeFromCartPure(prev, lineId);
    });
  }, []);

  /** .oi-note-input's blur handler (rakeen-pos.js:1058): the typed value
   *  is TRIMMED before it is stored, so a note of only spaces clears the
   *  line back to showing the "+ ملاحظة" link rather than an empty tag. */
  const setLineNote = useCallback((lineId: number, note: string) => {
    setCart(prev => prev.map(l => (l.lineId === lineId ? { ...l, note: note.trim() } : l)));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setDiscountPct(0);
    setRewardArm(null);
    setFreeRewardCredit(0);
  }, []);

  const totals = useMemo(
    () => cartTotals(cart, unitPriceOf, discountPct, vatRegistered, vatRate, pricesIncludeVat),
    [cart, unitPriceOf, discountPct, vatRegistered, vatRate, pricesIncludeVat],
  );

  return {
    cart,
    totals,
    discountPct,
    setDiscountPct,
    orderChannel,
    setOrderChannel,
    addProduct,
    addWithConfig,
    addPointsRedemptionProduct,
    addFreeRewardProduct,
    rewardArm,
    setRewardArm,
    freeRewardCredit,
    setFreeRewardCredit,
    changeQty,
    removeFromCart,
    setLineNote,
    clearCart,
    unitPriceOf,
  };
}
