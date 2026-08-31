import { useCallback, useMemo, useRef, useState } from 'react';
import {
  CartLine,
  CartLineConfig,
  ModifierDefinition,
  OrderChannel,
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

  const changeQty = useCallback((lineId: number, delta: number) => {
    setCart(prev => changeQtyPure(prev, lineId, delta));
  }, []);

  const removeFromCart = useCallback((lineId: number) => {
    setCart(prev => removeFromCartPure(prev, lineId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setDiscountPct(0);
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
    changeQty,
    removeFromCart,
    clearCart,
    unitPriceOf,
  };
}
