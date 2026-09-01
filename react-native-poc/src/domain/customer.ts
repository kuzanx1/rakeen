/**
 * Feature Parity Pass -- Customer Management. Reuses the PWA's EXACT
 * customer model (public/pos/rakeen-pos.js's state.customer shape:
 * {id, name, phone, points}) -- not a new model. Only three fields are
 * ever shown/used at POS (no tier/visit-history, those are loyalty-card-
 * only per the real investigation).
 */

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  points: number;
}

export interface NewCustomerDraft {
  name: string;
  phone: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Ported rule from the PWA's renderNewCustomerStep: BOTH name and phone
 * are required to create a new customer, because complete_pos_order()
 * only finds-or-creates a real `customers` row when a phone is present
 * -- without one, it's just free text on the order and never becomes a
 * real, searchable/loyalty-eligible customer.
 */
export function validateNewCustomerDraft(draft: NewCustomerDraft): ValidationResult {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push('الاسم مطلوب');
  if (!draft.phone.trim()) errors.push('رقم الجوال مطلوب لإنشاء عميل حقيقي قابل للبحث لاحقًا');
  return { valid: errors.length === 0, errors };
}

/**
 * Guards the PostgREST `.or()` filter string built for customer search
 * (application/customerService.ts) against special filter-syntax
 * characters (`,()`) that could otherwise let a crafted search string
 * inject additional filter clauses into the `.or(...)` expression --
 * RLS already scopes every result to the cashier's own business, so the
 * real blast radius is low, but this is a real, free hygiene
 * improvement over the PWA's own unescaped version, not a behavior
 * change to the search feature itself.
 */
export function sanitizeSearchQuery(raw: string): string {
  return raw.replace(/[,()]/g, ' ').trim();
}

/** A bare digit-first string (e.g. a phone number being typed) --
 *  mirrors the PWA's own regex for deciding whether to pre-fill the
 *  "new customer" form's phone field vs. name field from whatever the
 *  cashier already typed in the search box. */
export function looksLikePhoneNumber(text: string): boolean {
  return /^[0-9+\s-]{6,}$/.test(text.trim());
}
