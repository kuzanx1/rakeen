// /admin «إيقاف المطعم بالكامل» sets businesses.is_active=false, and
// current_business_id() then returns null, so RLS hides even the owner's own
// profile row. To a client that looks like "the account failed to load".
// Only the server can tell the two apart, so it says so here, in one wording,
// for the web cashier and the app alike. The iOS app replaces the text with
// one that does not mention payment (App Store 3.1.1).
export const ACCOUNT_SUSPENDED_CODE = "account_suspended";
export const ACCOUNT_SUSPENDED_MESSAGE =
  "حسابك موقوف مؤقتاً: توقف الكاشير بسبب اشتراك غير مسدد. تواصل مع دعم ركين عشان يرجع.";

// Wakes every open cashier of this business so it re-asks the server at once.
// A broadcast and not postgres_changes: once suspended, RLS hides the row from
// the very devices that need to hear about it. It carries nothing; the answer
// always comes from /api/pos/account-status, so a forged message can only
// cause a harmless re-check.
export async function notifyAccountStatusChanged(url: string, serviceKey: string, businessId: number): Promise<void> {
  await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ topic: `account-status:${businessId}`, event: "changed", payload: {} }] }),
  }).catch(() => undefined);
}
