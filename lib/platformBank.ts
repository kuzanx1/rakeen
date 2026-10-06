import type { SupabaseClient } from "@supabase/supabase-js";
import { BankDetails, RAKEEN_PARTY, RakeenParty, validateBank } from "@/lib/contracts";

// Rakeen's bank account for subscription payments, editable from /admin
// (platform_settings, key "bank"). Service-role client only. Falls back to
// the built-in RAKEEN_PARTY values when nothing valid is stored.
export async function getBank(admin: SupabaseClient): Promise<BankDetails> {
  const { data } = await admin.from("platform_settings").select("value").eq("key", "bank").maybeSingle();
  const { bank } = validateBank((data?.value as Record<string, unknown>) || {});
  return bank || { bankName: RAKEEN_PARTY.bankName, iban: RAKEEN_PARTY.iban, accountHolder: RAKEEN_PARTY.accountHolder };
}

// Rakeen's party block as it goes into a contract (and its signed snapshot).
export async function getRakeenParty(admin: SupabaseClient): Promise<RakeenParty> {
  return { ...RAKEEN_PARTY, ...(await getBank(admin)) };
}
