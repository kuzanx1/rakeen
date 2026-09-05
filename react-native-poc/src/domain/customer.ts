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
  /** مكافآت مجانية جاهزة للصرف -- customers.loyalty_free_rewards. */
  freeRewards: number;
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
/**
 * Arabic-Indic digits typed on an Arabic keyboard are still digits to the
 * cashier but not to `/^05\d{8}$/`. The source normalises them before it
 * validates (toWesternDigits, rakeen-pos.js:1189); without this a
 * perfectly correct number typed in Arabic is rejected as malformed.
 */
export function toWesternDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0));
}

/** Exactly what the source's own field accepts: 05 followed by 8 digits. */
export const SAUDI_MOBILE_RE = /^05\d{8}$/;

/** Strips everything that is not a digit and caps at 10, the way the
 *  source's input handler rewrites the field on every keystroke.
 *
 *  For the INPUT only. The validator deliberately does NOT truncate:
 *  trimming an over-long number down to a valid-looking one would save a
 *  DIFFERENT phone than the cashier typed, and that number is the identity
 *  the customer is found by on every later visit. The field caps as you
 *  type, so the two never disagree in practice -- this just makes sure a
 *  value arriving any other way is rejected rather than quietly altered. */
export function normalisePhoneInput(raw: string): string {
  return toWesternDigits(raw).replace(/\D/g, '').slice(0, 10);
}

export function validateNewCustomerDraft(draft: NewCustomerDraft): ValidationResult {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push('الاسم مطلوب');
  // Both fields are required, and the phone must be a real one. The
  // source's reason is a hard constraint, not a preference:
  // complete_pos_order() only creates a customers row when a phone is
  // present (find-or-create by phone). Without one the "customer" is just
  // free text on the order -- never a loyalty member, never searchable on
  // the next visit, and never visible in the dashboard's customer list.
  //
  // The format check is the fix for a reported bug: the field had no cap
  // or format test at all, so a customer was saved with an 11-digit
  // number. This app had inherited only the non-empty half of that.
  const phone = toWesternDigits(draft.phone).replace(/\D/g, '');
  if (!phone) errors.push('رقم الجوال مطلوب لإنشاء عميل حقيقي قابل للبحث لاحقًا');
  else if (!SAUDI_MOBILE_RE.test(phone)) errors.push('رقم الجوال لازم يبدأ بـ 05 ويكون 10 أرقام');
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
