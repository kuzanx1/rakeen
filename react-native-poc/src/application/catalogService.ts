import * as kvStorage from '../infrastructure/mmkvStorage';
import { supabase } from '../infrastructure/supabaseClient';
import { Category, Product, isServiceBusinessType } from '../domain/catalog';
import { ModifierDefinition, ModifierOptionStockMap } from '../domain/cart';
import { subscribeToPostgresChanges } from '../infrastructure/realtimeChannel';

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
  /** MODIFIER_OPTION_STOCK -- `${groupId}_${optionId}` -> its stock link.
   *  Only options with cost_mode='stock' and a stock_item_id appear. */
  optionStock: ModifierOptionStockMap;
  /** STOCK_UNIT_BY_ID -- each stock item's own tracking unit, which a
   *  recipe's unit has to be converted INTO before decrementing. */
  stockUnitById: Record<number, string>;
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

/** businesses.notify_sound_enabled -- the gate every playAlertSound()
 *  call site in rakeen-pos.js checks. Same default as the source's own
 *  `notify_sound_enabled !== false` (:5889): on unless explicitly off,
 *  and on when the row can't be read at all. Kept out of
 *  getFinancialSettings() for the same reason ReceiptBusinessProfile is:
 *  that function is deliberately scoped to Cart's totals math. */
/**
 * businesses.dine_in_pay_timing -- 'before' (pay the moment the order is
 * registered) or 'after' (register now, settle when the guest asks for the
 * bill). rakeen-pos.js:5660 declares it `let DINE_IN_PAY_TIMING = 'before'`
 * and only ever raises it to 'after' on an explicit match (:5897), so
 * anything unreadable or unset stays 'before'.
 *
 * It exists because the pay button's whole meaning depends on it -- see
 * registerMode in ProductsScreen.
 */
export async function getDineInPayTiming(businessId: number): Promise<'before' | 'after'> {
  const { data } = await supabase
    .from('businesses')
    .select('dine_in_pay_timing')
    .eq('id', businessId)
    .single();
  return data && data.dine_in_pay_timing === 'after' ? 'after' : 'before';
}

export async function getNotifySoundEnabled(businessId: number): Promise<boolean> {
  const { data } = await supabase
    .from('businesses')
    .select('notify_sound_enabled')
    .eq('id', businessId)
    .single();
  return data ? data.notify_sound_enabled !== false : true;
}

/** businesses.pos_hide_product_images, read exactly the way loadPosData()
 *  reads it (rakeen-pos.js:5833):
 *
 *    POS_HIDE_PRODUCT_IMAGES = res.data ? res.data.pos_hide_product_images !== false : true
 *
 *  Note the polarity: this defaults to HIDDEN, both for a business that
 *  never set the column and for a row that can't be read at all. The
 *  source's own reasoning, verbatim from its declaration (:5664): real
 *  photos are "the slowest thing this grid renders, and a plain icon is
 *  guaranteed to paint instantly regardless of device/network". So a tile
 *  showing a category icon rather than the uploaded photo is the correct,
 *  intended default -- not a missing-image bug. */
export async function getHideProductImages(businessId: number): Promise<boolean> {
  const { data } = await supabase
    .from('businesses')
    .select('pos_hide_product_images')
    .eq('id', businessId)
    .single();
  return data ? data.pos_hide_product_images !== false : true;
}

/** businesses.pos_hide_popular_tab (rakeen-pos.js:5830). Note the OPPOSITE
 *  polarity to getHideProductImages: `=== true`, so the tab is SHOWN unless
 *  the business explicitly hid it, and an unreadable row leaves it shown. */
export async function getHidePopularTab(businessId: number): Promise<boolean> {
  const { data } = await supabase
    .from('businesses')
    .select('pos_hide_popular_tab')
    .eq('id', businessId)
    .single();
  return data ? data.pos_hide_popular_tab === true : false;
}

/** Feature Parity Pass -- Real Receipt Rendering. The subset of
 *  loadPosData()'s businesses query needed to print a real ZATCA-QR/
 *  logo/custom-message receipt (BUSINESS_VAT_NUMBER/BUSINESS_LOGO_URL/
 *  RECEIPT_CUSTOM_MESSAGE globals in rakeen-pos.js) -- fetched
 *  separately from getFinancialSettings() rather than folded into it,
 *  since that function's own doc comment deliberately scopes it to
 *  "just the three fields Cart's totals math needs." */
export interface ReceiptBusinessProfile {
  vatNumber: string;
  logoUrl: string;
  customMessage: string;
}

/**
 * The POS feature switches the owner controls from the dashboard.
 *
 * Fetched together rather than one call each: they come from the same
 * businesses row, and the source reads them all in one query too.
 *
 * Polarities are NOT uniform and each matches the source exactly --
 * `!== false` means ON unless explicitly turned off, `=== true` means OFF
 * unless explicitly turned on. Getting one backwards silently inverts a
 * feature for every branch that never set it.
 */
export interface PosFeatureFlags {
  /** LOYALTY_ENABLED -- when off, the customer step is skipped entirely. */
  loyaltyEnabled: boolean;
  /** DINE_IN_ENABLED -- when off, بالمطعم is dropped from the channel row. */
  dineInEnabled: boolean;
  /** POS_HIDE_SEARCH -- hides the search box and the barcode field with it. */
  hideSearch: boolean;
  /** POS_HIDE_NOTIF_BELL */
  hideNotifBell: boolean;
}

export async function getPosFeatureFlags(businessId: number): Promise<PosFeatureFlags> {
  const { data } = await supabase
    .from('businesses')
    .select('loyalty_enabled, dine_in_enabled, pos_hide_search, pos_hide_notif_bell')
    .eq('id', businessId)
    .single();
  return {
    loyaltyEnabled: data ? data.loyalty_enabled !== false : true,
    dineInEnabled: data ? data.dine_in_enabled !== false : true,
    hideSearch: data ? data.pos_hide_search === true : false,
    hideNotifBell: data ? data.pos_hide_notif_bell === true : false,
  };
}

/**
 * Fires when the owner changes anything on this business's row.
 *
 * Event-driven, not polling: nothing is sent until a settings row actually
 * changes, so a till that runs all day with no dashboard edits exchanges
 * no traffic at all. It also shares the one websocket every other channel
 * in this app already uses, so it adds no connection.
 *
 * Neither the PWA nor this app had it -- settings were read once at boot,
 * so flipping a switch in the dashboard did nothing until the till was
 * restarted.
 */
/**
 * businesses.pos_require_manager_pin_for_close.
 *
 * Its own query on purpose, NOT folded into getPosFeatureFlags: this
 * column may not exist yet on a database that has not run the migration,
 * and PostgREST fails the WHOLE select when one column is unknown. Sharing
 * a query would silently reset the other four flags to their defaults.
 *
 * Defaults to REQUIRED. An unreadable answer must not be the one that
 * removes a control on the drawer.
 */
/**
 * How this shop serves dine-in, and whether it hands out call-buzzers.
 *
 * Their own query, for the same reason as the flag above: neither column
 * exists until the migration runs, and one unknown column fails the whole
 * select.
 *
 * Both defaults are the shape of a shop that has configured nothing:
 * dine-in without table management, and no buzzers. Falling back to
 * 'tables' would put a café that has no tables into a table workflow, and
 * defaulting buzzers on would ask for a number nobody has.
 */
export interface ServiceSettings {
  dineInMode: 'simple' | 'tables';
  pagerEnabled: boolean;
  /** 'brief' — items, quantities and notes only. 'copy' — a second
   *  identical print of the customer receipt. */
  kitchenTicketMode: 'brief' | 'copy';
}

export async function getServiceSettings(businessId: number): Promise<ServiceSettings> {
  try {
    const { data, error } = await supabase
      .from('businesses')
      .select('dine_in_mode, pos_pager_enabled, kitchen_ticket_mode')
      .eq('id', businessId)
      .single();
    if (error || !data) return { dineInMode: 'simple', pagerEnabled: false, kitchenTicketMode: 'brief' };
    return {
      dineInMode: data.dine_in_mode === 'tables' ? 'tables' : 'simple',
      pagerEnabled: data.pos_pager_enabled === true,
      kitchenTicketMode: data.kitchen_ticket_mode === 'copy' ? 'copy' : 'brief',
    };
  } catch {
    return { dineInMode: 'simple', pagerEnabled: false, kitchenTicketMode: 'brief' };
  }
}

/**
 * Is this buzzer number already out with another open order?
 *
 * The database has a partial unique index that makes a duplicate
 * impossible, but a rejected insert after the cashier has already handed
 * the buzzer over is a bad way to find out. This is the check that lets
 * the number be refused while it can still be swapped.
 */
export async function isPagerNumberBusy(branchId: number, pager: number): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('id')
      .eq('branch_id', branchId)
      .eq('pager_number', pager)
      .is('delivered_at', null)
      .limit(1);
    if (error) return false;
    return (data || []).length > 0;
  } catch {
    // A failed check must not block a sale. The unique index is still
    // there as the real guarantee.
    return false;
  }
}

export async function getRequireManagerPinForClose(businessId: number): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('businesses')
      .select('pos_require_manager_pin_for_close')
      .eq('id', businessId)
      .single();
    if (error || !data) return true;
    return data.pos_require_manager_pin_for_close !== false;
  } catch {
    return true;
  }
}

/**
 * businesses.receipt_theme. Its own query for the same reason as
 * getRequireManagerPinForClose: the column does not exist until the
 * migration runs, and PostgREST fails an entire select over one unknown
 * column. Falls back to 'classic'.
 */
export async function getReceiptTheme(businessId: number): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('businesses')
      .select('receipt_theme')
      .eq('id', businessId)
      .single();
    if (error || !data?.receipt_theme) return 'classic';
    return String(data.receipt_theme);
  } catch {
    return 'classic';
  }
}

export interface ReceiptBranding {
  logoUrl: string;
  tagline: string;
  showBusinessName: boolean;
  vatNumber: string;
  customMessage: string;
  locationLine: string;
  branchLabel: string;
}

const EMPTY_BRANDING: ReceiptBranding = {
  logoUrl: '', tagline: '', showBusinessName: true,
  vatNumber: '', customMessage: '', locationLine: '', branchLabel: '',
};

/**
 * ما تحتاجه ترويسة الفاتورة من إعدادات المطعم.
 *
 * استعلامان لا واحد، وكلاهما متسامح: PostgREST يُسقط الاستعلام كاملاً على
 * عمود واحد لا يعرفه، وجهازٌ على قاعدة تسبق الترحيل يجب أن يطبع فاتورة
 * أبسط، لا أن يعجز عن الطباعة.
 *
 * واسم الفرع يُرجَع فقط حين تتعدد فروع المنشأة -- العدّ هنا، لا في
 * العارض: "الفرع الأول" على منشأة بفرع واحد سطر لا يقول شيئاً.
 */
export async function getReceiptBranding(businessId: number, branchId: number | null): Promise<ReceiptBranding> {
  const out: ReceiptBranding = { ...EMPTY_BRANDING };
  try {
    const { data } = await supabase
      .from('businesses')
      .select('receipt_logo_url, receipt_tagline, receipt_show_name, vat_number, receipt_custom_message')
      .eq('id', businessId)
      .single();
    if (data) {
      out.logoUrl = (data.receipt_logo_url as string) || '';
      out.tagline = (data.receipt_tagline as string) || '';
      out.showBusinessName = data.receipt_show_name !== false;
      out.vatNumber = (data.vat_number as string) || '';
      out.customMessage = (data.receipt_custom_message as string) || '';
    }
  } catch {
    // تبقى القيم الافتراضية.
  }
  try {
    const { data } = await supabase
      .from('branches')
      .select('id, name, district, city')
      .eq('business_id', businessId);
    const rows = data ?? [];
    const mine = rows.find(b => String(b.id) === String(branchId));
    if (mine) {
      out.locationLine = [mine.district, mine.city].filter(Boolean).join('، ');
      if (rows.length > 1) out.branchLabel = (mine.name as string) || '';
    }
  } catch {
    // بلا حي ولا مدينة: الترويسة تنغلق على ما بقي.
  }
  return out;
}

export function subscribeToBusinessSettings(businessId: number, onChange: () => void): () => void {
  return subscribeToPostgresChanges(
    `pos-business-settings:${businessId}`,
    { event: 'UPDATE', schema: 'public', table: 'businesses', filter: `id=eq.${businessId}` },
    () => onChange(),
  );
}

/** DELIVERY_PLATFORMS_LIST -- the delivery apps this branch works with
 *  (Jahez, HungerStation, ...). A delivery order that does not name one
 *  cannot be split by platform in the dashboard's reports. */
export interface DeliveryPlatform {
  id: number;
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
}

export async function listDeliveryPlatforms(businessId: number): Promise<DeliveryPlatform[]> {
  const { data } = await supabase
    .from('delivery_platforms')
    .select('id, name, logo_url, brand_color')
    .eq('business_id', businessId)
    .order('id');
  return (data || []).map((p: any) => ({
    id: Number(p.id),
    name: String(p.name),
    logoUrl: p.logo_url || null,
    brandColor: p.brand_color || null,
  }));
}

export async function getReceiptBusinessProfile(businessId: number): Promise<ReceiptBusinessProfile> {
  const { data } = await supabase
    .from('businesses')
    .select('vat_number, logo_url, receipt_custom_message')
    .eq('id', businessId)
    .single();
  return {
    vatNumber: data?.vat_number || '',
    logoUrl: data?.logo_url || '',
    customMessage: data?.receipt_custom_message || '',
  };
}

export async function loadCatalog(businessId: number, businessType: string): Promise<CatalogResult> {
  const isService = isServiceBusinessType(businessType);

  const [catRes, itemsRes, servicesRes, groupRes, optRes, itemModRes, stockRes, boxEligRes] = await Promise.all([
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
    supabase.from('stock_items').select('id, unit, name').eq('business_id', businessId),
    supabase.from('menu_item_box_eligible_items').select('*'),
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
    nameEn: c.name_en || null,
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
        imageThumbUrl: null,
        durationMinutes: s.duration_minutes,
        barcode: null,
        pointsRedeemPrice: null,
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
    imageThumbUrl: m.image_thumb_url || null,
    barcode: m.barcode || null,
    pointsRedeemPrice: m.points_redeem_price != null ? Number(m.points_redeem_price) : null,
  }));

  // فئة ما بقي فيها منتج معروض ما تُعرض -- نفس قاعدة الـPWA بالحرف.
  // المنتجات مُرشَّحة في الاستعلام، فبقاء صفر منتج بعده يعني أن كل ما
  // فيها مخفي أو موقوف، والتبويب يفتح على فراغ.
  const catIdsWithProducts = new Set(
    [...serviceProducts, ...menuItemProducts].map(p => String(p.categoryId)),
  );
  const visibleCategories = categories.filter(c => catIdsWithProducts.has(String(c.id)));

  // Ported from loadPosData()'s MODIFIER_PRODUCTS construction -- same
  // group/option shape (price_delta -> price), same "no groups -> simple
  // product" fallthrough, and now the same handling of cost_mode='box'
  // items, which used to be dropped entirely (so a business selling boxes
  // simply could not see them on the till).
  const groupIdsByItem: Record<number, number[]> = {};
  (itemModRes.data || []).forEach((r: any) => {
    (groupIdsByItem[r.menu_item_id] ||= []).push(r.modifier_group_id);
  });
  const modifiersByProductId: Record<number, ModifierDefinition> = {};
  const optionStock: ModifierOptionStockMap = {};
  const stockUnitById: Record<number, string> = {};
  const stockNameById: Record<number, string> = {};
  (stockRes.data || []).forEach((row: any) => {
    stockUnitById[Number(row.id)] = String(row.unit);
    stockNameById[Number(row.id)] = String(row.name);
  });

  const boxEligibleByItem: Record<number, any[]> = {};
  (boxEligRes.data || []).forEach((r: any) => {
    (boxEligibleByItem[Number(r.menu_item_id)] ||= []).push(r);
  });
  (itemsRes.data || []).forEach((m: any) => {
    if (m.cost_mode === 'box') {
      // Eligible choices key off their OWN row id, not the stock item id:
      // a 'simple' choice tracks no inventory and has no stock_item_id at
      // all, so the row id is the only key that works for every option.
      const eligibleItems = (boxEligibleByItem[Number(m.id)] || []).map((r: any) => ({
        id: String(r.id),
        name: r.cost_mode === 'simple' ? String(r.name) : stockNameById[Number(r.stock_item_id)] || '—',
      }));
      modifiersByProductId[m.id] = {
        isBox: true,
        alwaysCustomize: true,
        slots: Number(m.total_pieces) || 0,
        items: eligibleItems,
      } as unknown as ModifierDefinition;
      return;
    }

    const groupIds = groupIdsByItem[m.id] || [];
    if (groupIds.length === 0) return;
    const groups = groupIds
      .map(gid => {
        const g = (groupRes.data || []).find((x: any) => x.id === gid);
        if (!g) return null;
        const options = (optRes.data || [])
          .filter((o: any) => o.group_id === gid)
          .map((o: any, i: number) => {
            // Only a 'stock' option actually draws from inventory; the
            // rest are price changes with no stock consequence.
            if (o.cost_mode === 'stock' && o.stock_item_id) {
              optionStock[`${gid}_${o.id}`] = {
                stockItemId: Number(o.stock_item_id),
                qty: Number(o.stock_qty),
                unit: o.stock_unit,
              };
            }
            return {
              id: String(o.id),
              name: o.name,
              price: Number(o.price_delta) || 0,
              default: i === 0 && g.type === 'single',
            };
          });
        return { id: String(g.id), name: g.name, type: g.type, required: g.type === 'single', max: g.max_select, options };
      })
      .filter(Boolean) as ModifierDefinition['groups'];
    if (groups.length > 0) {
      modifiersByProductId[m.id] = { groups, alwaysCustomize: groups.some(g => g.required) };
    }
  });

  const result: CatalogResult = {
    categories: visibleCategories,
    products: [...serviceProducts, ...menuItemProducts],
    modifiersByProductId,
    optionStock,
    stockUnitById,
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
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CatalogResult>;
    // A cache written before optionStock/stockUnitById existed has neither
    // key, and computeLineStockDecrements indexes straight into them. An
    // offline boot on a stale entry would crash the first time a modifier
    // line was priced, so they are defaulted rather than trusted -- an
    // older snapshot simply decrements nothing extra, which is exactly
    // what it recorded when it was written.
    return {
      categories: parsed.categories ?? [],
      products: parsed.products ?? [],
      modifiersByProductId: parsed.modifiersByProductId ?? {},
      optionStock: parsed.optionStock ?? {},
      stockUnitById: parsed.stockUnitById ?? {},
      usingOfflineSnapshot: false,
    };
  } catch {
    return null;
  }
}
