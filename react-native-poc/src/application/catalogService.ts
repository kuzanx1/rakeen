import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../infrastructure/supabaseClient';
import { Category, Product, isServiceBusinessType } from '../domain/catalog';

/**
 * Ported from public/pos/rakeen-pos.js's loadPosData() -- scoped to just
 * categories/products for this checkpoint (the modifier groups, box-pick
 * eligibility, stock items, delivery platform pricing, and the many
 * business-settings fields loadPosData also fetches are separate, later
 * concerns, not needed to show a real product grid). Same tables, same
 * filters, same business-type branch (menu_items vs. services), same
 * negative-id convention for services -- not a redesigned query.
 */

const CATALOG_CACHE_PREFIX = 'rakeen_pos_catalog_cache:';

export interface CatalogResult {
  categories: Category[];
  products: Product[];
  /** True when this came from the last-known-good cache because the live
   *  fetch failed -- mirrors POS_USING_OFFLINE_SNAPSHOT in rakeen-pos.js,
   *  which the current PWA uses to show a "working from saved menu"
   *  banner rather than pretending the data is fresh. */
  usingOfflineSnapshot: boolean;
}

/**
 * A small slice of what loadPosData()'s `businesses` query fetches --
 * just enough to decide menu_items vs. services for this checkpoint. The
 * many other business-settings fields that same query loads (VAT,
 * loyalty, dine-in toggles, POS display flags, etc.) are out of scope
 * here and belong to whichever later checkpoint actually needs them.
 */
export async function getBusinessType(businessId: number): Promise<string> {
  const { data } = await supabase.from('businesses').select('business_type').eq('id', businessId).single();
  return data?.business_type || 'restaurant';
}

export async function loadCatalog(businessId: number, businessType: string): Promise<CatalogResult> {
  const isService = isServiceBusinessType(businessType);

  const [catRes, itemsRes, servicesRes] = await Promise.all([
    supabase.from('menu_categories').select('*').eq('business_id', businessId).order('sort_order'),
    supabase
      .from('menu_items')
      .select('*')
      .eq('business_id', businessId)
      .eq('active', true)
      .eq('visible_pos', true)
      .order('sort_order')
      .order('id'),
    isService
      ? supabase.from('services').select('*').eq('business_id', businessId).eq('active', true).order('id')
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  // supabase-js resolves a network failure as {data:null, error} rather
  // than rejecting the promise -- checking .error explicitly is the only
  // reliable signal, exactly the gotcha rakeen-pos.js's own loadPosData
  // comment documents. Missing this check was a real bug found earlier in
  // this project (silently proceeding with an empty menu).
  if (catRes.error || itemsRes.error) {
    const cached = await readCache(businessId);
    if (!cached) {
      throw catRes.error || itemsRes.error;
    }
    return { ...cached, usingOfflineSnapshot: true };
  }

  const categories: Category[] = (catRes.data || []).map((c: any) => ({
    id: String(c.id),
    name: c.name,
    nameEn: c.name_en || c.name,
  }));

  const serviceProducts: Product[] = isService
    ? (servicesRes.data || []).map((s: any) => ({
        id: -s.id, // negative -- collision-proof with menu_items ids, see domain/catalog.ts
        categoryId: String(s.category_id),
        name: s.name,
        nameEn: null,
        price: Number(s.price),
        isService: true,
        imageUrl: null,
        durationMinutes: s.duration_minutes,
      }))
    : [];

  const menuItemProducts: Product[] = (itemsRes.data || []).map((m: any) => ({
    id: m.id,
    categoryId: String(m.category_id),
    name: m.name,
    nameEn: m.name_en || null,
    price: Number(m.price),
    isService: false,
    imageUrl: m.image_url || null,
  }));

  const result: CatalogResult = {
    categories,
    products: [...serviceProducts, ...menuItemProducts],
    usingOfflineSnapshot: false,
  };

  try {
    await AsyncStorage.setItem(CATALOG_CACHE_PREFIX + businessId, JSON.stringify(result));
  } catch {
    // Cache write failure is never fatal -- next offline boot just won't have this fallback.
  }

  return result;
}

async function readCache(businessId: number): Promise<CatalogResult | null> {
  try {
    const raw = await AsyncStorage.getItem(CATALOG_CACHE_PREFIX + businessId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
