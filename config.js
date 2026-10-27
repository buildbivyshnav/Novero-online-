'use strict';
/* =====================================================================
   NOVERO – shared config + helpers.
   Loaded by BOTH index.html (shop) and admin.html (owner dashboard).
   Fill in the two Supabase values once, here.
   ===================================================================== */

const CONFIG = {
  SUPABASE_URL: 'YOUR_SUPABASE_URL',           // e.g. https://abcd1234.supabase.co
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',  // Project Settings > API > anon public key
  OTP_LENGTH: 4,         // must match Supabase: Auth > Providers > Phone > OTP length
  TEST_OTP: '1234',      // only used in TEST MODE (no Supabase keys)
  FREE_DELIVERY_ABOVE: 2000,
  SHIPPING_FEE: 80,      // charged below the free-delivery amount (keep in sync with schema.sql)
  RESEND_SECONDS: 30,
  SHOP_URL: '',          // admin site only: full address of the customer shop, e.g. https://yourname.github.io/novero/
  BUSINESS: {            // printed on invoices
    name: 'Novero',
    tagline: 'Gift hampers · Photo frames · Jewellery',
    address: 'Kerala, India',
    email: 'hello@novero.in',
    phone: '+91 70129 79248',
    gstin: ''            // optional, e.g. 32ABCDE1234F1Z5
  }
};

const CATEGORIES = [
  { name: 'Neckchains',   img: 'https://picsum.photos/seed/nv-cat-neck/300/300' },
  { name: 'Rings',        img: 'https://picsum.photos/seed/nv-cat-ring/300/300' },
  { name: 'Bangles',      img: 'https://picsum.photos/seed/nv-cat-bangle/300/300' },
  { name: 'Bracelets',    img: 'https://picsum.photos/seed/nv-cat-brace/300/300' },
  { name: 'Nose Rings',   img: 'https://picsum.photos/seed/nv-cat-nose/300/300' },
  { name: 'Gift Hampers', img: 'https://picsum.photos/seed/nv-cat-hamper/300/300' }
];

const SAMPLE_PRODUCTS = [
  ['Golden Leaf Neckchain', 'Neckchains', 799, 'Delicate gold-tone leaf pendant chain.', 24],
  ['Pearl Drop Neckchain', 'Neckchains', 999, 'Hand-strung pearl drop necklace.', 12],
  ['Twisted Stack Ring', 'Rings', 499, 'Adjustable stackable ring.', 40],
  ['Blush Stone Ring', 'Rings', 649, 'Rose quartz style statement ring.', 3],
  ['Classic Kada Bangle', 'Bangles', 899, 'Hand-crafted bangle, set of 2.', 18],
  ['Charm Bracelet', 'Bracelets', 699, 'Dainty bracelet with tiny charms.', 0],
  ['Tiny Stud Nose Ring', 'Nose Rings', 299, 'Minimal sparkle nose pin.', 60],
  ['Celebration Gift Hamper', 'Gift Hampers', 2499, 'Curated hamper with a photo frame, candle and sweets.', 9]
].map((r, i) => ({
  id: 's' + (i + 1), name: r[0], category: r[1], price: r[2], description: r[3], stock: r[4], status: 'active',
  image_url: 'https://picsum.photos/seed/nv-p' + (i + 1) + '/500/500',
  created_at: new Date(Date.now() - i * 2 * 86400000).toISOString()
}));

/* ---------------------------- HELPERS ---------------------------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ } },
  del(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } }
};

const PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="100%" height="100%" fill="#ecd3cb"/><text x="50%" y="50%" fill="#b08d57" font-family="Georgia" font-size="28" text-anchor="middle" dominant-baseline="middle">Novero</text></svg>'
);
document.addEventListener('error', (e) => {
  const el = e.target;
  if (el && el.tagName === 'IMG' && !el.dataset.fallback) { el.dataset.fallback = '1'; el.src = PLACEHOLDER_IMG; }
}, true);

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-show'), 2600);
}

/* ---------------------------- SUPABASE ---------------------------- */
const IS_CONFIGURED = !CONFIG.SUPABASE_URL.startsWith('YOUR_') && !CONFIG.SUPABASE_ANON_KEY.startsWith('YOUR_');
const sb = IS_CONFIGURED && window.supabase
  ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY)
  : null;
const TEST_MODE = !sb;

/* Test-mode catalogue (shared by shop + dashboard through localStorage) */
function getCatalog() {
  let c = store.get('novero_catalog', null);
  if (!Array.isArray(c)) { c = SAMPLE_PRODUCTS.map((p) => ({ ...p })); store.set('novero_catalog', c); }
  return c;
}

/* Order status labels + colours (shared) */
const ORDER_STATUS = {
  pending:   { label: 'Pending',   cls: 'bg-amber-50 text-amber-700',   dot: 'bg-amber-500' },
  confirmed: { label: 'Confirmed', cls: 'bg-blue-50 text-blue-700',     dot: 'bg-blue-500' },
  shipped:   { label: 'Shipped',   cls: 'bg-indigo-50 text-indigo-700', dot: 'bg-indigo-500' },
  delivered: { label: 'Delivered', cls: 'bg-green-50 text-green-700',   dot: 'bg-green-500' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-50 text-red-600',       dot: 'bg-red-500' }
};
const orderNo = (o) => 'NV-' + o.order_no;
const pillHTML = (text, cls, dot) =>
  `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${cls}"><i class="w-1.5 h-1.5 rounded-full ${dot}"></i>${esc(text)}</span>`;
const orderPill = (status) => { const s = ORDER_STATUS[status] || ORDER_STATUS.pending; return pillHTML(s.label, s.cls, s.dot); };
