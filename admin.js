'use strict';
/* =====================================================================
   NOVERO – owner dashboard logic (admin.html)
   Uses the shared config/helpers/Supabase client from config.js.
   Real protection is Row Level Security in the database (is_admin);
   this page only hides screens for non-owners.
   ===================================================================== */

const DAY = 86400000;
const A = {
  user: null, profile: null,
  products: [], orders: [], customers: [],
  view: 'dashboard',
  q: '',
  pTab: 'all', pCat: 'all', oTab: 'all',
  selected: new Set(),
  editingId: null,
  confirmFn: null,
  phone: ''
};

/* ---------------------------- DATA LAYER ---------------------------- */
function seedDemoOrders() {
  // Example orders so the dashboard is not empty in test mode.
  const cat = getCatalog();
  const pick = (i, qty) => { const p = cat[i % cat.length]; return { id: p.id, name: p.name, price: p.price, qty, image_url: p.image_url }; };
  const people = [
    ['Anjali Menon', '+919847012345', 'Rose Villa, MG Road, Kochi, 682016'],
    ['Fathima Nazar', '+919995512340', '12/44 Palm Street, Kozhikode, 673001'],
    ['Meera Nair', '+919446600112', 'Sreyas, Near Temple Road, Thrissur, 680001']
  ];
  const statuses = ['pending', 'pending', 'confirmed', 'shipped', 'delivered', 'delivered', 'cancelled'];
  const orders = statuses.map((status, i) => {
    const items = [pick(i, 1 + (i % 2)), pick(i + 3, 1)];
    const subtotal = items.reduce((s, x) => s + x.price * x.qty, 0);
    const shipping = subtotal >= CONFIG.FREE_DELIVERY_ABOVE ? 0 : CONFIG.SHIPPING_FEE;
    const [name, phone, address] = people[i % people.length];
    return {
      id: 'demo-' + i, order_no: 1007 - i, user_id: 'demo-user-' + (i % people.length),
      customer_name: name, phone, address, items, subtotal, shipping, total: subtotal + shipping,
      payment_method: 'cod', status, created_at: new Date(Date.now() - (i * 1.7 + 0.2) * DAY).toISOString()
    };
  });
  store.set('novero_orders', orders);
  return orders;
}

const D = {
  async products() {
    if (TEST_MODE) return getCatalog();
    const { data, error } = await sb.from('products').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async saveProduct(fields, id) {
    if (TEST_MODE) {
      const cat = getCatalog();
      if (id) { const i = cat.findIndex((p) => p.id === id); cat[i] = { ...cat[i], ...fields }; }
      else cat.unshift({ ...fields, id: 'local-' + Date.now(), created_at: new Date().toISOString() });
      store.set('novero_catalog', cat);
      return;
    }
    const q = id ? sb.from('products').update(fields).eq('id', id) : sb.from('products').insert(fields);
    const { error } = await q;
    if (error) throw error;
  },
  async setProductStatus(ids, status) {
    if (TEST_MODE) {
      const cat = getCatalog();
      cat.forEach((p) => { if (ids.includes(p.id)) p.status = status; });
      store.set('novero_catalog', cat);
      return;
    }
    const { error } = await sb.from('products').update({ status }).in('id', ids);
    if (error) throw error;
  },
  async deleteProducts(ids) {
    if (TEST_MODE) { store.set('novero_catalog', getCatalog().filter((p) => !ids.includes(p.id))); return; }
    const { error } = await sb.from('products').delete().in('id', ids);
    if (error) throw error;
  },
  async orders() {
    if (TEST_MODE) return store.get('novero_orders', null) || seedDemoOrders();
    const { data, error } = await sb.from('orders').select('*').order('created_at', { ascending: false }).limit(1000);
    if (error) throw error;
    return (data || []).map((o) => ({ ...o, subtotal: Number(o.subtotal), shipping: Number(o.shipping), total: Number(o.total) }));
  },
  async setOrderStatus(id, status) {
    if (TEST_MODE) {
      const all = store.get('novero_orders', []);
      const o = all.find((x) => x.id === id);
      if (o) o.status = status;
      store.set('novero_orders', all);
      return;
    }
    const { error } = await sb.from('orders').update({ status }).eq('id', id);
    if (error) throw error;
  },
  async customers(orders) {
    if (!TEST_MODE) {
      const { data, error } = await sb.from('profiles').select('*').eq('is_admin', false).order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }
    // test mode: build from orders + any customer profiles saved by the shop
    const map = new Map();
    orders.forEach((o) => {
      const c = map.get(o.user_id);
      if (!c) map.set(o.user_id, { id: o.user_id, name: o.customer_name, phone: o.phone, address: o.address, created_at: o.created_at });
      else if (new Date(o.created_at) < new Date(c.created_at)) c.created_at = o.created_at;
    });
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('novero_profile_')) {
          const p = JSON.parse(localStorage.getItem(k));
          if (p && p.id && !map.has(p.id)) map.set(p.id, { ...p, created_at: new Date().toISOString() });
        }
      }
    } catch { /* ignore */ }
    return [...map.values()];
  }
};

/* ---------------------------- HELPERS ---------------------------- */
const shortId = (id) => '#' + String(id).replace(/-/g, '').slice(0, 8).toUpperCase();
const initials = (n) => (n || 'O').trim().charAt(0).toUpperCase();
const itemCount = (o) => (o.items || []).reduce((n, i) => n + Number(i.qty), 0);
const isValidPhone = (d) => /^[6-9]\d{9}$/.test(d);
const matchQ = (...fields) => !A.q || fields.some((f) => String(f ?? '').toLowerCase().includes(A.q));

function productStatus(p) {
  if (p.status === 'draft') return ['Draft', 'bg-zinc-100 text-zinc-600', 'bg-zinc-400'];
  if (p.status === 'inactive') return ['Inactive', 'bg-red-50 text-red-600', 'bg-red-500'];
  if (Number(p.stock) <= 0) return ['Out of stock', 'bg-amber-50 text-amber-700', 'bg-amber-500'];
  return ['Published', 'bg-green-50 text-green-700', 'bg-green-500'];
}
const productPill = (p) => pillHTML(...productStatus(p));

function openOverlay(id) { $('#' + id).classList.add('is-open'); }
function closeOverlay(id) { $('#' + id).classList.remove('is-open'); }

function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  try {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('Export started');
  } catch { toast('Export is not available here'); }
}

/* ---------------------------- STATS ---------------------------- */
function pctChange(cur, prev) { return prev === 0 ? (cur > 0 ? 100 : 0) : ((cur - prev) / prev) * 100; }
function deltaHTML(value, isPct = true) {
  const up = value >= 0;
  const txt = isPct ? `${up ? '+' : ''}${value.toFixed(1)}%` : `${up ? '+' : ''}${value}`;
  return `<span class="text-xs font-medium ${up ? 'text-green-600' : 'text-red-500'}">${up ? '↑' : '↓'} ${txt}</span>`;
}

function renderStats() {
  const now = Date.now();
  const within = (d, from, to) => { const age = now - new Date(d).getTime(); return age >= from * DAY && age < to * DAY; };
  const live = A.orders.filter((o) => o.status !== 'cancelled');

  const rev = (from, to) => live.filter((o) => within(o.created_at, from, to)).reduce((s, o) => s + Number(o.total), 0);
  const cnt = (list, from, to) => list.filter((x) => within(x.created_at, from, to)).length;

  const cards = [
    ['TOTAL PRODUCTS', A.products.length.toLocaleString('en-IN'), deltaHTML(cnt(A.products, 0, 7), false)],
    ['TOTAL REVENUE', money(live.reduce((s, o) => s + Number(o.total), 0)), deltaHTML(pctChange(rev(0, 7), rev(7, 14)))],
    ['TOTAL ORDERS', A.orders.length.toLocaleString('en-IN'), deltaHTML(pctChange(cnt(A.orders, 0, 7), cnt(A.orders, 7, 14)))],
    ['CUSTOMERS', A.customers.length.toLocaleString('en-IN'), deltaHTML(pctChange(cnt(A.customers, 0, 7), cnt(A.customers, 7, 14)))]
  ];
  const html = cards.map(([t, v, d]) => `
    <div class="stat-card">
      <p class="text-[11px] tracking-wide text-zinc-500 font-medium">${t}</p>
      <p class="text-2xl font-semibold mt-2 truncate">${v}</p>
      <div class="flex items-center justify-between mt-2">${d}<span class="text-[11px] text-zinc-400">Last 7 days</span></div>
    </div>`).join('');
  $$('.stats-slot').forEach((el) => { el.innerHTML = html; });
}

/* ---------------------------- DASHBOARD ---------------------------- */
function renderDashboard() {
  const recent = A.orders.slice(0, 5);
  $('#dashOrders').innerHTML = recent.length ? recent.map((o) => `
    <tr class="row" data-oid="${esc(o.id)}">
      <td class="font-medium">${esc(orderNo(o))}</td>
      <td>${esc(o.customer_name || '—')}</td>
      <td>${money(o.total)}</td>
      <td>${orderPill(o.status)}</td>
    </tr>`).join('') : '<tr><td colspan="4" class="text-center text-zinc-400 py-8">No orders yet</td></tr>';

  const low = A.products.filter((p) => p.status === 'active' && Number(p.stock) <= 5).sort((a, b) => a.stock - b.stock).slice(0, 6);
  $('#dashLow').innerHTML = low.length ? low.map((p) => `
    <button data-pid="${esc(p.id)}" class="flex items-center gap-3 w-full text-left">
      <img src="${esc(p.image_url || PLACEHOLDER_IMG)}" alt="" class="w-10 h-10 rounded-lg object-cover bg-zinc-100" />
      <span class="flex-1 min-w-0"><b class="block text-sm font-medium truncate">${esc(p.name)}</b><small class="text-zinc-500">${esc(p.category)}</small></span>
      ${Number(p.stock) <= 0 ? pillHTML('Out of stock', 'bg-amber-50 text-amber-700', 'bg-amber-500') : `<span class="text-xs font-medium text-amber-700">${p.stock} left</span>`}
    </button>`).join('') : '<p class="text-sm text-zinc-400 py-4">Everything is well stocked.</p>';
}

/* ---------------------------- PRODUCTS ---------------------------- */
function filteredProducts() {
  return A.products.filter((p) => {
    if (A.pTab !== 'all' && p.status !== A.pTab) return false;
    if (A.pCat !== 'all' && p.category !== A.pCat) return false;
    return matchQ(p.name, p.category, shortId(p.id));
  });
}

function renderProducts() {
  const cats = ['all', ...CATEGORIES.map((c) => c.name)];
  $('#pCat').innerHTML = cats.map((c) => `<option value="${esc(c)}" ${c === A.pCat ? 'selected' : ''}>${c === 'all' ? 'All categories' : esc(c)}</option>`).join('');

  const tabs = [['all', 'All'], ['active', 'Active'], ['draft', 'Drafts'], ['inactive', 'Archived']];
  $('#pTabs').innerHTML = tabs.map(([k, l]) => `<button class="tab ${A.pTab === k ? 'is-active' : ''}" data-ptab="${k}">${l}</button>`).join('');

  const list = filteredProducts();
  $('#productsBody').innerHTML = list.length ? list.map((p) => `
    <tr class="row" data-pid="${esc(p.id)}">
      <td data-nopen><input type="checkbox" data-sel="${esc(p.id)}" ${A.selected.has(p.id) ? 'checked' : ''} aria-label="Select ${esc(p.name)}" /></td>
      <td>
        <div class="flex items-center gap-3 min-w-[12rem]">
          <img src="${esc(p.image_url || PLACEHOLDER_IMG)}" alt="" class="w-10 h-10 rounded-lg object-cover bg-zinc-100 flex-none" />
          <div class="min-w-0"><p class="font-medium truncate">${esc(p.name)}</p><p class="text-xs text-zinc-500">${esc(p.category)}</p></div>
        </div>
      </td>
      <td><p class="font-medium">${esc(shortId(p.id))}</p><p class="text-xs text-zinc-500">${esc(fmtDate(p.created_at))}</p></td>
      <td>${money(p.price)}</td>
      <td class="${Number(p.stock) <= 5 ? 'text-amber-700 font-medium' : ''}">${Number(p.stock).toLocaleString('en-IN')}</td>
      <td>${productPill(p)}</td>
    </tr>`).join('')
    : '<tr><td colspan="6" class="text-center text-zinc-400 py-10">No products match. Tap “Add product” to create one.</td></tr>';

  updateBulk();
}

function updateBulk() {
  // drop selections that no longer exist
  A.selected.forEach((id) => { if (!A.products.some((p) => p.id === id)) A.selected.delete(id); });
  const n = A.selected.size;
  $('#bulkCount').textContent = n;
  $('#bulkBar').classList.toggle('is-show', n > 0 && A.view === 'products');
  const visible = filteredProducts();
  const all = $('#selAll');
  all.checked = visible.length > 0 && visible.every((p) => A.selected.has(p.id));
  all.indeterminate = !all.checked && visible.some((p) => A.selected.has(p.id));
}

function openProduct(id) {
  A.editingId = id || null;
  const p = id ? A.products.find((x) => x.id === id) : null;
  $('#pmTitle').textContent = p ? 'Edit product' : 'Add product';
  $('#pCategory').innerHTML = CATEGORIES.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
  $('#pName').value = p?.name || '';
  $('#pCategory').value = p?.category || CATEGORIES[0].name;
  $('#pStatus').value = p?.status || 'active';
  $('#pPrice').value = p ? p.price : '';
  $('#pStock').value = p ? p.stock : 1;
  $('#pImage').value = p?.image_url || '';
  $('#pDesc').value = p?.description || '';
  $('#pmDelete').classList.toggle('hidden', !p);
  openOverlay('productModal');
}

async function onProductSubmit(e) {
  e.preventDefault();
  const fields = {
    name: $('#pName').value.trim(),
    category: $('#pCategory').value,
    status: $('#pStatus').value,
    price: Number($('#pPrice').value),
    stock: Math.max(0, parseInt($('#pStock').value, 10) || 0),
    image_url: $('#pImage').value.trim() || null,
    description: $('#pDesc').value.trim() || null
  };
  if (!fields.name || Number.isNaN(fields.price)) { toast('Enter a name and price'); return; }
  try {
    await D.saveProduct(fields, A.editingId);
    closeOverlay('productModal');
    toast(A.editingId ? 'Product updated ✓' : 'Product added ✓');
    await loadAll();
  } catch (err) { toast(err.message || 'Could not save product'); }
}

function askConfirm(text, fn) {
  $('#confirmText').textContent = text;
  A.confirmFn = fn;
  openOverlay('confirmModal');
}

function deleteProducts(ids) {
  askConfirm(`Delete ${ids.length} product${ids.length > 1 ? 's' : ''}? This cannot be undone. Past orders keep their invoices.`, async () => {
    try {
      await D.deleteProducts(ids);
      ids.forEach((id) => A.selected.delete(id));
      closeOverlay('productModal');
      toast('Deleted');
      await loadAll();
    } catch (err) { toast(err.message || 'Could not delete'); }
  });
}

function exportProducts(list) {
  downloadCSV('novero-products.csv', [
    ['ID', 'Name', 'Category', 'Price', 'Stock', 'Status', 'Created'],
    ...list.map((p) => [shortId(p.id), p.name, p.category, p.price, p.stock, productStatus(p)[0], fmtDate(p.created_at)])
  ]);
}

/* ---------------------------- ORDERS ---------------------------- */
function renderOrders() {
  const counts = {};
  A.orders.forEach((o) => { counts[o.status] = (counts[o.status] || 0) + 1; });
  const tabs = [['all', 'All', A.orders.length], ...Object.entries(ORDER_STATUS).map(([k, v]) => [k, v.label, counts[k] || 0])];
  $('#oTabs').innerHTML = tabs.map(([k, l, n]) => `<button class="tab ${A.oTab === k ? 'is-active' : ''}" data-otab="${k}">${l} <span class="text-zinc-400">${n}</span></button>`).join('');

  const list = A.orders.filter((o) => (A.oTab === 'all' || o.status === A.oTab) && matchQ(orderNo(o), o.customer_name, o.phone));
  $('#ordersBody').innerHTML = list.length ? list.map((o) => `
    <tr class="row" data-oid="${esc(o.id)}">
      <td class="font-medium">${esc(orderNo(o))}</td>
      <td class="whitespace-nowrap">${esc(fmtDate(o.created_at))}</td>
      <td><p class="font-medium">${esc(o.customer_name || '—')}</p><p class="text-xs text-zinc-500">${esc(o.phone || '')}</p></td>
      <td>${itemCount(o)}</td>
      <td class="font-medium">${money(o.total)}</td>
      <td>${o.payment_method === 'cod' ? 'Cash on delivery' : esc(o.payment_method)}</td>
      <td>${orderPill(o.status)}</td>
    </tr>`).join('') : '<tr><td colspan="7" class="text-center text-zinc-400 py-10">No orders here yet</td></tr>';

  const pending = counts.pending || 0;
  const badge = $('#sideOrders');
  badge.textContent = pending;
  badge.classList.toggle('hidden', !pending);
  $('#bellDot').classList.toggle('hidden', !pending);
}

function openOrder(id) {
  const o = A.orders.find((x) => x.id === id);
  if (!o) return;
  const items = o.items || [];
  $('#orderBody').innerHTML = `
    <div class="p-5">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-xl font-semibold">Order ${esc(orderNo(o))}</h2>
          <p class="text-sm text-zinc-500 mt-0.5">${esc(fmtDate(o.created_at))} · ${itemCount(o)} item(s)</p>
        </div>
        <div class="flex items-center gap-2">${orderPill(o.status)}
          <button data-close="orderDrawer" class="w-8 h-8 rounded-full hover:bg-zinc-100" aria-label="Close">✕</button></div>
      </div>

      <div class="panel p-4 mt-5">
        <p class="text-[11px] tracking-wide text-zinc-500 font-medium">CUSTOMER</p>
        <p class="font-medium mt-1">${esc(o.customer_name || 'Customer')}</p>
        <p class="text-sm text-zinc-600">${esc(o.phone || '')}</p>
        <p class="text-[11px] tracking-wide text-zinc-500 font-medium mt-4">DELIVERY ADDRESS</p>
        <p class="text-sm mt-1 whitespace-pre-line">${esc(o.address)}</p>
      </div>

      <div class="panel mt-4 divide-y divide-zinc-100">
        ${items.map((i) => `
          <div class="flex items-center gap-3 p-3">
            <img src="${esc(i.image_url || PLACEHOLDER_IMG)}" alt="" class="w-12 h-12 rounded-lg object-cover bg-zinc-100" />
            <div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">${esc(i.name)}</p><p class="text-xs text-zinc-500">${money(i.price)} × ${i.qty}</p></div>
            <p class="text-sm font-medium">${money(i.price * i.qty)}</p>
          </div>`).join('')}
        <div class="p-3 text-sm space-y-1">
          <div class="flex justify-between"><span class="text-zinc-500">Subtotal</span><span>${money(o.subtotal)}</span></div>
          <div class="flex justify-between"><span class="text-zinc-500">Delivery</span><span>${Number(o.shipping) ? money(o.shipping) : 'Free'}</span></div>
          <div class="flex justify-between font-semibold text-base pt-1"><span>Total</span><span>${money(o.total)}</span></div>
          <p class="text-xs text-zinc-500">Payment: ${o.payment_method === 'cod' ? 'Cash on delivery' : esc(o.payment_method)}</p>
        </div>
      </div>

      <div class="mt-5">
        <label class="lbl" for="odStatus">Order status</label>
        <div class="flex gap-2">
          <select id="odStatus" class="field">
            ${Object.entries(ORDER_STATUS).map(([k, v]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${v.label}</option>`).join('')}
          </select>
          <button class="btn btn-primary" data-act="save-status" data-id="${esc(o.id)}">Update</button>
        </div>
        <p class="text-xs text-zinc-500 mt-2">If you cancel an order, add the stock back by editing the product.</p>
      </div>

      <button class="btn w-full mt-5" data-act="invoice" data-id="${esc(o.id)}">View invoice</button>
    </div>`;
  openOverlay('orderDrawer');
}

async function saveOrderStatus(id) {
  const status = $('#odStatus').value;
  try {
    await D.setOrderStatus(id, status);
    toast('Order updated ✓');
    await loadAll();
    openOrder(id);
  } catch (err) { toast(err.message || 'Could not update order'); }
}

function openInvoice(id) {
  const o = A.orders.find((x) => x.id === id);
  if (!o) return;
  const B = CONFIG.BUSINESS;
  const rows = (o.items || []).map((i, n) => `
    <tr><td>${n + 1}</td><td>${esc(i.name)}</td><td class="num">${i.qty}</td><td class="num">${money(i.price)}</td><td class="num">${money(i.price * i.qty)}</td></tr>`).join('');
  $('#invoiceSheet').innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap">
      <div>
        <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:2rem;font-weight:700;line-height:1">${esc(B.name)}</div>
        <div style="color:#666;margin-top:4px">${esc(B.tagline)}</div>
        <div style="margin-top:10px;color:#333">${esc(B.address)}<br>${esc(B.email)} · ${esc(B.phone)}${B.gstin ? `<br>GSTIN: ${esc(B.gstin)}` : ''}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:1.4rem;font-weight:700;letter-spacing:.12em">INVOICE</div>
        <div style="margin-top:6px;color:#333">Invoice no: <b>INV-${esc(o.order_no)}</b><br>Order: ${esc(orderNo(o))}<br>Date: ${esc(fmtDate(o.created_at))}</div>
      </div>
    </div>

    <div style="margin-top:22px">
      <div style="font-size:.7rem;letter-spacing:.08em;color:#666">BILL TO / SHIP TO</div>
      <div style="margin-top:4px"><b>${esc(o.customer_name || 'Customer')}</b><br>${esc(o.phone || '')}<br><span style="white-space:pre-line">${esc(o.address)}</span></div>
    </div>

    <table style="margin-top:22px">
      <thead><tr><th style="width:2rem">#</th><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="margin-left:auto;margin-top:14px;max-width:16rem">
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Subtotal</span><span>${money(o.subtotal)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Delivery</span><span>${Number(o.shipping) ? money(o.shipping) : 'Free'}</span></div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #111;margin-top:4px;font-size:1.05rem;font-weight:700"><span>Total</span><span>${money(o.total)}</span></div>
    </div>

    <div style="margin-top:20px;color:#444">
      Payment: ${o.payment_method === 'cod' ? 'Cash on delivery (pay when you receive the parcel)' : esc(o.payment_method)}
      ${o.status === 'cancelled' ? '<br><b style="color:#b91c1c">This order was cancelled.</b>' : ''}
    </div>
    <div style="margin-top:26px;padding-top:12px;border-top:1px solid #ddd;color:#777;font-size:.75rem">
      Thank you for shopping with ${esc(B.name)}. This is a computer-generated invoice.
    </div>`;
  closeOverlay('orderDrawer');
  openOverlay('invoiceModal');
}

function exportOrders() {
  downloadCSV('novero-orders.csv', [
    ['Order', 'Date', 'Customer', 'Phone', 'Items', 'Subtotal', 'Delivery', 'Total', 'Payment', 'Status'],
    ...A.orders.map((o) => [orderNo(o), fmtDate(o.created_at), o.customer_name, o.phone,
      (o.items || []).map((i) => `${i.name} x${i.qty}`).join('; '), o.subtotal, o.shipping, o.total, o.payment_method, o.status])
  ]);
}

/* ---------------------------- CUSTOMERS ---------------------------- */
function renderCustomers() {
  const list = A.customers.filter((c) => matchQ(c.name, c.phone, c.address));
  $('#customersBody').innerHTML = list.length ? list.map((c) => {
    const mine = A.orders.filter((o) => o.user_id === c.id && o.status !== 'cancelled');
    return `
      <tr>
        <td><div class="flex items-center gap-2"><span class="w-8 h-8 rounded-full bg-brand/10 text-brand text-sm font-semibold flex items-center justify-center">${esc(initials(c.name || c.phone))}</span><span class="font-medium">${esc(c.name || 'No name yet')}</span></div></td>
        <td>${esc(c.phone || '—')}</td>
        <td class="max-w-[16rem] truncate">${esc(c.address || '—')}</td>
        <td>${mine.length}</td>
        <td class="font-medium">${money(mine.reduce((s, o) => s + Number(o.total), 0))}</td>
        <td class="whitespace-nowrap">${esc(fmtDate(c.created_at))}</td>
      </tr>`;
  }).join('') : '<tr><td colspan="6" class="text-center text-zinc-400 py-10">No customers yet</td></tr>';
}

/* ---------------------------- ROUTER / RENDER ---------------------------- */
const VIEWS = ['dashboard', 'orders', 'products', 'customers'];

function renderAll() {
  renderStats(); renderDashboard(); renderOrders(); renderProducts(); renderCustomers();
}

async function loadAll() {
  try {
    A.products = await D.products();
    A.orders = await D.orders();
    A.customers = await D.customers(A.orders);
  } catch (err) {
    console.warn(err);
    toast('Could not load data: ' + (err.message || 'unknown error'));
  }
  renderAll();
}

async function go(view) {
  A.view = view;
  VIEWS.forEach((v) => $('#view-' + v).classList.toggle('hidden', v !== view));
  $$('[data-nav].side-link').forEach((b) => b.classList.toggle('is-active', b.dataset.nav === view));
  $('#sidebar').classList.remove('is-open');
  $('#sideBackdrop').classList.add('hidden');
  window.scrollTo({ top: 0 });
  updateBulk();
  await loadAll(); // always show fresh numbers
}

/* ---------------------------- AUTH ---------------------------- */
function showGate(msg = '') {
  $('#app').classList.add('hidden');
  $('#gate').classList.remove('hidden');
  $('#gStepOtp').classList.add('hidden');
  $('#gStepPhone').classList.remove('hidden');
  $('#gMsg').textContent = msg;
  $('#gOtp').value = '';
  $('#gTestHint').classList.toggle('hidden', !TEST_MODE);
  $('#gTestOtp').textContent = CONFIG.TEST_OTP;
}

async function fetchProfile(user) {
  if (TEST_MODE) return { id: user.id, name: 'Shop Owner', phone: user.phone, is_admin: true };
  const { data } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return data;
}

async function enter(user) {
  const profile = await fetchProfile(user);
  if (!profile || !profile.is_admin) {
    if (!TEST_MODE) await sb.auth.signOut();
    showGate('This account is not the shop owner. Ask the developer to mark it as admin.');
    return;
  }
  A.user = user; A.profile = profile;
  $('#gate').classList.add('hidden');
  $('#app').classList.remove('hidden');
  const name = profile.name || 'Owner';
  $('#avName').textContent = name;
  $('#avInitial').textContent = initials(name);
  await go('dashboard');
}

async function gateGetOtp() {
  const digits = $('#gPhone').value.replace(/\D/g, '');
  if (!isValidPhone(digits)) return;
  A.phone = '+91' + digits;
  $('#gMsg').textContent = '';
  const btn = $('#gGetOtp'); btn.disabled = true; btn.textContent = 'Sending…';
  try {
    if (TEST_MODE) await sleep(400);
    else { const { error } = await sb.auth.signInWithOtp({ phone: A.phone }); if (error) throw error; }
    $('#gPhoneLabel').textContent = A.phone;
    $('#gStepPhone').classList.add('hidden');
    $('#gStepOtp').classList.remove('hidden');
    $('#gOtp').focus();
  } catch (err) { $('#gMsg').textContent = err.message || 'Could not send OTP'; }
  btn.textContent = 'Get OTP'; btn.disabled = false;
}

async function gateVerify() {
  const code = $('#gOtp').value.trim();
  const btn = $('#gVerify'); btn.disabled = true; btn.textContent = 'Checking…';
  try {
    let user;
    if (TEST_MODE) {
      await sleep(300);
      if (code !== CONFIG.TEST_OTP) throw new Error('Incorrect OTP');
      user = { id: 'admin-test', phone: A.phone };
      store.set('novero_admin_session', user);
    } else {
      const { data, error } = await sb.auth.verifyOtp({ phone: A.phone, token: code, type: 'sms' });
      if (error) throw error;
      user = { id: data.user.id, phone: A.phone };
    }
    await enter(user);
  } catch (err) { $('#gMsg').textContent = err.message || 'Verification failed'; }
  btn.textContent = 'Continue'; btn.disabled = $('#gOtp').value.length !== CONFIG.OTP_LENGTH;
}

async function logout() {
  if (TEST_MODE) store.del('novero_admin_session'); else await sb.auth.signOut();
  A.user = null; A.profile = null; A.selected.clear();
  showGate();
}

/* ---------------------------- EVENTS ---------------------------- */
function bindEvents() {
  document.addEventListener('click', (e) => {
    const t = e.target;

    const close = t.closest('[data-close]');
    if (close) { closeOverlay(close.dataset.close); return; }

    const nav = t.closest('[data-nav]');
    if (nav) { go(nav.dataset.nav); return; }

    const ptab = t.closest('[data-ptab]');
    if (ptab) { A.pTab = ptab.dataset.ptab; renderProducts(); return; }
    const otab = t.closest('[data-otab]');
    if (otab) { A.oTab = otab.dataset.otab; renderOrders(); return; }

    const act = t.closest('[data-act]');
    if (act) {
      if (act.dataset.act === 'save-status') saveOrderStatus(act.dataset.id);
      if (act.dataset.act === 'invoice') openInvoice(act.dataset.id);
      return;
    }

    if (t.closest('[data-nopen]') || t.closest('[data-sel]')) return;

    const prow = t.closest('[data-pid]');
    if (prow) { openProduct(prow.dataset.pid); return; }
    const orow = t.closest('[data-oid]');
    if (orow) { openOrder(orow.dataset.oid); return; }
  });

  document.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-sel]');
    if (sel) {
      sel.checked ? A.selected.add(sel.dataset.sel) : A.selected.delete(sel.dataset.sel);
      updateBulk();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $$('.overlay.is-open').forEach((o) => o.classList.remove('is-open'));
  });

  // shell
  $('#btnMenu').addEventListener('click', () => { $('#sidebar').classList.add('is-open'); $('#sideBackdrop').classList.remove('hidden'); });
  $('#sideBackdrop').addEventListener('click', () => { $('#sidebar').classList.remove('is-open'); $('#sideBackdrop').classList.add('hidden'); });
  $('#btnLogout').addEventListener('click', logout);
  $('#btnBell').addEventListener('click', () => { A.oTab = 'pending'; go('orders'); });
  $('#globalSearch').addEventListener('input', (e) => { A.q = e.target.value.trim().toLowerCase(); renderAll(); });

  // products
  $('#btnAddProduct').addEventListener('click', () => openProduct(null));
  $('#btnExportProducts').addEventListener('click', () => exportProducts(filteredProducts()));
  $('#btnExportOrders').addEventListener('click', exportOrders);
  $('#pCat').addEventListener('change', (e) => { A.pCat = e.target.value; renderProducts(); });
  $('#selAll').addEventListener('change', (e) => {
    filteredProducts().forEach((p) => (e.target.checked ? A.selected.add(p.id) : A.selected.delete(p.id)));
    renderProducts();
  });
  $('#productForm').addEventListener('submit', onProductSubmit);
  $('#pmDelete').addEventListener('click', () => { if (A.editingId) deleteProducts([A.editingId]); });

  // bulk bar
  $('#bulkClear').addEventListener('click', () => { A.selected.clear(); renderProducts(); });
  $('#bulkExport').addEventListener('click', () => exportProducts(A.products.filter((p) => A.selected.has(p.id))));
  $('#bulkEdit').addEventListener('click', () => {
    if (A.selected.size === 1) openProduct([...A.selected][0]);
    else toast('Select one product to edit its info, or use “Set status”');
  });
  $('#bulkStatus').addEventListener('change', async (e) => {
    const status = e.target.value; e.target.value = '';
    if (!status || !A.selected.size) return;
    try { await D.setProductStatus([...A.selected], status); toast('Status updated ✓'); await loadAll(); }
    catch (err) { toast(err.message || 'Could not update'); }
  });
  $('#bulkDelete').addEventListener('click', () => deleteProducts([...A.selected]));

  // confirm
  $('#confirmOk').addEventListener('click', async () => {
    closeOverlay('confirmModal');
    const fn = A.confirmFn; A.confirmFn = null;
    if (fn) await fn();
  });

  // invoice
  $('#btnPrint').addEventListener('click', () => window.print());

  // login gate
  $('#gPhone').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    $('#gGetOtp').disabled = !isValidPhone(e.target.value);
  });
  $('#gPhone').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('#gGetOtp').disabled) gateGetOtp(); });
  $('#gGetOtp').addEventListener('click', gateGetOtp);
  $('#gOtp').maxLength = CONFIG.OTP_LENGTH;
  $('#gOtp').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, CONFIG.OTP_LENGTH);
    $('#gVerify').disabled = e.target.value.length !== CONFIG.OTP_LENGTH;
  });
  $('#gOtp').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('#gVerify').disabled) gateVerify(); });
  $('#gVerify').addEventListener('click', gateVerify);
  $('#gBack').addEventListener('click', () => showGate());
}

/* ---------------------------- INIT ---------------------------- */
async function init() {
  if (CONFIG.SHOP_URL) $('#shopLink').href = CONFIG.SHOP_URL;
  bindEvents();
  showGate();
  if (TEST_MODE) {
    const u = store.get('novero_admin_session', null);
    if (u) await enter(u);
    return;
  }
  const { data } = await sb.auth.getSession();
  const s = data?.session;
  if (s?.user) await enter({ id: s.user.id, phone: s.user.phone ? '+' + s.user.phone.replace('+', '') : '' });
}

document.addEventListener('DOMContentLoaded', init);
