import { supabase } from '../infrastructure/supabaseClient';
import { Customer, sanitizeSearchQuery } from '../domain/customer';

/**
 * Feature Parity Pass -- Customer Management. Real, direct Supabase
 * table queries against `customers` -- ported exactly from the PWA's
 * own real implementation, which has NO dedicated search/lookup RPC at
 * all (confirmed: grepped all 190+ migrations, none exists). RLS alone
 * scopes every result to the cashier's own business
 * (business_id = current_business_id()), same as production.
 */

const SEARCH_MIN_CHARS = 2;
const SEARCH_RESULT_LIMIT = 6;

export async function searchCustomers(businessId: number, rawQuery: string): Promise<Customer[]> {
  const query = sanitizeSearchQuery(rawQuery);
  if (query.length < SEARCH_MIN_CHARS) return [];

  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, loyalty_points')
    .eq('business_id', businessId)
    .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
    .limit(SEARCH_RESULT_LIMIT);

  if (error) throw error;
  return (data || []).map(rowToCustomer);
}

export async function findCustomerByPublicToken(businessId: number, token: string): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, loyalty_points')
    .eq('business_id', businessId)
    .eq('public_token', token)
    .maybeSingle();
  if (error || !data) return null;
  return rowToCustomer(data);
}

function rowToCustomer(row: { id: number; name: string; phone: string | null; loyalty_points: number | string | null }): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    points: Number(row.loyalty_points || 0),
  };
}
