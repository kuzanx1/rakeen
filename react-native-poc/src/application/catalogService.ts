import * as kvStorage from '../infrastructure/mmkvStorage';
import { supabase } from '../infrastructure/supabaseClient';
import { Category, Product, isServiceBusinessType } from '../domain/catalog';
import { ModifierDefinition } from '../domain/cart';

/**
 * Ported from public/pos/rakeen-pos.js's loadPosData() -- scoped to
 * categories/products/standard modifier groups for this checkpoint (box-
 * pick eligibility/stock items/delivery platform pricing/the many
 * business-settings fields loadPosData also fetches are separate, later
 * concerns). Same tables, same filters, same business-type branch
 * (menu_items vs. services), same negative-id convention for services,
 * same price_delta modifier math -- not a redesigned query.
 */

const CATALOG_CACHE_PREFIX = 'rakeen_pos_catalog_cache:';

export interface CatalogResult {
  categories: Category[];
  products: Product[];
  /** Keyed by product id (menu_items only -- services never have modifier
   *  groups in the current schema). "box" cost_mode items are excluded
   *  here on purpose -- see domain/cart.ts's file header for why. */
  modifiersByProductId: Record<number, ModifierDefinition>;
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

/** Just the three fields Cart's totals math needs -- same defaults as
 *  loadPosData() uses for each (vat_registered/prices_include_vat default
 *  true, vat_rate defaults to 0.15) when the business row doesn't specify
 *  them. The many other settings that same query loads belong to later
 *  checkpoints. */
export interface FinancialSettings {
  vatRegistered: boolean;
  vatRate: number;
  pricesIncludeVat: boolean;
}

export async function getFinancialSettings(businessId: number): Promise<FinancialSettings> {
  const { data } = await supabase
    .from('businesses')
    .select('vat_registered, vat_rate, prices_include_vat')
    .eq('id', businessId)
    .single();
  return {
    vatRegistered: data ? data.vat_registered !== false : true,
    vatRate: data && data.vat_rate != null ? Number(data.vat_rate) : 0.15,
    pricesIncludeVat: data ? data.prices_include_vat !== false : true,
  };
}

export async function loadCatalog(businessId: number, businessType: string): Promise<CatalogResult> {
  const isService = isServiceBusinessType(businessType);

  const [catRes, itemsRes, servicesRes, groupRes, optRes, itemModRes] = await Promise.all([
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
    supabase.from('modifier_groups').select('*').eq('business_id', businessId).order('id'),
    supabase.from('modifier_options').select('*'),
    supabase.from('menu_item_modifier_groups').select('*'),
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

  // Ported from loadPosData()'s MODIFIER_PRODUCTS construction -- same
  // group/option shape (price_delta -> price), same exclusion of
  // cost_mode='box' items (a materially different, larger feature, see
  // domain/cart.ts), same "no groups -> simple product" fallthrough.
  const groupIdsByItem: Record<number, number[]> = {};
  (itemModRes.data || []).forEach((r: any) => {
    (groupIdsByItem[r.menu_item_id] ||= []).push(r.modifier_group_id);
  });
  const modifiersByProductId: Record<number, ModifierDefinition> = {};
  (itemsRes.data || []).forEach((m: any) => {
    if (m.cost_mode === 'box') return; // deferred -- see domain/cart.ts
    const groupIds = groupIdsByItem[m.id] || [];
    if (groupIds.length === 0) return;
    const groups = groupIds
      .map(gid => {
        const g = (groupRes.data || []).find((x: any) => x.id === gid);
        if (!g) return null;
        const options = (optRes.data || [])
          .filter((o: any) => o.group_id === gid)
          .map((o: any, i: number) => ({
            id: String(o.id),
            name: o.name,
            price: Number(o.price_delta) || 0,
            default: i === 0 && g.type === 'single',
          }));
        return { id: String(g.id), name: g.name, type: g.type, required: g.type === 'single', max: g.max_select, options };
      })
      .filter(Boolean) as ModifierDefinition['groups'];
    if (groups.length > 0) {
      modifiersByProductId[m.id] = { groups, alwaysCustomize: groups.some(g => g.required) };
    }
  });

  const result: CatalogResult = {
    categories,
    products: [...serviceProducts, ...menuItemProducts],
    modifiersByProductId,
    usingOfflineSnapshot: false,
  };

  try {
    await kvStorage.setItem(CATALOG_CACHE_PREFIX + businessId, JSON.stringify(result));
  } catch {
    // Cache write failure is never fatal -- next offline boot just won't have this fallback.
  }

  return result;
}

async function readCache(businessId: number): Promise<CatalogResult | null> {
  try {
    const raw = await kvStorage.getItem(CATALOG_CACHE_PREFIX + businessId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
