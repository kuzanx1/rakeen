import { supabase } from '../infrastructure/supabaseClient';
import { Customer, LoyaltySettings, LoyaltySystemType, sanitizeSearchQuery } from '../domain/customer';

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
    .select('id, name, phone, loyalty_points, loyalty_visits, loyalty_units, loyalty_free_rewards')
    .eq('business_id', businessId)
    .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
    .limit(SEARCH_RESULT_LIMIT);

  if (error) throw error;
  return (data || []).map(rowToCustomer);
}

/**
 * البحثُ برقمٍ كامل -- للكاشير الذي تخطّى خطوة العميل ثم أراد الباركود.
 *
 * وليست searchCustomers: تلك تُرجع ستّةً بالتشابه، وهذا يريد واحداً
 * بعينه أو لا شيء. (نظيرها في الويب: نداءُ customers.eq('phone') داخل
 * showOnDisplayBtn.)
 */
export async function findCustomerByPhone(businessId: number, rawPhone: string): Promise<Customer | null> {
  const phone = sanitizeSearchQuery(rawPhone);
  if (!phone) return null;
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, loyalty_points, loyalty_visits, loyalty_units, loyalty_free_rewards')
    .eq('business_id', businessId)
    .eq('phone', phone)
    .maybeSingle();
  if (error || !data) return null;
  return rowToCustomer(data);
}

export async function findCustomerByPublicToken(businessId: number, token: string): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, loyalty_points, loyalty_visits, loyalty_units, loyalty_free_rewards')
    .eq('business_id', businessId)
    .eq('public_token', token)
    .maybeSingle();
  if (error || !data) return null;
  return rowToCustomer(data);
}

function rowToCustomer(row: {
  id: number; name: string; phone: string | null;
  loyalty_points: number | string | null;
  loyalty_visits?: number | string | null;
  loyalty_units?: number | string | null;
  loyalty_free_rewards?: number | string | null;
}): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    points: Number(row.loyalty_points || 0),
    visits: Number(row.loyalty_visits || 0),
    units: Number(row.loyalty_units || 0),
    // المكافآت الجاهزة تُجلب مع الزبون لا في نداءٍ ثانٍ: الكاشير
    // يعرفها لحظة اختياره، فلا يمرّ عليها بلا أن يراها.
    freeRewards: Number(row.loyalty_free_rewards || 0),
  };
}


/**
 * إعدادات ولاء المنشأة: أي نظام، وما عتبته.
 *
 * تُقرأ عند فتح شاشة الكاشير لا عند كل عميل -- صاحب المطعم يبدّل
 * نظامه مرّةً في العمر، لا مرّةً في الدقيقة.
 */
export async function getLoyaltySettings(businessId: number): Promise<LoyaltySettings> {
  const { data, error } = await supabase
    .from('businesses')
    .select('loyalty_system_type, loyalty_visits_threshold, loyalty_unit_threshold')
    .eq('id', businessId)
    .maybeSingle();
  if (error || !data) return { systemType: 'points', threshold: 0 };
  const sys = (data.loyalty_system_type as LoyaltySystemType) || 'points';
  const threshold = sys === 'visits'
    ? Number(data.loyalty_visits_threshold || 0)
    : sys === 'products'
      ? Number(data.loyalty_unit_threshold || 0)
      : 0;
  return { systemType: sys, threshold };
}
