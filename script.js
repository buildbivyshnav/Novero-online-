'use strict';
/* =====================================================================
   NOVERO – storefront logic (shop only; the owner uses admin.html)
   Shared config/helpers/Supabase client live in config.js.
   ===================================================================== */

const HERO_SLIDES = [
  { img: 'https://picsum.photos/seed/nv-hero1/1400/800', title: 'Welcome to Novero', sub: 'Your little corner of sparkle and self-love.' },
  { img: 'https://picsum.photos/seed/nv-hero2/1400/800', title: 'Gifts that say it all', sub: 'Customised hampers & boutique photo frames.' },
  { img: 'https://picsum.photos/seed/nv-hero3/1400/800', title: 'Hand-crafted jewellery', sub: 'Small details, made to be treasured.' }
];

/* ---------------------------- STATE ---------------------------- */
const state = {
  user: null,            // { id, phone }
  profile: null,         // row from profiles
  products: [],
  wishlist: new Set(),   // product ids
  cart: store.get('novero_cart', []),  // [{ id, qty }]
  category: 'All',
  view: 'home',
  orders: [],            // this customer's orders
  phone: '',             // full +91 number being verified
  afterLogin: null,      // view to open after login
  editMode: 'profile'
};

/* ---------------------------- VIEW ROUTER ---------------------------- */
const VIEWS = ['home', 'shop', 'collections', 'wishlist', 'account', 'orders'];

function showView(name) {
  if (['account', 'wishlist', 'orders'].includes(name) && !state.user) {
    state.afterLogin = name;
    openOverlay('authModal');
    return;
  }
  state.view = name;
  VIEWS.forEach((v) => $('#view-' + v).classList.toggle('hidden', v !== name));
  $$('[data-nav]').forEach((b) => b.classList.toggle('is-active', b.dataset.nav === name));

  if (name === 'shop') renderShop();
  if (name === 'collections') renderCollections();
  if (name === 'wishlist') renderWishlist();
  if (name === 'orders') renderOrders();
  if (name === 'account') renderAccount();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* ---------------------------- OVERLAYS ---------------------------- */
function openOverlay(id) {
  const el = $('#' + id);
  el.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  if (id === 'authModal') resetAuth();
  if (id === 'searchOverlay') setTimeout(() => $('#searchInput').focus(), 250);
  if (id === 'cartDrawer') renderCart();
}
function closeOverlay(id) {
  $('#' + id).classList.remove('is-open');
  if (!$$('.overlay.is-open').length) document.body.style.overflow = '';
}
const OVERLAY_IDS = { auth: 'authModal', search: 'searchOverlay', cart: 'cartDrawer', edit: 'editModal' };

/* ---------------------------- PRODUCTS ---------------------------- */
async function loadProducts() {
  if (TEST_MODE) {
    state.products = getCatalog();
  } else {
    const { data, error } = await sb.from('products').select('*').order('created_at', { ascending: false });
    if (error) {
      console.warn('Could not load products:', error.message);
      toast('Could not load products');
      state.products = [];
    } else {
      state.products = data || [];
    }
  }
  // shoppers only ever see active products (the database enforces this too)
  state.products = state.products.filter((p) => (p.status || 'active') === 'active');
}

const heartSVG = () =>
  '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.6 8.3 3.3 5 6.6 5c2 0 3.5 1.1 5.4 3.2C13.9 6.1 15.4 5 17.4 5c3.3 0 5 3.3 3.9 6.3-1.8 4.6-9.3 9.2-9.3 9.2Z" stroke-linejoin="round"/></svg>';

const isSoldOut = (p) => p.stock !== undefined && p.stock !== null && Number(p.stock) <= 0;

function productCard(p) {
  const wished = state.wishlist.has(p.id);
  return `
    <article class="product-card">
      <div class="relative aspect-square overflow-hidden bg-blush/30">
        <img src="${esc(p.image_url || PLACEHOLDER_IMG)}" alt="${esc(p.name)}" loading="lazy" class="w-full h-full object-cover" />
        <button class="wish-btn ${wished ? 'is-wished' : ''}" data-wish="${esc(p.id)}" aria-pressed="${wished}" aria-label="Toggle wishlist">${heartSVG()}</button>
      </div>
      <div class="p-3">
        <h3 class="font-serif text-lg font-semibold leading-tight line-clamp-2">${esc(p.name)}</h3>
        <p class="text-sm text-mute mt-1">${money(p.price)}</p>
        ${isSoldOut(p)
          ? '<button disabled class="mt-3 w-full border border-black/10 rounded-lg py-2 text-[11px] tracking-[0.2em] text-mute cursor-not-allowed">SOLD OUT</button>'
          : `<button data-add="${esc(p.id)}" class="mt-3 w-full border border-ink/70 rounded-lg py-2 text-[11px] tracking-[0.2em] hover:bg-ink hover:text-cream transition">ADD TO CART</button>`}
      </div>
    </article>`;
}

const emptyState = (msg) => `<p class="col-span-full text-center text-mute py-10">${esc(msg)}</p>`;

/* ---------------------------- RENDER: HOME ---------------------------- */
function renderCategories() {
  $('#categoryGrid').innerHTML = CATEGORIES.map((c) => `
    <button class="cat-card" data-cat="${esc(c.name)}">
      <div class="cat-img"><img src="${esc(c.img)}" alt="${esc(c.name)}" loading="lazy" /></div>
      <span>${esc(c.name)}</span>
    </button>`).join('');
}

function renderHome() {
  const latest = state.products.slice(0, 8);
  $('#arrivalsGrid').innerHTML = latest.length ? latest.map(productCard).join('') : emptyState('New products are coming soon ✨');
}

/* ---------------------------- RENDER: SHOP ---------------------------- */
function renderShop() {
  const names = ['All', ...CATEGORIES.map((c) => c.name)];
  $('#chipRow').innerHTML = names.map((n) =>
    `<button class="chip ${n === state.category ? 'is-active' : ''}" data-chip="${esc(n)}">${esc(n)}</button>`).join('');
  const list = state.category === 'All' ? state.products : state.products.filter((p) => p.category === state.category);
  $('#shopGrid').innerHTML = list.length ? list.map(productCard).join('') : emptyState('No products in this category yet.');
}

/* ---------------------------- RENDER: COLLECTIONS ---------------------------- */
function renderCollections() {
  const html = CATEGORIES.map((c) => {
    const items = state.products.filter((p) => p.category === c.name);
    if (!items.length) return '';
    return `
      <div>
        <div class="flex items-end justify-between mb-3">
          <h3 class="font-serif text-3xl font-semibold">${esc(c.name)}</h3>
          <button data-cat="${esc(c.name)}" class="text-xs tracking-[0.2em] underline underline-offset-4">SEE ALL</button>
        </div>
        <div class="flex gap-4 overflow-x-auto no-scrollbar pb-2 snap-x">
          ${items.map((p) => `<div class="w-44 md:w-56 flex-none snap-start">${productCard(p)}</div>`).join('')}
        </div>
      </div>`;
  }).join('');
  $('#collectionsWrap').innerHTML = html || emptyState('Collections are coming soon ✨');
}

/* ---------------------------- RENDER: WISHLIST ---------------------------- */
function renderWishlist() {
  const list = state.products.filter((p) => state.wishlist.has(p.id));
  $('#wishlistGrid').innerHTML = list.length ? list.map(productCard).join('') : emptyState('Tap the ♡ on any product to save it here.');
}

/* Re-render whichever product grids are visible (after wishlist change etc.) */
function refreshGrids() {
  renderHome();
  if (state.view === 'shop') renderShop();
  if (state.view === 'collections') renderCollections();
  if (state.view === 'wishlist') renderWishlist();
}

/* ---------------------------- HERO CAROUSEL ---------------------------- */
let heroIndex = 0, heroTimer;
function initHero() {
  $('#heroTrack').innerHTML = HERO_SLIDES.map((s, i) => `
    <div class="hero-slide">
      <img src="${esc(s.img)}" alt="${esc(s.title)}" ${i ? 'loading="lazy"' : ''} />
      <div class="hero-text">
        <h1 class="font-serif text-4xl md:text-6xl font-semibold">${esc(s.title)}</h1>
        <p class="mt-2 md:text-lg">${esc(s.sub)}</p>
        <button data-view="shop" class="mt-5 inline-block bg-cream text-ink px-7 py-3 text-xs tracking-[0.25em] rounded-sm">SHOP NOW</button>
      </div>
    </div>`).join('');
  $('#heroDots').innerHTML = HERO_SLIDES.map((_, i) => `<button class="hero-dot" data-dot="${i}" aria-label="Go to slide ${i + 1}"></button>`).join('');
  goHero(0);
  startHero();

  $('#heroPrev').addEventListener('click', () => { goHero(heroIndex - 1); startHero(); });
  $('#heroNext').addEventListener('click', () => { goHero(heroIndex + 1); startHero(); });
  $('#heroDots').addEventListener('click', (e) => {
    const d = e.target.closest('[data-dot]');
    if (d) { goHero(+d.dataset.dot); startHero(); }
  });

  // swipe support
  let x0 = null;
  const hero = $('#hero');
  hero.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  hero.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) { goHero(heroIndex + (dx < 0 ? 1 : -1)); startHero(); }
    x0 = null;
  });
}
function goHero(i) {
  heroIndex = (i + HERO_SLIDES.length) % HERO_SLIDES.length;
  $('#heroTrack').style.transform = `translateX(-${heroIndex * 100}%)`;
  $$('.hero-dot').forEach((d, n) => d.classList.toggle('is-active', n === heroIndex));
}
function startHero() { clearInterval(heroTimer); heroTimer = setInterval(() => goHero(heroIndex + 1), 5500); }

/* ---------------------------- AUTH: UI ---------------------------- */
let resendTimer;

function buildOtpBoxes() {
  $('#otpBoxes').innerHTML = Array.from({ length: CONFIG.OTP_LENGTH }, (_, i) =>
    `<input class="otp-box" inputmode="numeric" maxlength="1" pattern="[0-9]*" aria-label="OTP digit ${i + 1}" ${i === 0 ? 'autocomplete="one-time-code"' : ''} />`).join('');

  const boxes = $$('.otp-box');
  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '').slice(-1);
      box.classList.remove('is-error');
      $('#otpError').textContent = '';
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
      updateContinue();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) { boxes[i - 1].focus(); boxes[i - 1].value = ''; updateContinue(); }
      if (e.key === 'Enter') $('#btnContinue').click();
    });
    box.addEventListener('paste', (e) => {
      const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, boxes.length);
      if (!text) return;
      e.preventDefault();
      [...text].forEach((ch, n) => { boxes[n].value = ch; });
      boxes[Math.min(text.length, boxes.length - 1)].focus();
      updateContinue();
    });
  });
}

const getOtp = () => $$('.otp-box').map((b) => b.value).join('');
function updateContinue() { $('#btnContinue').disabled = getOtp().length !== CONFIG.OTP_LENGTH; }

function updateGetOtp() {
  const digits = $('#phoneInput').value.replace(/\D/g, '');
  $('#btnGetOtp').disabled = !(isValidPhone(digits) && $('#termsCheck').checked);
}
const isValidPhone = (d) => /^[6-9]\d{9}$/.test(d); // Indian mobile numbers

function goStep(step) {
  const phone = $('#stepPhone'), otp = $('#stepOtp');
  const [from, to] = step === 'otp' ? [phone, otp] : [otp, phone];
  from.classList.remove('is-active');
  to.classList.add('is-active');
  if (step === 'otp') setTimeout(() => $('.otp-box')?.focus(), 350);
  else setTimeout(() => $('#phoneInput').focus(), 350);
}

function resetAuth() {
  $('#stepOtp').classList.remove('is-active');
  $('#stepPhone').classList.add('is-active');
  $('#phoneError').textContent = '';
  $('#otpError').textContent = '';
  buildOtpBoxes();
  updateGetOtp();
  updateContinue();
  clearInterval(resendTimer);
  $('#testHint').classList.toggle('hidden', !TEST_MODE);
  $('#testOtpValue').textContent = CONFIG.TEST_OTP;
}

function startResendTimer() {
  let left = CONFIG.RESEND_SECONDS;
  const btn = $('#btnResend'), label = $('#resendTimer');
  btn.disabled = true;
  label.textContent = `in ${left}s`;
  clearInterval(resendTimer);
  resendTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) { clearInterval(resendTimer); btn.disabled = false; label.textContent = ''; }
    else label.textContent = `in ${left}s`;
  }, 1000);
}

function setLoading(btn, loading, text) {
  if (loading) { btn.dataset.label = btn.textContent; btn.textContent = text || 'PLEASE WAIT…'; btn.disabled = true; }
  else { btn.textContent = btn.dataset.label || btn.textContent; }
}

/* ---------------------------- AUTH: ACTIONS ---------------------------- */
async function sendOtp() {
  const digits = $('#phoneInput').value.replace(/\D/g, '');
  if (!isValidPhone(digits)) { $('#phoneError').textContent = 'Enter a valid 10-digit mobile number'; return false; }
  const phone = '+91' + digits;
  const btn = $('#btnGetOtp');
  setLoading(btn, true, 'SENDING…');

  try {
    if (TEST_MODE) {
      await sleep(500);
    } else {
      const { error } = await sb.auth.signInWithOtp({ phone });
      if (error) throw error;
    }
    state.phone = phone;
    return true;
  } catch (err) {
    $('#phoneError').textContent = err.message || 'Could not send OTP';
    return false;
  } finally {
    setLoading(btn, false);
    updateGetOtp();
  }
}

async function onGetOtp() {
  if (!(await sendOtp())) return;
  $('#otpPhoneLabel').textContent = state.phone.replace('+91', '+91 ');
  $$('.otp-box').forEach((b) => { b.value = ''; });
  updateContinue();
  goStep('otp');
  startResendTimer();
  toast(TEST_MODE ? `Test mode: OTP is ${CONFIG.TEST_OTP}` : 'OTP sent to your number');
}

async function onResend() {
  if (await sendOtp()) {
    $$('.otp-box').forEach((b) => { b.value = ''; });
    $('.otp-box')?.focus();
    updateContinue();
    startResendTimer();
    toast('OTP resent');
  }
}

async function onVerify() {
  const code = getOtp();
  if (code.length !== CONFIG.OTP_LENGTH) return;
  const btn = $('#btnContinue');
  setLoading(btn, true, 'VERIFYING…');

  try {
    let user;
    if (TEST_MODE) {
      await sleep(400);
      if (code !== CONFIG.TEST_OTP) throw new Error('Incorrect OTP');
      user = { id: 'test-' + state.phone.replace('+', ''), phone: state.phone };
      store.set('novero_test_user', user);
    } else {
      const { data, error } = await sb.auth.verifyOtp({ phone: state.phone, token: code, type: 'sms' });
      if (error) throw error;
      user = { id: data.user.id, phone: data.user.phone ? '+' + data.user.phone.replace('+', '') : state.phone };
    }
    await setUser(user);
    closeOverlay('authModal');
    toast('Welcome to Novero 💛');
    showView(state.afterLogin || 'account');
    state.afterLogin = null;
  } catch (err) {
    $('#otpError').textContent = err.message || 'Verification failed';
    $$('.otp-box').forEach((b) => b.classList.add('is-error'));
    setTimeout(() => $$('.otp-box').forEach((b) => b.classList.remove('is-error')), 400);
  } finally {
    setLoading(btn, false);
    updateContinue();
  }
}

async function logout() {
  if (TEST_MODE) store.del('novero_test_user');
  else await sb.auth.signOut();
  state.user = null; state.profile = null; state.wishlist = new Set(); state.orders = [];
  updateUserUI();
  refreshGrids();
  showView('home');
  toast('Logged out');
}

/* ---------------------------- SESSION / PROFILE / WISHLIST ---------------------------- */
async function setUser(user) {
  if (state.user && state.user.id === user.id && state.profile) return; // already loaded
  state.user = user;
  await Promise.all([loadProfile(), loadWishlist(), loadOrders()]);
  updateUserUI();
  refreshGrids();
}

async function loadProfile() {
  const u = state.user;
  if (TEST_MODE) {
    state.profile = store.get('novero_profile_' + u.id, { id: u.id, phone: u.phone, name: '', address: '', is_admin: false });
    return;
  }
  let { data, error } = await sb.from('profiles').select('*').eq('id', u.id).maybeSingle();
  if (error) { console.warn(error.message); }
  if (!data) {
    const ins = await sb.from('profiles').insert({ id: u.id, phone: u.phone }).select().maybeSingle();
    data = ins.data || { id: u.id, phone: u.phone, name: '', address: '', is_admin: false };
  }
  state.profile = data;
}

async function saveProfile(fields) {
  const u = state.user;
  if (TEST_MODE) {
    state.profile = { ...state.profile, ...fields };
    store.set('novero_profile_' + u.id, state.profile);
    return;
  }
  const { data, error } = await sb.from('profiles').update(fields).eq('id', u.id).select().single();
  if (error) throw error;
  state.profile = data;
}

async function loadWishlist() {
  const u = state.user;
  if (TEST_MODE) { state.wishlist = new Set(store.get('novero_wishlist_' + u.id, [])); return; }
  const { data, error } = await sb.from('wishlist').select('product_id').eq('user_id', u.id);
  if (error) console.warn(error.message);
  state.wishlist = new Set((data || []).map((r) => r.product_id));
}

async function toggleWishlist(productId) {
  if (!state.user) { state.afterLogin = null; toast('Please log in to save items'); openOverlay('authModal'); return; }
  const had = state.wishlist.has(productId);
  // optimistic UI
  had ? state.wishlist.delete(productId) : state.wishlist.add(productId);
  refreshGrids();

  try {
    if (TEST_MODE) {
      store.set('novero_wishlist_' + state.user.id, [...state.wishlist]);
    } else if (had) {
      const { error } = await sb.from('wishlist').delete().eq('user_id', state.user.id).eq('product_id', productId);
      if (error) throw error;
    } else {
      const { error } = await sb.from('wishlist').insert({ user_id: state.user.id, product_id: productId });
      if (error) throw error;
    }
    toast(had ? 'Removed from wishlist' : 'Added to wishlist ♡');
  } catch (err) {
    // roll back
    had ? state.wishlist.add(productId) : state.wishlist.delete(productId);
    refreshGrids();
    toast('Could not update wishlist');
    console.warn(err.message);
  }
}

/* ---------------------------- USER UI ---------------------------- */
function updateUserUI() {
  $('#userDot').classList.toggle('hidden', !state.user);
}

function renderAccount() {
  const p = state.profile || {};
  $('#acctGreeting').textContent = p.name ? `Hello, ${p.name.split(' ')[0]}` : 'Hello there';
  $('#acctPhone').textContent = state.user?.phone || '';
  renderRecentOrder();
}

function openEdit(mode) {
  state.editMode = mode;
  const p = state.profile || {};
  $('#editTitle').textContent = mode === 'address' ? 'Saved address' : 'Profile details';
  $('#grpProfile').classList.toggle('hidden', mode !== 'profile');
  $('#grpAddress').classList.toggle('hidden', mode !== 'address');
  $('#editName').value = p.name || '';
  $('#editPhone').value = p.phone || state.user?.phone || '';
  $('#editAddress').value = p.address || '';
  openOverlay('editModal');
}

async function onEditSubmit(e) {
  e.preventDefault();
  const fields = state.editMode === 'address'
    ? { address: $('#editAddress').value.trim() }
    : { name: $('#editName').value.trim() };
  try {
    await saveProfile(fields);
    closeOverlay('editModal');
    renderAccount();
    toast('Saved ✓');
  } catch (err) {
    toast(err.message || 'Could not save');
  }
}

function onAccountRow(action) {
  switch (action) {
    case 'orders':    showView('orders'); break;
    case 'addresses': openEdit('address'); break;
    case 'wishlist':  showView('wishlist'); break;
    case 'profile':   openEdit('profile'); break;
    case 'logout':    logout(); break;
  }
}

/* ---------------------------- ORDERS ---------------------------- */
async function loadOrders() {
  const u = state.user;
  if (!u) { state.orders = []; return; }
  if (TEST_MODE) {
    state.orders = store.get('novero_orders', []).filter((o) => o.user_id === u.id).sort((a, b) => b.order_no - a.order_no);
    return;
  }
  const { data, error } = await sb.from('orders').select('*').eq('user_id', u.id).order('created_at', { ascending: false });
  if (error) console.warn(error.message);
  state.orders = data || [];
}

async function placeOrder() {
  if (!state.user) { closeOverlay('cartDrawer'); state.afterLogin = null; openOverlay('authModal'); toast('Please log in to place your order'); return; }
  const lines = state.cart.map((l) => ({ ...l, p: state.products.find((p) => p.id === l.id) })).filter((l) => l.p);
  if (!lines.length) return;
  if (!(state.profile?.name || '').trim()) {
    closeOverlay('cartDrawer');
    openEdit('profile');
    toast('Add your name for the invoice, then tap Place order again');
    return;
  }
  if (!(state.profile?.address || '').trim()) {
    closeOverlay('cartDrawer');
    openEdit('address');
    toast('Add your delivery address, then tap Place order again');
    return;
  }

  const btn = $('#btnCheckout');
  setLoading(btn, true, 'PLACING ORDER…');
  try {
    const name = state.profile.name || '';
    const phone = state.profile.phone || state.user.phone || '';
    if (TEST_MODE) {
      await sleep(500);
      const catalog = getCatalog();
      const items = lines.map((l) => {
        const c = catalog.find((x) => x.id === l.id);
        if (!c || c.stock < l.qty) throw new Error(`Only ${c ? c.stock : 0} left of ${l.p.name}`);
        c.stock -= l.qty;
        return { id: c.id, name: c.name, price: c.price, qty: l.qty, image_url: c.image_url };
      });
      const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
      const shipping = subtotal >= CONFIG.FREE_DELIVERY_ABOVE ? 0 : CONFIG.SHIPPING_FEE;
      const all = store.get('novero_orders', []);
      const order_no = all.reduce((m, o) => Math.max(m, o.order_no), 1000) + 1;
      all.unshift({
        id: 'o-' + Date.now(), order_no, user_id: state.user.id, customer_name: name, phone,
        address: state.profile.address, items, subtotal, shipping, total: subtotal + shipping,
        payment_method: 'cod', status: 'pending', created_at: new Date().toISOString()
      });
      store.set('novero_orders', all);
      store.set('novero_catalog', catalog);
    } else {
      const { error } = await sb.rpc('place_order', {
        p_items: lines.map((l) => ({ id: l.id, qty: l.qty })),
        p_name: name, p_phone: phone, p_address: state.profile.address, p_payment: 'cod'
      });
      if (error) throw error;
    }
    state.cart = []; saveCart(); updateCartBadges();
    await Promise.all([loadProducts(), loadOrders()]);
    refreshGrids();
    closeOverlay('cartDrawer');
    showView('orders');
    toast('Order placed – thank you! 💛');
  } catch (err) {
    toast(err.message || 'Could not place order');
  } finally {
    setLoading(btn, false);
    renderCart();
  }
}

function orderCardHTML(o) {
  const items = (o.items || []);
  return `
    <article class="bg-white rounded-2xl p-4 shadow-soft">
      <div class="flex items-center justify-between gap-2">
        <div>
          <p class="font-serif text-xl font-semibold">Order ${esc(orderNo(o))}</p>
          <p class="text-xs text-mute">${esc(fmtDate(o.created_at))} · ${items.reduce((n, i) => n + i.qty, 0)} item(s)</p>
        </div>
        ${orderPill(o.status)}
      </div>
      <div class="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
        ${items.map((i) => `<img src="${esc(i.image_url || PLACEHOLDER_IMG)}" alt="${esc(i.name)}" title="${esc(i.name)}" class="w-14 h-14 rounded-lg object-cover flex-none" />`).join('')}
      </div>
      <p class="text-sm text-mute mt-3 truncate">${esc(items.map((i) => `${i.name} ×${i.qty}`).join(', '))}</p>
      <div class="flex justify-between text-sm mt-2"><span class="text-mute">Total (cash on delivery)</span><b>${money(o.total)}</b></div>
    </article>`;
}

function renderOrders() {
  $('#ordersList').innerHTML = state.orders.length
    ? state.orders.map(orderCardHTML).join('')
    : '<p class="text-center text-mute py-10">No orders yet. Your orders will appear here.</p>';
}

function renderRecentOrder() {
  const o = state.orders[0];
  const badge = $('#recentBadge'), text = $('#recentText'), btn = $('#recentBtn');
  if (!o) {
    badge.className = 'text-[11px] tracking-widest px-3 py-1 rounded-full bg-blush/60';
    badge.textContent = 'NONE YET';
    text.textContent = "You haven't placed an order yet. Your latest order status will show up here.";
    btn.dataset.view = 'shop'; btn.textContent = 'START SHOPPING';
    return;
  }
  const s = ORDER_STATUS[o.status] || ORDER_STATUS.pending;
  badge.className = `text-[11px] tracking-widest px-3 py-1 rounded-full ${s.cls}`;
  badge.textContent = s.label.toUpperCase();
  text.textContent = `${orderNo(o)} · ${fmtDate(o.created_at)} · ${money(o.total)}`;
  btn.dataset.view = 'orders'; btn.textContent = 'VIEW ORDERS';
}

/* ---------------------------- CART ---------------------------- */
const saveCart = () => store.set('novero_cart', state.cart);
const cartCount = () => state.cart.reduce((n, i) => n + i.qty, 0);

function addToCart(id) {
  const p = state.products.find((x) => x.id === id);
  const line = state.cart.find((i) => i.id === id);
  const have = line ? line.qty : 0;
  if (p && p.stock !== undefined && p.stock !== null && have + 1 > Number(p.stock)) { toast(`Only ${p.stock} in stock`); return; }
  line ? line.qty++ : state.cart.push({ id, qty: 1 });
  saveCart(); updateCartBadges();
  toast('Added to cart');
}
function changeQty(id, delta) {
  const line = state.cart.find((i) => i.id === id);
  if (!line) return;
  line.qty += delta;
  if (line.qty <= 0) state.cart = state.cart.filter((i) => i.id !== id);
  saveCart(); updateCartBadges(); renderCart();
}
function updateCartBadges() {
  const n = cartCount();
  $$('.cart-badge').forEach((b) => { b.textContent = n; b.classList.toggle('hidden', n === 0); });
}
function renderCart() {
  // drop items whose product no longer exists
  const lines = state.cart
    .map((l) => ({ ...l, p: state.products.find((p) => p.id === l.id) }))
    .filter((l) => l.p);
  const total = lines.reduce((s, l) => s + l.p.price * l.qty, 0);

  $('#cartItems').innerHTML = lines.length ? lines.map((l) => `
    <div class="flex gap-3 bg-white rounded-xl p-2 shadow-soft">
      <img src="${esc(l.p.image_url || PLACEHOLDER_IMG)}" alt="" class="w-20 h-20 rounded-lg object-cover" />
      <div class="flex-1 min-w-0">
        <p class="font-serif text-lg font-semibold leading-tight truncate">${esc(l.p.name)}</p>
        <p class="text-sm text-mute">${money(l.p.price)}</p>
        <div class="flex items-center gap-3 mt-2">
          <button data-qty="-1" data-id="${esc(l.id)}" class="w-7 h-7 rounded-full border border-black/20" aria-label="Decrease">−</button>
          <span class="text-sm w-4 text-center">${l.qty}</span>
          <button data-qty="1" data-id="${esc(l.id)}" class="w-7 h-7 rounded-full border border-black/20" aria-label="Increase">+</button>
        </div>
      </div>
      <button data-qty="-999" data-id="${esc(l.id)}" class="text-mute px-2 self-start" aria-label="Remove">✕</button>
    </div>`).join('')
    : '<p class="text-center text-mute pt-16">Your cart is empty.</p>';

  $('#cartTotal').textContent = money(total);
  const gap = CONFIG.FREE_DELIVERY_ABOVE - total;
  $('#shipNote').textContent = !lines.length ? '' : gap > 0
    ? `Delivery ${money(CONFIG.SHIPPING_FEE)} · add ${money(gap)} more for free delivery`
    : '🎉 You get free delivery!';
  $('#btnCheckout').disabled = !lines.length;
}

/* ---------------------------- SEARCH ---------------------------- */
function renderSearch(q) {
  const term = q.trim().toLowerCase();
  const box = $('#searchResults');
  if (!term) { box.innerHTML = '<p class="text-mute text-sm">Start typing to search products…</p>'; return; }
  const hits = state.products.filter((p) =>
    [p.name, p.category, p.description].some((f) => (f || '').toLowerCase().includes(term))).slice(0, 20);
  box.innerHTML = hits.length ? hits.map((p) => `
    <div class="flex items-center gap-3 bg-white rounded-xl p-2">
      <img src="${esc(p.image_url || PLACEHOLDER_IMG)}" alt="" class="w-14 h-14 rounded-lg object-cover" />
      <div class="flex-1 min-w-0">
        <p class="font-serif text-lg font-semibold truncate">${esc(p.name)}</p>
        <p class="text-xs text-mute">${esc(p.category)} · ${money(p.price)}</p>
      </div>
      <button data-add="${esc(p.id)}" class="text-[11px] tracking-[0.15em] border border-ink/70 rounded-md px-3 py-2">ADD</button>
    </div>`).join('') : '<p class="text-mute text-sm">No matches found.</p>';
}

/* ---------------------------- GLOBAL EVENTS ---------------------------- */
function bindEvents() {
  // delegated clicks
  document.addEventListener('click', (e) => {
    const t = e.target;

    const closeBtn = t.closest('[data-close]');
    if (closeBtn) { closeOverlay(OVERLAY_IDS[closeBtn.dataset.close]); return; }

    const openBtn = t.closest('[data-open]');
    if (openBtn) {
      const map = { search: 'searchOverlay', cart: 'cartDrawer' };
      openOverlay(map[openBtn.dataset.open]);
      return;
    }

    const viewBtn = t.closest('[data-view]');
    if (viewBtn) { $$('.overlay.is-open').forEach((o) => closeOverlay(o.id)); showView(viewBtn.dataset.view); return; }

    const catBtn = t.closest('[data-cat]');
    if (catBtn) { state.category = catBtn.dataset.cat; showView('shop'); return; }

    const chip = t.closest('[data-chip]');
    if (chip) { state.category = chip.dataset.chip; renderShop(); return; }

    const wish = t.closest('[data-wish]');
    if (wish) { toggleWishlist(wish.dataset.wish); return; }

    const add = t.closest('[data-add]');
    if (add) { addToCart(add.dataset.add); return; }

    const qty = t.closest('[data-qty]');
    if (qty) { changeQty(qty.dataset.id, +qty.dataset.qty); return; }

    const row = t.closest('[data-acct]');
    if (row) { onAccountRow(row.dataset.acct); return; }
  });

  // Esc closes the top overlay
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $$('.overlay.is-open').forEach((o) => closeOverlay(o.id));
  });

  // header user icon: login modal or account
  $('#btnUser').addEventListener('click', () => {
    if (state.user) showView('account');
    else { state.afterLogin = 'account'; openOverlay('authModal'); }
  });

  // auth
  $('#phoneInput').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    $('#phoneError').textContent = '';
    updateGetOtp();
  });
  $('#phoneInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('#btnGetOtp').disabled) onGetOtp(); });
  $('#termsCheck').addEventListener('change', updateGetOtp);
  $('#btnGetOtp').addEventListener('click', onGetOtp);
  $('#btnContinue').addEventListener('click', onVerify);
  $('#btnResend').addEventListener('click', onResend);
  $('#btnBackPhone').addEventListener('click', () => { clearInterval(resendTimer); goStep('phone'); });

  // forms
  $('#editForm').addEventListener('submit', onEditSubmit);

  // search + checkout
  $('#searchInput').addEventListener('input', (e) => renderSearch(e.target.value));
  $('#btnCheckout').addEventListener('click', placeOrder);
}

/* ---------------------------- INIT ---------------------------- */
async function restoreSession() {
  if (TEST_MODE) {
    const u = store.get('novero_test_user', null);
    if (u) await setUser(u);
    return;
  }
  const { data } = await sb.auth.getSession();
  const s = data?.session;
  if (s?.user) await setUser({ id: s.user.id, phone: s.user.phone ? '+' + s.user.phone.replace('+', '') : '' });

  // keep UI in sync with sign-in/out in other tabs / token expiry
  sb.auth.onAuthStateChange((event, session) => {
    // don't await supabase calls inside this callback – defer instead
    setTimeout(async () => {
      if (event === 'SIGNED_OUT' && state.user) {
        state.user = null; state.profile = null; state.wishlist = new Set(); state.orders = [];
        updateUserUI(); refreshGrids();
        if (['account', 'wishlist'].includes(state.view)) showView('home');
      } else if (event === 'SIGNED_IN' && session?.user) {
        await setUser({ id: session.user.id, phone: session.user.phone ? '+' + session.user.phone.replace('+', '') : '' });
      }
    }, 0);
  });
}

async function init() {
  $('#year').textContent = new Date().getFullYear();
  bindEvents();
  initHero();
  renderCategories();
  updateCartBadges();
  updateUserUI();
  renderSearch('');

  await loadProducts();
  await restoreSession();
  renderHome();
  showView('home');

  if (TEST_MODE) console.info('Novero: running in TEST MODE (add Supabase keys in config.js). OTP =', CONFIG.TEST_OTP);
}

document.addEventListener('DOMContentLoaded', init);
