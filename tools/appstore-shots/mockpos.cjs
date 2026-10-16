// Runs the REAL web cashier (localhost /pos, real rakeen-pos.js + CSS) with
// every backend call answered locally by demo data — nothing reaches
// Supabase or the app's API, no account is created, nothing is written.
// Used only to take App Store screenshots of the cashier screens.
const MEDIA = 'https://media.rakeenapp.com/menu-item-images/83/';
const now = Date.now();
// an unsigned JWT-shaped token: supabase-js only reads its exp/sub, and every
// request carrying it is answered here, so it never reaches a server
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: 'demo-user', role: 'authenticated', aud: 'authenticated', exp: Math.floor(now / 1000) + 86400, email: 'demo@example.com' }) + '.demo';
const iso = (ms) => new Date(ms).toISOString();

const CATS = [
  { id: 1, name: 'الإسبريسو الحار', name_en: 'Hot espresso', sort_order: 1 },
  { id: 2, name: 'الإسبريسو البارد', name_en: 'Iced espresso', sort_order: 2 },
  { id: 3, name: 'الحلويات', name_en: 'Desserts', sort_order: 3 },
];
const ITEMS = [
  [11, 1, 'أمريكانو', 'Americano', 12, '116-1788304230108'],
  [12, 1, 'كورتادو', 'Cortado', 14, '119-1788304286627'],
  [13, 1, 'كابتشينو', 'Cappuccino', 15, '117-1788304256173'],
  [14, 1, 'لاتيه', 'Latte', 15, '118-1788304271036'],
  [15, 1, 'فلات وايت', 'Flat White', 14, '120-1788304302245'],
  [16, 1, 'سبانيش لاتيه', 'Spanish Latte', 16, '124-1788304394541'],
  [21, 2, 'أمريكانو بارد', 'Iced Americano', 12, '125-1788304410320'],
  [22, 2, 'سبانيش لاتيه بارد', 'Iced Spanish Latte', 17, '126-1788304440738'],
  [23, 2, 'لاتيه بارد', 'Iced Latte', 16, '128-1788304474694'],
  [24, 1, 'ميكاتو', 'Macchiato', 13, '121-1788304312552'],
  [25, 1, 'موكا', 'Mocha', 16, '122-1788304342083'],
].map(([id, cat, name, en, price, img], i) => ({
  id, business_id: 999, category_id: cat, name, name_en: en, price, image_url: MEDIA + img + '.png',
  active: true, visible_pos: true, sort_order: i, barcode: null,
}));
const ALL_FEATURES = ['pos', 'zatca_invoice', 'offline', 'shift_close', 'kds', 'inventory', 'purchases_scan', 'costing_profit', 'reports', 'loyalty', 'tables_reservations', 'team_permissions', 'delivery_apps', 'online_store', 'booking_page', 'multi_branch'];
const BUSINESS = {
  id: 999, name: 'هَبيّة', business_type: 'restaurant', loyalty_enabled: true, loyalty_system_type: 'points',
  loyalty_reward_mode: 'open', loyalty_reward_label: 'قهوة مجانية', dine_in_enabled: true, vat_number: '300000000000003',
  vat_rate: 0.15, prices_include_vat: true, vat_registered: true, logo_url: 'https://media.rakeenapp.com/business-branding/83/logo-1788071810272.png',
  kitchen_display_enabled: true, tables_reservations_enabled: true, dine_in_mode: 'tables', pos_hide_product_images: false,
  pos_hide_popular_tab: false, pos_hide_search: false, pos_hide_notif_bell: false, receipt_theme: 'classic',
  pos_require_manager_pin_for_close: false, kitchen_ticket_mode: 'brief', allowed_features: ALL_FEATURES, plan_tier: 'sarh',
  online_subscribed: true, notify_sound_enabled: false, geidea_connected: false, shift_report_options: {},
};
const TSTAT = ['serving', 'available', 'awaiting_payment', 'available', 'serving', 'awaiting_order', 'available', 'cleaning', 'available', 'serving', 'available', 'awaiting_payment'];
const TABLES = TSTAT.map((st, i) => ({ id: 301 + i, branch_id: 99, number: i + 1, seats: i % 3 === 0 ? 6 : 4, section_id: null, status: st, status_changed_at: iso(now - (6 + i * 4) * 60000), active_order_id: st === 'serving' || st === 'awaiting_payment' ? 8000 + i : null }));
const CUSTOMERS = [
  { id: 501, business_id: 999, name: 'عبدالله القحطاني', phone: '0551234567', loyalty_points: 420, loyalty_tier: 'Gold', loyalty_visits: 18, total_saved: 120 },
  { id: 502, business_id: 999, name: 'سارة العتيبي', phone: '0569876543', loyalty_points: 180, loyalty_tier: 'Silver', loyalty_visits: 9, total_saved: 45 },
];
const ONLINE_ORDER = {
  id: 7101, order_number: 1043, business_id: 999, branch_id: 99, source: 'online', status: 'pending', channel: 'pickup',
  order_type: 'delivery', customer_name: 'خالد', customer_phone: '0550000000', total: 45, subtotal: 39.13, vat_amount: 5.87,
  payment_method: 'card', payment_status: 'paid', created_at: iso(now - 40000), notes: null,
  order_items: [
    { id: 1, name: 'سبانيش لاتيه', quantity: 2, price: 16, unit_price: 16, menu_item_id: 16 },
    { id: 2, name: 'كورتادو', quantity: 1, price: 13, unit_price: 13, menu_item_id: 12 },
  ],
};
const SHIFT = { id: 1, branch_id: 99, business_id: 999, status: 'open', opened_at: iso(now - 2 * 3600e3), opening_cash: 300, opened_by_name: 'محمد', staff_member_id: 1 };

const MODE = { online: false };
function rowsFor(table, url) {
  const q = decodeURIComponent(url);
  switch (table) {
    case 'profiles': return [{ id: 'demo-user', business_id: 999, branch_id: 99, full_name: 'كاشير', user_type: 'employee' }];
    case 'businesses': return [BUSINESS];
    case 'branches': return [{ id: 99, business_id: 999, name: 'الفرع الرئيسي', district: 'النخيل', city: 'جدة', receipt_label: '' }];
    case 'menu_categories': return CATS;
    case 'menu_items': return ITEMS;
    case 'staff_members': return [{ id: 1, name: 'محمد', is_reservation_host: false }, { id: 2, name: 'سارة', is_reservation_host: false }];
    case 'shifts': return [SHIFT];
    case 'restaurant_tables': return TABLES;
    case 'customers': return CUSTOMERS;
    case 'orders':
      if (MODE.online && (q.includes('status=eq.pending') || q.includes('id=eq.7101'))) return [ONLINE_ORDER];
      return [];
    case 'order_items':
      if (q.includes('order_id=eq.7101')) return ONLINE_ORDER.order_items.map((it) => ({ ...it, qty: it.quantity, order_id: 7101, line_total: it.price * it.quantity, selected_modifiers: [] }));
      return [];
    default: return [];
  }
}

async function installMocks(page) {
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    // the app's own API: answer locally, never call the real routes
    if (url.startsWith('http://localhost:3000/api/pos/login')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: { access_token: JWT, refresh_token: 'demo' }, userId: 'demo-user' }) });
    if (url.startsWith('http://localhost:3000/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const m = url.match(/supabase\.co\/(rest|auth|realtime|storage|functions)\/v1\/([^?]*)/);
    if (!m) return route.continue();
    const [, kind, rest] = m;
    if (kind === 'auth') {
      const user = { id: 'demo-user', email: 'demo@example.com', aud: 'authenticated', role: 'authenticated' };
      if (rest.startsWith('user')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: JWT, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(now / 1000) + 86400, refresh_token: 'demo', user }) });
    }
    if (kind !== 'rest') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (rest.startsWith('rpc/')) {
      const fn = rest.slice(4);
      if (fn === 'get_trial_status') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ subscribed: true, used: 0, limit: 350, remaining: 350, locked: false, now: iso(now) }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    }
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    const table = rest.split('/')[0];
    const rows = rowsFor(table, url);
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}`, 'access-control-allow-origin': '*' },
      body: JSON.stringify(single ? rows[0] || null : rows),
    });
  });
}

// Provisioned device, then the real PIN screen and staff picker.
async function signIn(page) {
  await page.goto('http://localhost:3000/pos', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('rakeen_pos_device', JSON.stringify({ businessId: 999, businessName: 'هَبيّة', branchId: 99, branchName: 'الفرع الرئيسي' }));
    localStorage.removeItem('rakeen_pos_staff');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loginPinPad button', { timeout: 30000 });
  for (const d of ['1', '2', '3', '4']) await page.locator('#loginPinPad button', { hasText: d }).first().click();
  await page.waitForSelector('#posStaffList button, #posStaffList .staff-pick-btn, #staffSkipBtn', { timeout: 30000 });
  await page.locator('#posStaffList button').first().click();
}

module.exports = { installMocks, signIn, MODE };
