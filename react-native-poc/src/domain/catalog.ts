/**
 * Domain layer: plain types for categories/products. Mirrors
 * public/pos/rakeen-pos.js's real CATEGORIES/PRODUCTS shape and its one
 * genuinely clever bit of design worth preserving exactly: a service's
 * virtual product id is its real id NEGATED (-s.id) so it can share one
 * cart array with menu_items without ever colliding (menu_items ids are
 * always positive bigints) -- every place that turns a cart line back
 * into an order later branches on the SIGN of this id, so this convention
 * is load-bearing, not cosmetic. Kept unchanged rather than "cleaned up."
 */

export interface Category {
  id: string;
  name: string;
  nameEn: string;
}

export interface Product {
  /** Positive for a menu_item, negative for a service -- see file header. */
  id: number;
  categoryId: string;
  name: string;
  nameEn: string | null;
  price: number;
  isService: boolean;
  imageUrl: string | null;
  durationMinutes?: number;
}

/** Same list as SERVICE_BUSINESS_TYPES in rakeen-pos.js -- a service
 *  business (salon/car_wash/clinic/...) sources products from `services`
 *  instead of `menu_items`. Kept as one literal list in both places
 *  rather than a shared import, matching how the two clients (PWA and
 *  this RN app) intentionally don't share JS modules -- see
 *  docs/react-native-migration/00-protection-and-rollback.md's PWA-is-not-
 *  replaced rule. If this list ever changes, it must be updated in BOTH
 *  rakeen-pos.js and here. */
export const SERVICE_BUSINESS_TYPES = [
  'salon',
  'ladies_salon',
  'car_wash',
  'mobile_car_wash',
  'clinic',
  'tailoring',
  'hotel',
];

export function isServiceBusinessType(businessType: string): boolean {
  return SERVICE_BUSINESS_TYPES.includes(businessType);
}
