const customerToken = () => localStorage.getItem('customer_token');
const customerUser = () => { try { return JSON.parse(localStorage.getItem('customer_user') || 'null'); } catch { return null; } };
const money = value => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
const safe = value => String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const customerTranslations = {
  id: {
    home: 'Beranda', search: 'Cari', login: 'Masuk', register: 'Daftar', favorites: 'Favorit', cart: 'Keranjang', logout: 'Keluar', back: 'Kembali ke beranda', order: 'Pesan', empty: 'Belum ada data.', rate: 'Beri rating', review: 'Tulis ulasan', send: 'Kirim rating',
    login_required: 'Silakan login terlebih dahulu untuk memberi rating atau menambah favorit.',
    search_eyebrow: 'Koleksi kami', search_title: 'Cari produk', search_desc: 'Temukan rangkaian berdasarkan nama, kategori, atau deskripsi.', search_placeholder: 'Cari buket, flower box...', search_btn: 'Cari', search_empty: 'Produk tidak ditemukan.', search_count: 'produk ditemukan',
    fav_eyebrow: 'Koleksi pribadi', fav_title: 'Favorit Anda', fav_desc: 'Rangkaian yang ingin Anda simpan untuk nanti.', fav_empty: 'Belum ada produk favorit.',
    cart_eyebrow: 'Pesanan Anda', cart_title: 'Keranjang', cart_desc: 'Atur jumlah rangkaian sebelum melanjutkan pemesanan.', cart_empty: 'Keranjang masih kosong.', cart_total: 'Total', cart_note: 'Pilih produk pada landing page untuk mengisi detail pengiriman dan mengirim pesanan.',
    login_eyebrow: 'Mahira Flowers', login_title: 'Masuk ke akun', login_desc: 'Simpan favorit dan kelola keranjang Anda.', login_email: 'Email', login_password: 'Password', login_btn: 'Masuk', login_no_account: 'Belum punya akun?', login_register_link: 'Daftar sekarang', login_checking: 'Memeriksa akun...',
    reg_eyebrow: 'Mulai perjalanan Anda', reg_title: 'Buat akun', reg_desc: 'Gunakan akun Anda untuk menyimpan favorit dan keranjang.', reg_name: 'Nama lengkap', reg_email: 'Email', reg_password: 'Password', reg_btn: 'Daftar', reg_have_account: 'Sudah punya akun?', reg_login_link: 'Masuk',
    category_eyebrow: 'Koleksi Mahira', category_title: 'Kategori', category_desc: 'Produk pilihan berdasarkan kategori dari katalog kami.', category_empty: 'Belum ada produk dalam kategori ini.'
  },
  en: {
    home: 'Home', search: 'Search', login: 'Login', register: 'Register', favorites: 'Favorites', cart: 'Cart', logout: 'Logout', back: 'Back to home', order: 'Order', empty: 'No data yet.', rate: 'Rate this product', review: 'Write a review', send: 'Submit rating',
    login_required: 'Please log in first to rate or favorite a product.',
    search_eyebrow: 'Our collection', search_title: 'Search products', search_desc: 'Find arrangements by name, category, or description.', search_placeholder: 'Search bouquets, flower box...', search_btn: 'Search', search_empty: 'No products found.', search_count: 'products found',
    fav_eyebrow: 'Personal collection', fav_title: 'Your favorites', fav_desc: 'Arrangements you want to save for later.', fav_empty: 'No favorite products yet.',
    cart_eyebrow: 'Your order', cart_title: 'Cart', cart_desc: 'Adjust quantities before continuing with your order.', cart_empty: 'Your cart is still empty.', cart_total: 'Total', cart_note: 'Pick products from the landing page to fill in delivery details and send an order.',
    login_eyebrow: 'Mahira Flowers', login_title: 'Sign in to your account', login_desc: 'Save favorites and manage your cart.', login_email: 'Email', login_password: 'Password', login_btn: 'Login', login_no_account: "Don't have an account?", login_register_link: 'Register now', login_checking: 'Checking your account...',
    reg_eyebrow: 'Start your journey', reg_title: 'Create an account', reg_desc: 'Use your account to save favorites and cart items.', reg_name: 'Full name', reg_email: 'Email', reg_password: 'Password', reg_btn: 'Register', reg_have_account: 'Already have an account?', reg_login_link: 'Login',
    category_eyebrow: "Mahira's collection", category_title: 'Category', category_desc: 'Curated products from this category in our catalog.', category_empty: 'No products in this category yet.'
  }
};
const GUEST_CART_KEY = 'mahira_guest_cart';
const getGuestCart = () => { try { return JSON.parse(localStorage.getItem(GUEST_CART_KEY) || '[]'); } catch { return []; } };
const saveGuestCart = items => localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
function addToGuestCart(item) {
  const items = getGuestCart();
  const existing = items.find(i => String(i.product_id) === String(item.product_id));
  if (existing) existing.quantity += item.quantity || 1;
  else items.push({ product_id: item.product_id, name: item.name, price: item.price, image_url: item.image_url || '', quantity: item.quantity || 1 });
  saveGuestCart(items);
  return items;
}
function updateGuestCartQty(productId, qty) {
  let items = getGuestCart();
  if (qty <= 0) items = items.filter(i => String(i.product_id) !== String(productId));
  else items = items.map(i => String(i.product_id) === String(productId) ? { ...i, quantity: qty } : i);
  saveGuestCart(items);
  return items;
}
const removeFromGuestCart = productId => saveGuestCart(getGuestCart().filter(i => String(i.product_id) !== String(productId)));
async function mergeGuestCartIntoServer() {
  const items = getGuestCart();
  if (!items.length) return;
  for (const item of items) {
    try { await customerFetch('/api/cart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: item.product_id, quantity: item.quantity }) }); } catch (e) { /* produk mungkin sudah tidak tersedia, lewati */ }
  }
  localStorage.removeItem(GUEST_CART_KEY);
}
const customerLang = () => localStorage.getItem('mahira-lang') || 'id';
function setCustomerLanguage(lang) {
  localStorage.setItem('mahira-lang', lang);
  document.documentElement.lang = lang;
  const dict = customerTranslations[lang] || customerTranslations.id;
  document.querySelectorAll('[data-customer-text]').forEach(el => { const key = el.dataset.customerText; if (dict[key]) el.textContent = dict[key]; });
  document.querySelectorAll('[data-i18n]').forEach(el => { const key = el.dataset.i18n; if (dict[key]) el.textContent = dict[key]; });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { const key = el.dataset.i18nPlaceholder; if (dict[key]) el.setAttribute('placeholder', dict[key]); });
  document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.lang === lang));
  document.dispatchEvent(new CustomEvent('mahira-lang-changed', { detail: { lang } }));
}
function customerLanguageSwitch() { const header = document.querySelector('.customer-header'); if (!header || header.querySelector('.customer-language')) return; const switcher = document.createElement('div'); switcher.className = 'customer-language'; switcher.innerHTML = '<button type="button" class="lang-btn" data-lang="id">ID</button><button type="button" class="lang-btn" data-lang="en">EN</button>'; header.appendChild(switcher); switcher.addEventListener('click', event => { if (event.target.matches('.lang-btn')) setCustomerLanguage(event.target.dataset.lang); }); }
async function customerFetch(url, options = {}) {
  options.headers = { ...(options.headers || {}), Authorization: `Bearer ${customerToken()}` };
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({ success: false, message: 'Respons server tidak valid' }));
  if (response.status === 401 || response.status === 403) { localStorage.removeItem('customer_token'); localStorage.removeItem('customer_user'); location.href = `/login?next=${encodeURIComponent(location.pathname)}`; throw new Error(customerTranslations[customerLang()].login_required); }
  if (!response.ok) throw new Error(data.message || 'Permintaan gagal');
  return data;
}
function requireCustomer() {
  if (!customerToken()) {
    alert(customerTranslations[customerLang()].login_required);
    location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
    return false;
  }
  return true;
}
function customerHeader() {
  customerLanguageSwitch();
  if (!document.querySelector('link[rel="icon"]')) {
    const favicon = document.createElement('link'); favicon.rel = 'icon'; favicon.type = 'image/svg+xml'; favicon.href = '/images/logo.svg'; document.head.appendChild(favicon);
  }
  const main = document.querySelector('main.page-shell');
  if (main && !main.querySelector('.back-link')) {
    const back = document.createElement('a'); back.className = 'back-link'; back.href = '/'; back.dataset.customerText = 'back'; back.innerHTML = '<i class="fa-solid fa-arrow-left"></i> Kembali ke beranda'; main.prepend(back);
  }
  const user = customerUser();
  const account = document.querySelector('[data-customer-account]');
  if (account) account.innerHTML = user ? `<span class="user-pill">${safe(user.name)}</span> <a href="/favorites" data-customer-text="favorites">Favorit</a> <a href="/cart" data-customer-text="cart">Keranjang</a> <a href="#" data-logout data-customer-text="logout">Keluar</a>` : '<a href="/login" data-customer-text="login">Masuk</a><a class="btn" href="/register" data-customer-text="register">Daftar</a>';
  setCustomerLanguage(customerLang());
  document.querySelector('[data-logout]')?.addEventListener('click', e => { e.preventDefault(); localStorage.removeItem('customer_token'); localStorage.removeItem('customer_user'); location.href = '/'; });
}
function ratingStars(product) { const rating = Number(product.average_rating || 0); return `<div class="rating-stars" aria-label="${rating} dari 5">${[1,2,3,4,5].map(i => `<button type="button" class="rating-star ${i <= Math.round(rating) ? 'is-filled' : ''}" data-rating-product="${product.id}" data-rating-value="${i}" aria-label="${i} bintang"><i class="fa-solid fa-star"></i></button>`).join('')}<small>${rating ? rating.toFixed(1) : '0.0'} (${product.review_count || 0})</small></div>`; }
function productCard(product, favorite = false) { return `<article class="product-card"><img src="${safe(product.image_url || '/images/logo.svg')}" alt="${safe(product.name)}" onerror="this.onerror=null;this.src='/images/logo.svg'"><div class="product-info"><h3>${safe(product.name)}</h3><p>${safe(product.description || 'Rangkaian bunga premium Mahira Flowers.')}</p><div class="price">${money(product.price)}</div>${ratingStars(product)}<div class="product-actions"><button class="btn btn-dark" data-cart="${product.id}" data-product-name="${safe(product.name)}" data-product-price="${money(product.price)}"><i class="fa-solid fa-bag-shopping"></i> <span data-customer-text="order">Pesan</span></button><button class="btn btn-light favorite-button" data-favorite="${product.id}" aria-label="Tambah ke favorit"><i class="fa-${favorite ? 'solid' : 'regular'} fa-heart"></i></button></div></div></article>`; }
async function addToCart(productId, productName = '', productPrice = '') {
  const target = `/?order=${encodeURIComponent(productId)}&name=${encodeURIComponent(productName)}&price=${encodeURIComponent(productPrice)}`;
  if (typeof window.openOrderModal === 'function') {
    window.openOrderModal(productId, productName, productPrice);
  } else {
    location.href = target;
  }
}
function popAnimate(el) { if (!el) return; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); el.addEventListener('animationend', () => el.classList.remove('pop'), { once: true }); }
async function toggleFavorite(productId, button) {
  if (!requireCustomer()) return;
  popAnimate(button);
  button.disabled = true;
  try {
    const data = await customerFetch(`/api/favorites/${productId}`, { method: 'POST' });
    button.classList.toggle('active', data.active);
    button.innerHTML = `<i class="fa-${data.active ? 'solid' : 'regular'} fa-heart"></i>`;
  } catch (e) { alert(e.message); }
  finally { button.disabled = false; }
}
document.addEventListener('click', e => {
  const cart = e.target.closest('[data-cart]');
  if (cart) addToCart(cart.dataset.cart, cart.dataset.productName, cart.dataset.productPrice);
  const favorite = e.target.closest('[data-favorite]');
  if (favorite) toggleFavorite(favorite.dataset.favorite, favorite);
});
document.addEventListener('click', e => {
  const star = e.target.closest('[data-rating-product]');
  if (star) { popAnimate(star); submitRating(star.dataset.ratingProduct, star.dataset.ratingValue); }
});
async function submitRating(productId, rating) {
  if (!requireCustomer()) return;
  const reviewText = window.prompt(customerLang() === 'en' ? 'Write a short review:' : 'Tulis ulasan singkat:');
  if (!reviewText) return;
  try {
    const data = await customerFetch(`/api/reviews/${productId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: Number(rating), review_text: reviewText }) });
    alert(data.message);
    location.reload();
  } catch (error) { alert(error.message); }
}
document.addEventListener('DOMContentLoaded', customerHeader);
