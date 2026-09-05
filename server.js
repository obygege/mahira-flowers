const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const sharp = require('sharp');
require('dotenv').config();
const db = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mahira-flowers-local-secret';
const FALLBACK_IMAGE = '/images/logo.png';
const ADMIN_WHATSAPP = '6285284589556';
const SITE_URL = (process.env.SITE_URL || 'https://mahiraflowers.id').replace(/\/$/, '');

function localizeProducts(products, lang) {
  if (lang !== 'en') return products;
  return products.map(product => ({
    ...product,
    name: product.name_en || product.name,
    description: product.description_en || product.description
  }));
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  next();
});

// ==========================================
// KONFIGURASI UPLOAD FOTO (MULTER)
// ==========================================
const uploadDir = path.join(__dirname, 'public/images/products');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// File ditampung di memory agar dapat dikompres sebelum ditulis ke disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Hanya file gambar yang diperbolehkan!'));
  }
});

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function compressImage(file) {
  if (!file) return null;
  let width = 2400;
  let quality = 82;
  let output;

  do {
    output = await sharp(file.buffer)
      .rotate()
      .resize({ width, height: 2400, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, progressive: true, mozjpeg: true })
      .toBuffer();
    if (output.length > MAX_IMAGE_BYTES) {
      if (quality > 50) quality -= 10;
      else width = Math.floor(width * 0.8);
    }
  } while (output.length > MAX_IMAGE_BYTES && width >= 800);

  if (output.length > MAX_IMAGE_BYTES) {
    throw new Error('Gambar tetap lebih besar dari 5 MB setelah dikompres. Gunakan gambar yang lebih kecil.');
  }
  return output;
}

async function saveProductImage(file) {
  const buffer = await compressImage(file);
  if (!buffer) return null;
  const filename = `${Date.now()}-${Math.round(Math.random() * 1E9)}.jpg`;
  await fs.promises.writeFile(path.join(uploadDir, filename), buffer);
  return `/images/products/${filename}`;
}

// ==========================================
// KONFIGURASI EMAIL (NODEMAILER)
// ==========================================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD }
});

// ==========================================
// MIDDLEWARE AUTENTIKASI (Cek Login)
// ==========================================
const authenticate = (req, res, next) => {
  const authHeader = req.header('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!token) return res.status(401).json({ success: false, message: 'Akses Ditolak. Harap Login.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Sesi login tidak valid atau sudah berakhir' });
  }
};

const requireAdmin = (req, res, next) => {
  if (String(req.user.role || '').toLowerCase() !== 'admin') {
    return res.status(403).json({ success: false, message: 'Akses hanya untuk admin' });
  }
  next();
};

// ==========================================
// API ROUTES: PUBLIC (FRONTEND)
// ==========================================
db.query(`CREATE TABLE IF NOT EXISTS site_visits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  path VARCHAR(255) NOT NULL,
  user_agent VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_site_visits_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch(error => {
  console.error('Gagal menyiapkan statistik pengunjung:', error.message);
});

app.get('/', async (req, res) => {
  try {
    await db.query('INSERT INTO site_visits (path, user_agent) VALUES (?, ?)', ['/', req.get('user-agent') || null]);
  } catch (error) {
    console.error('Gagal mencatat kunjungan:', error.message);
  }
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin.html')));
app.get('/search', (req, res) => res.sendFile(path.join(__dirname, 'views', 'search.html')));
app.get('/cart', (req, res) => res.sendFile(path.join(__dirname, 'views', 'cart.html')));
app.get('/payment/:orderNumber', (req, res) => res.sendFile(path.join(__dirname, 'views', 'payment.html')));
app.get('/favorites', (req, res) => res.sendFile(path.join(__dirname, 'views', 'favorites.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'views', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'views', 'register.html')));
app.get('/category/:slug', (req, res) => res.sendFile(path.join(__dirname, 'views', 'category.html')));

// ==========================================
// SEO: robots.txt & sitemap.xml (dinamis, ikut produk + kategori terbaru)
// ==========================================
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /cart\nDisallow: /payment\n\nSitemap: ${SITE_URL}/sitemap.xml`
  );
});

app.get('/sitemap.xml', async (req, res) => {
  try {
    const staticUrls = [
      { loc: '/', priority: '1.0' },
      { loc: '/search', priority: '0.5' },
      { loc: '/login', priority: '0.3' },
      { loc: '/register', priority: '0.3' },
    ];
    const [categories] = await db.query('SELECT slug, created_at FROM categories');

    const urlXml = (loc, lastmod, priority) => `  <url>\n    <loc>${SITE_URL}${loc}</loc>\n${lastmod ? `    <lastmod>${new Date(lastmod).toISOString()}</lastmod>\n` : ''}    <priority>${priority}</priority>\n  </url>`;

    const entries = [
      ...staticUrls.map(u => urlXml(u.loc, null, u.priority)),
      ...categories.map(c => urlXml(`/category/${c.slug}`, c.created_at, '0.7')),
    ];

    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>`
    );
  } catch (error) {
    res.status(500).type('text/plain').send('Gagal membuat sitemap');
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const query = `
            SELECT p.*, COALESCE(pi.image_url, ?) AS image_url,
              COALESCE(ROUND((SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id), 1), 0) AS average_rating,
              (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS review_count
            FROM products p
            LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = TRUE
            WHERE p.is_active = TRUE
        `;
    const [products] = await db.query(query, [FALLBACK_IMAGE]);
    res.json({ success: true, data: localizeProducts(products, req.query.lang) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching products' });
  }
});

// ==========================================
// API ROUTES: AUTHENTICATION & OTP
// ==========================================
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(400).json({ success: false, message: 'Email tidak ditemukan' });

    const user = users[0];
    const validPass = await bcrypt.compare(password, user.password_hash);
    if (!validPass) return res.status(400).json({ success: false, message: 'Password salah' });

    const role = String(user.role || '').toLowerCase();
    const token = jwt.sign({ id: user.id, role }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error server saat login' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!name || !email || password.length < 6) {
    return res.status(400).json({ success: false, message: 'Nama, email, dan password minimal 6 karakter wajib diisi' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, \'customer\')', [name, email, hash]);
    const token = jwt.sign({ id: result.insertId, role: 'customer' }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ success: true, token, user: { id: result.insertId, name, email, role: 'customer' } });
  } catch (error) {
    res.status(409).json({ success: false, message: error.code === 'ER_DUP_ENTRY' ? 'Email sudah terdaftar' : 'Gagal membuat akun' });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(400).json({ success: false, message: 'Email tidak terdaftar' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit OTP
    const expires = new Date(Date.now() + 15 * 60000); // Valid 15 menit

    await db.query('UPDATE users SET reset_otp = ?, otp_expires_at = ? WHERE email = ?', [otp, expires, email]);

    await transporter.sendMail({
      from: process.env.SMTP_EMAIL,
      to: email,
      subject: 'Kode OTP Reset Password - Mahira Flowers',
      text: `Kode OTP Anda adalah: ${otp}. Berlaku selama 15 menit.`
    });

    res.json({ success: true, message: 'OTP telah dikirim ke email Anda' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal mengirim email OTP' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  try {
    const [users] = await db.query('SELECT * FROM users WHERE email = ? AND reset_otp = ? AND otp_expires_at > NOW()', [email, otp]);
    if (users.length === 0) return res.status(400).json({ success: false, message: 'OTP salah atau kadaluarsa' });

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = ?, reset_otp = NULL, otp_expires_at = NULL WHERE email = ?', [hash, email]);

    res.json({ success: true, message: 'Password berhasil diubah. Silakan Login.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error reset password' });
  }
});

// Update Profil Admin (Username, Email, Password Baru opsional)
app.put('/api/admin/profile', authenticate, requireAdmin, async (req, res) => {
  const { name, email, password } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await db.query('UPDATE users SET name = ?, email = ?, password_hash = ? WHERE id = ?', [name, email, hash, req.user.id]);
    } else {
      await db.query('UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, req.user.id]);
    }
    res.json({ success: true, message: 'Profil berhasil diupdate' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal update profil' });
  }
});

app.get('/api/products/search', async (req, res) => {
  const term = String(req.query.q || '').trim();
  try {
    const like = `%${term}%`;
    const [products] = await db.query(`
      SELECT p.*, c.name AS category_name, COALESCE(pi.image_url, ?) AS image_url,
        COALESCE(ROUND((SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id), 1), 0) AS average_rating,
        (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS review_count
      FROM products p LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = TRUE
      WHERE p.is_active = TRUE AND (? = '' OR p.name LIKE ? OR p.description LIKE ? OR c.name LIKE ?)
      ORDER BY p.created_at DESC`, [FALLBACK_IMAGE, term, like, like, like]);
    res.json({ success: true, data: localizeProducts(products, req.query.lang), query: term });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal mencari produk' });
  }
});

app.get('/api/categories/:slug/products', async (req, res) => {
  try {
    const [categories] = await db.query('SELECT id, name, slug FROM categories WHERE slug = ?', [req.params.slug]);
    if (!categories.length) return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan' });
    const [products] = await db.query(`
      SELECT p.*, c.name AS category_name, COALESCE(pi.image_url, ?) AS image_url
      FROM products p JOIN categories c ON c.id = p.category_id
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = TRUE
      WHERE p.is_active = TRUE AND c.id = ? ORDER BY p.created_at DESC`, [FALLBACK_IMAGE, categories[0].id]);
    res.json({ success: true, category: categories[0], data: localizeProducts(products, req.query.lang) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal mengambil produk kategori' });
  }
});

const requireCustomer = (req, res, next) => {
  if (!req.user?.id) return res.status(403).json({ success: false, message: 'Akun customer diperlukan' });
  next();
};

app.get('/api/cart', authenticate, requireCustomer, async (req, res) => {
  const [items] = await db.query(`SELECT c.product_id, c.quantity, p.name, p.price, COALESCE(pi.image_url, ?) AS image_url
    FROM carts c JOIN products p ON p.id = c.product_id LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = TRUE
    WHERE c.user_id = ? ORDER BY c.updated_at DESC`, [FALLBACK_IMAGE, req.user.id]);
  res.json({ success: true, data: localizeProducts(items, req.query.lang) });
});

app.post('/api/cart', authenticate, requireCustomer, async (req, res) => {
  const productId = Number(req.body.product_id);
  const quantity = Math.max(1, Number(req.body.quantity || 1));
  if (!productId) return res.status(400).json({ success: false, message: 'Produk tidak valid' });
  const [products] = await db.query('SELECT id FROM products WHERE id = ? AND is_active = TRUE', [productId]);
  if (!products.length) return res.status(404).json({ success: false, message: 'Produk tidak tersedia' });
  await db.query(`INSERT INTO carts (user_id, product_id, quantity) VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`, [req.user.id, productId, quantity]);
  res.status(201).json({ success: true, message: 'Produk masuk keranjang' });
});

app.patch('/api/cart/:productId', authenticate, requireCustomer, async (req, res) => {
  const quantity = Number(req.body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ success: false, message: 'Jumlah tidak valid' });
  await db.query('UPDATE carts SET quantity = ? WHERE user_id = ? AND product_id = ?', [quantity, req.user.id, req.params.productId]);
  res.json({ success: true });
});

app.delete('/api/cart/:productId', authenticate, requireCustomer, async (req, res) => {
  await db.query('DELETE FROM carts WHERE user_id = ? AND product_id = ?', [req.user.id, req.params.productId]);
  res.json({ success: true, message: 'Produk dihapus dari keranjang' });
});

app.get('/api/favorites', authenticate, requireCustomer, async (req, res) => {
  const [items] = await db.query(`SELECT p.*, COALESCE(pi.image_url, ?) AS image_url FROM wishlists w
    JOIN products p ON p.id = w.product_id LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = TRUE
    WHERE w.user_id = ? AND p.is_active = TRUE ORDER BY w.created_at DESC`, [FALLBACK_IMAGE, req.user.id]);
  res.json({ success: true, data: localizeProducts(items, req.query.lang) });
});

app.get('/api/reviews/:productId', async (req, res) => {
  const [reviews] = await db.query(`SELECT r.id, r.rating, r.review_text, r.customer_name, r.created_at
    FROM reviews r WHERE r.product_id = ? ORDER BY r.created_at DESC LIMIT 50`, [req.params.productId]);
  res.json({ success: true, data: reviews });
});

app.post('/api/reviews/:productId', authenticate, requireCustomer, async (req, res) => {
  const rating = Number(req.body.rating);
  const reviewText = String(req.body.review_text || '').trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ success: false, message: 'Rating harus 1 sampai 5' });
  if (!reviewText) return res.status(400).json({ success: false, message: 'Tulis ulasan terlebih dahulu' });
  const [users] = await db.query('SELECT name FROM users WHERE id = ?', [req.user.id]);
  if (!users.length) return res.status(401).json({ success: false, message: 'Akun tidak ditemukan' });
  await db.query(`INSERT INTO reviews (user_id, product_id, customer_name, rating, review_text)
    VALUES (?, ?, ?, ?, ?)`, [req.user.id, req.params.productId, users[0].name, rating, reviewText]);
  res.status(201).json({ success: true, message: 'Rating berhasil disimpan' });
});

app.post('/api/favorites/:productId', authenticate, requireCustomer, async (req, res) => {
  const [existing] = await db.query('SELECT id FROM wishlists WHERE user_id = ? AND product_id = ?', [req.user.id, req.params.productId]);
  if (existing.length) {
    await db.query('DELETE FROM wishlists WHERE id = ?', [existing[0].id]);
    return res.json({ success: true, active: false, message: 'Dihapus dari favorit' });
  }
  await db.query('INSERT INTO wishlists (user_id, product_id) VALUES (?, ?)', [req.user.id, req.params.productId]);
  res.json({ success: true, active: true, message: 'Ditambahkan ke favorit' });
});

db.query(`CREATE TABLE IF NOT EXISTS vouchers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  discount_type ENUM('percent','nominal') NOT NULL,
  discount_value DECIMAL(15,2) NOT NULL,
  min_order DECIMAL(15,2) NOT NULL DEFAULT 0,
  starts_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch(error => console.error('Gagal menyiapkan voucher:', error.message));
db.query(`CREATE TABLE IF NOT EXISTS voucher_products (
  voucher_id INT NOT NULL,
  product_id INT NOT NULL,
  PRIMARY KEY (voucher_id, product_id),
  CONSTRAINT voucher_products_voucher_fk FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
  CONSTRAINT voucher_products_product_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch(error => console.error('Gagal menyiapkan cakupan voucher:', error.message));
setInterval(() => {
  db.query('DELETE FROM vouchers WHERE expires_at <= NOW()').catch(error => console.error('Gagal membersihkan voucher:', error.message));
}, 60 * 1000);

for (const statement of [
  "ALTER TABLE products ADD COLUMN name_en VARCHAR(150) NULL",
  "ALTER TABLE products ADD COLUMN description_en TEXT NULL",
  "ALTER TABLE orders ADD COLUMN voucher_code VARCHAR(50) NULL",
  "ALTER TABLE orders ADD COLUMN discount_amount DECIMAL(15,2) NOT NULL DEFAULT 0",
  "ALTER TABLE orders ADD COLUMN unique_code INT NOT NULL DEFAULT 0",
  "ALTER TABLE orders ADD COLUMN payment_amount DECIMAL(15,2) NOT NULL DEFAULT 0",
  "ALTER TABLE orders ADD COLUMN payment_method VARCHAR(20) NOT NULL DEFAULT 'qris'",
  "ALTER TABLE custom_inquiries ADD COLUMN category VARCHAR(100) NULL",
  "ALTER TABLE custom_inquiries ADD COLUMN color_request VARCHAR(255) NULL",
  "ALTER TABLE custom_inquiries ADD COLUMN lettering VARCHAR(255) NULL",
  "ALTER TABLE custom_inquiries ADD COLUMN budget DECIMAL(15,2) NULL",
  "ALTER TABLE custom_inquiries ADD COLUMN event_date DATE NULL"
]) {
  db.query(statement).catch(error => { if (!['ER_DUP_FIELDNAME', 'ER_DUP_COLUMN'].includes(error.code)) console.error('Schema update:', error.message); });
}

// ==========================================
// SKEMA PEMBAYARAN QRIS STATIS (kode unik)
// ==========================================
db.query(`CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(50) NOT NULL UNIQUE,
  total_amount DECIMAL(15,2) NOT NULL,
  unique_code INT NOT NULL DEFAULT 0,
  payment_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(20) NOT NULL DEFAULT 'qris',
  voucher_code VARCHAR(50) NULL,
  discount_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  delivery_type VARCHAR(20) NOT NULL,
  delivery_address TEXT NULL,
  google_maps_link VARCHAR(500) NULL,
  delivery_date DATE NOT NULL,
  time_slot VARCHAR(20) NOT NULL,
  sender_name VARCHAR(150) NOT NULL,
  sender_phone VARCHAR(30) NOT NULL,
  card_from VARCHAR(150) NULL,
  card_to VARCHAR(150) NULL,
  card_message TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch(error => console.error('Gagal menyiapkan tabel orders:', error.message));

db.query(`CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  price DECIMAL(15,2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  CONSTRAINT order_items_order_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch(error => console.error('Gagal menyiapkan tabel order_items:', error.message));

db.query(`CREATE TABLE IF NOT EXISTS site_settings (
  setting_key VARCHAR(50) PRIMARY KEY,
  setting_value TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch(error => console.error('Gagal menyiapkan tabel site_settings:', error.message));

const qrisUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Hanya file gambar yang diperbolehkan!'));
  }
});
const qrisUploadDir = path.join(__dirname, 'public/images/qris');
if (!fs.existsSync(qrisUploadDir)) fs.mkdirSync(qrisUploadDir, { recursive: true });

// Menghasilkan kode unik (1-989) yang belum dipakai pesanan pending hari ini,
// agar mutasi di QRIS statis bisa dicocokkan otomatis dengan nominalnya.
async function generateUniqueCode(connection) {
  const [rows] = await connection.query(
    `SELECT unique_code FROM orders WHERE status = 'pending' AND DATE(created_at) = CURDATE()`
  );
  const used = new Set(rows.map(r => r.unique_code));
  for (let attempt = 0; attempt < 989; attempt++) {
    const code = Math.floor(Math.random() * 989) + 1;
    if (!used.has(code)) return code;
  }
  return Math.floor(Math.random() * 989) + 1;
}

// Membuat pesanan (bisa 1 produk / banyak produk dari keranjang) lalu mengembalikan
// info pembayaran QRIS (nominal + kode unik) yang harus dibayar customer.
async function createOrder(body) {
  const {
    delivery_type, delivery_address, google_maps_link, delivery_date,
    time_slot, sender_name, sender_phone, card_from, card_to, card_message, voucher_code
  } = body;

  let items = Array.isArray(body.items) ? body.items : null;
  if (!items && body.product_id) items = [{ product_id: body.product_id, quantity: body.quantity || 1 }];
  items = (items || []).filter(i => i && i.product_id).map(i => ({ product_id: Number(i.product_id), quantity: Math.max(1, Number(i.quantity || 1)) }));

  if (!items.length || !delivery_type || !delivery_date || !time_slot || !sender_name || !sender_phone) {
    return { status: 400, body: { success: false, message: 'Data pesanan belum lengkap' } };
  }
  if (delivery_type === 'delivery' && !delivery_address) {
    return { status: 400, body: { success: false, message: 'Alamat pengiriman wajib diisi' } };
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const ids = items.map(i => i.product_id);
    const [products] = await connection.query(
      `SELECT id, name, price FROM products WHERE id IN (?) AND is_active = TRUE`, [ids]
    );
    if (products.length !== new Set(ids).size) {
      await connection.rollback();
      return { status: 404, body: { success: false, message: 'Salah satu produk tidak tersedia' } };
    }
    const productMap = new Map(products.map(p => [p.id, p]));
    const subtotal = items.reduce((sum, i) => sum + Number(productMap.get(i.product_id).price) * i.quantity, 0);

    let discount = 0;
    let validVoucher = null;
    if (voucher_code) {
      const [vouchers] = await connection.query(`SELECT v.* FROM vouchers v WHERE v.code = ? AND v.starts_at <= NOW() AND v.expires_at > NOW()`, [String(voucher_code).trim().toUpperCase()]);
      if (!vouchers.length) {
        await connection.rollback();
        return { status: 400, body: { success: false, message: 'Voucher tidak ditemukan atau sudah kedaluwarsa' } };
      }
      validVoucher = vouchers[0];
      if (subtotal < Number(validVoucher.min_order)) {
        await connection.rollback();
        return { status: 400, body: { success: false, message: `Minimal order voucher ${Number(validVoucher.min_order).toLocaleString('id-ID')}` } };
      }
      discount = validVoucher.discount_type === 'percent'
        ? Math.min(subtotal, subtotal * Number(validVoucher.discount_value) / 100)
        : Math.min(subtotal, Number(validVoucher.discount_value));
    }
    const totalAmount = subtotal - discount;
    const uniqueCode = await generateUniqueCode(connection);
    const paymentAmount = totalAmount + uniqueCode;
    const orderNumber = `MF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const [order] = await connection.query(`
      INSERT INTO orders (order_number, total_amount, unique_code, payment_amount, payment_method, voucher_code, discount_amount, delivery_type, delivery_address, google_maps_link, delivery_date, time_slot, sender_name, sender_phone, card_from, card_to, card_message)
      VALUES (?, ?, ?, ?, 'qris', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderNumber, totalAmount, uniqueCode, paymentAmount, validVoucher?.code || null, discount, delivery_type, delivery_address || null, google_maps_link || null, delivery_date, time_slot, sender_name, sender_phone, card_from || null, card_to || null, card_message || null]);

    for (const item of items) {
      const product = productMap.get(item.product_id);
      await connection.query('INSERT INTO order_items (order_id, product_id, price, quantity) VALUES (?, ?, ?, ?)', [order.insertId, item.product_id, product.price, item.quantity]);
    }
    await connection.commit();

    const [[qrisSetting]] = await db.query(`SELECT setting_value FROM site_settings WHERE setting_key = 'qris_image'`).catch(() => [[null]]);
    const productLines = items.map(i => `- ${productMap.get(i.product_id).name} x${i.quantity}`).join('\n');
    const whatsappText = encodeURIComponent(`Halo Mahira Flowers, saya sudah transfer QRIS untuk pesanan berikut.

Nomor pesanan: ${orderNumber}
${productLines}
Total dibayar: Rp ${paymentAmount.toLocaleString('id-ID')} (termasuk kode unik ${uniqueCode})
Nama: ${sender_name}
No. HP: ${sender_phone}`);

    return {
      status: 201,
      body: {
        success: true,
        message: 'Pesanan berhasil dibuat, silakan selesaikan pembayaran QRIS',
        order_number: orderNumber,
        subtotal, discount, total: totalAmount,
        unique_code: uniqueCode,
        payment_amount: paymentAmount,
        qris_image: qrisSetting?.setting_value || null,
        whatsapp_url: `https://wa.me/${ADMIN_WHATSAPP}?text=${whatsappText}`
      }
    };
  } catch (error) {
    await connection.rollback();
    console.error('Gagal menyimpan pesanan:', error);
    return { status: 500, body: { success: false, message: 'Gagal menyimpan pesanan' } };
  } finally {
    connection.release();
  }
}

// Info QRIS statis untuk ditampilkan di halaman pembayaran (public, tidak perlu login)
app.get('/api/payment-settings', async (req, res) => {
  try {
    const [[row]] = await db.query(`SELECT setting_value FROM site_settings WHERE setting_key = 'qris_image'`);
    res.json({ success: true, qris_image: row?.setting_value || null });
  } catch (error) {
    res.json({ success: true, qris_image: null });
  }
});

// Upload/ganti gambar QRIS statis dari halaman admin
app.post('/api/admin/payment-settings/qris', authenticate, requireAdmin, (req, res) => {
  qrisUpload.single('qris')(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: 'Pilih file gambar QRIS terlebih dahulu' });
    try {
      const filename = `qris-${Date.now()}.png`;
      await sharp(req.file.buffer).png().toFile(path.join(qrisUploadDir, filename));
      const imageUrl = `/images/qris/${filename}`;
      await db.query(`INSERT INTO site_settings (setting_key, setting_value) VALUES ('qris_image', ?)
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`, [imageUrl]);
      res.json({ success: true, message: 'Gambar QRIS berhasil disimpan', qris_image: imageUrl });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Gagal menyimpan gambar QRIS' });
    }
  });
});

// Cek status pesanan (dipakai halaman pembayaran untuk polling status setelah transfer)
app.get('/api/orders/:orderNumber/status', async (req, res) => {
  const [rows] = await db.query('SELECT order_number, status, payment_amount, unique_code FROM orders WHERE order_number = ?', [req.params.orderNumber]);
  if (!rows.length) return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan' });
  res.json({ success: true, data: rows[0] });
});

// Detail lengkap untuk halaman pembayaran (QRIS, nominal, kode unik, link WA)
app.get('/api/orders/:orderNumber/payment', async (req, res) => {
  const [rows] = await db.query('SELECT * FROM orders WHERE order_number = ?', [req.params.orderNumber]);
  if (!rows.length) return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan' });
  const order = rows[0];
  const [items] = await db.query(
    `SELECT oi.quantity, p.name FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`,
    [order.id]
  );
  const [[qrisSetting]] = await db.query(`SELECT setting_value FROM site_settings WHERE setting_key = 'qris_image'`).catch(() => [[null]]);
  const productLines = items.map(i => `- ${i.name} x${i.quantity}`).join('\n');
  const whatsappText = encodeURIComponent(`Halo Mahira Flowers, saya sudah transfer QRIS untuk pesanan berikut.

Nomor pesanan: ${order.order_number}
${productLines}
Total dibayar: Rp ${Number(order.payment_amount).toLocaleString('id-ID')} (termasuk kode unik ${order.unique_code})
Nama: ${order.sender_name}
No. HP: ${order.sender_phone}`);
  res.json({
    success: true,
    data: {
      order_number: order.order_number,
      status: order.status,
      total: Number(order.total_amount),
      payment_amount: Number(order.payment_amount),
      unique_code: order.unique_code,
      items,
      qris_image: qrisSetting?.setting_value || null,
      whatsapp_url: `https://wa.me/${ADMIN_WHATSAPP}?text=${whatsappText}`,
      admin_whatsapp: ADMIN_WHATSAPP
    }
  });
});

// Checkout dari halaman keranjang (multi produk, butuh login customer)
app.post('/api/cart/checkout', authenticate, requireCustomer, async (req, res) => {
  const [cartRows] = await db.query('SELECT product_id, quantity FROM carts WHERE user_id = ?', [req.user.id]);
  if (!cartRows.length) return res.status(400).json({ success: false, message: 'Keranjang masih kosong' });
  const result = await createOrder({ ...req.body, items: cartRows });
  if (result.body.success) {
    await db.query('DELETE FROM carts WHERE user_id = ?', [req.user.id]);
  }
  res.status(result.status).json(result.body);
});

app.get('/api/vouchers/active', async (req, res) => {
  await db.query('DELETE FROM vouchers WHERE expires_at <= NOW()');
  const [vouchers] = await db.query(`SELECT code, discount_type, discount_value, min_order, starts_at, expires_at
    FROM vouchers WHERE starts_at <= NOW() AND expires_at > NOW() ORDER BY expires_at ASC`);
  res.json({ success: true, data: vouchers });
});

app.post('/api/vouchers/validate', async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const subtotal = Number(req.body.subtotal || 0);
  const productId = Number(req.body.product_id || 0);
  const [rows] = await db.query(`SELECT v.* FROM vouchers v
    LEFT JOIN voucher_products vp ON vp.voucher_id = v.id AND vp.product_id = ?
    WHERE v.code = ? AND v.starts_at <= NOW() AND v.expires_at > NOW()
    AND (NOT EXISTS (SELECT 1 FROM voucher_products WHERE voucher_id = v.id) OR vp.product_id IS NOT NULL)`, [productId, code]);
  if (!rows.length) return res.status(400).json({ success: false, message: 'Voucher tidak ditemukan atau sudah kedaluwarsa' });
  const voucher = rows[0];
  if (subtotal < Number(voucher.min_order)) return res.status(400).json({ success: false, message: `Minimal order voucher ${Number(voucher.min_order).toLocaleString('id-ID')}` });
  const discount = voucher.discount_type === 'percent' ? Math.min(subtotal, subtotal * Number(voucher.discount_value) / 100) : Math.min(subtotal, Number(voucher.discount_value));
  res.json({ success: true, data: { code: voucher.code, discount, total: subtotal - discount } });
});

app.get('/api/admin/vouchers', authenticate, requireAdmin, async (req, res) => {
  await db.query('DELETE FROM vouchers WHERE expires_at <= NOW()');
  const [vouchers] = await db.query('SELECT * FROM vouchers ORDER BY expires_at DESC');
  res.json({ success: true, data: vouchers });
});

app.post('/api/admin/vouchers', authenticate, requireAdmin, async (req, res) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();
    const type = req.body.discount_type === 'nominal' ? 'nominal' : 'percent';
    const value = Number(req.body.discount_value);
    const minOrder = Number(req.body.min_order || 0);
    const startsAt = req.body.starts_at;
    const expiresAt = req.body.expires_at;
    const productIds = Array.isArray(req.body.product_ids) ? [...new Set(req.body.product_ids.map(Number).filter(Boolean))] : [];
    if (!code || value <= 0 || !startsAt || !expiresAt || new Date(expiresAt) <= new Date(startsAt) || (type === 'percent' && value > 100)) return res.status(400).json({ success: false, message: 'Data voucher tidak valid' });
    if (productIds.length) {
      const [products] = await db.query('SELECT id FROM products WHERE id IN (?)', [productIds]);
      if (products.length !== productIds.length) return res.status(400).json({ success: false, message: 'Ada produk voucher yang tidak ditemukan' });
    }
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query('INSERT INTO vouchers (code, discount_type, discount_value, min_order, starts_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)', [code, type, value, minOrder, startsAt, expiresAt]);
      if (productIds.length) await connection.query(`INSERT INTO voucher_products (voucher_id, product_id) VALUES ${productIds.map(() => '(?, ?)').join(',')}`, productIds.flatMap(productId => [result.insertId, productId]));
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    res.status(201).json({ success: true, message: 'Voucher berhasil ditambahkan' });
  } catch (error) {
    console.error('Gagal menambah voucher:', error.code, error.message);
    res.status(409).json({ success: false, message: error.code === 'ER_DUP_ENTRY' ? 'Kode voucher sudah digunakan' : 'Gagal menambah voucher' });
  }
});

app.delete('/api/admin/vouchers/:id', authenticate, requireAdmin, async (req, res) => {
  await db.query('DELETE FROM vouchers WHERE id = ?', [req.params.id]);
  res.json({ success: true, message: 'Voucher dihapus' });
});

// ==========================================
// API ROUTES: KATEGORI & PRODUK (ADMIN ONLY)
// ==========================================
// ==========================================
// AI CHATBOT (Google Gemini - free tier) - konsultasi bunga otomatis
// ==========================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const chatRateLimit = new Map(); // ip -> { count, resetAt }

function chatRateLimited(ip) {
  const now = Date.now();
  const entry = chatRateLimit.get(ip);
  if (!entry || now > entry.resetAt) {
    chatRateLimit.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 15; // maks 15 pesan / menit / IP
}

app.post('/api/chatbot', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ success: false, message: 'Chatbot belum dikonfigurasi. Set GEMINI_API_KEY di server.' });
  }
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (chatRateLimited(ip)) {
    return res.status(429).json({ success: false, message: 'Terlalu banyak pertanyaan, coba lagi sebentar lagi ya.' });
  }

  const message = String(req.body.message || '').trim().slice(0, 800);
  const history = Array.isArray(req.body.history) ? req.body.history.slice(-10) : [];
  const lang = req.body.lang === 'en' ? 'en' : 'id';
  if (!message) return res.status(400).json({ success: false, message: 'Pesan tidak boleh kosong' });

  try {
    const [categories] = await db.query('SELECT name, slug FROM categories ORDER BY name ASC');
    const [products] = await db.query(
      `SELECT p.name, p.price, p.badge, c.name AS category_name
       FROM products p JOIN categories c ON c.id = p.category_id
       WHERE p.is_active = TRUE ORDER BY p.created_at DESC LIMIT 20`
    );

    const catalogContext = [
      `Kategori tersedia: ${categories.map(c => c.name).join(', ') || '-'}.`,
      `Contoh produk aktif saat ini:`,
      ...products.map(p => `- ${p.name} (${p.category_name}, Rp ${Number(p.price).toLocaleString('id-ID')}${p.badge && p.badge !== 'NONE' ? `, badge: ${p.badge}` : ''})`)
    ].join('\n');

    const systemPrompt = `Kamu adalah asisten virtual toko bunga "Mahira Flowers". Tugasmu membantu calon pembeli:
- Merekomendasikan bunga/rangkaian sesuai suasana hati, acara, budget, atau penerima yang mereka sebutkan (mis. ulang tahun, wisuda, duka cita, permintaan maaf, anniversary, pernikahan).
- Menjawab pertanyaan umum seputar bunga (arti bunga, cara merawat bunga potong, perbedaan jenis rangkaian, dsb).
- Menjawab pertanyaan random pelanggan dengan ramah selama masih pantas, lalu arahkan kembali ke topik toko jika relevan.
- HANYA merekomendasikan produk/kategori yang benar-benar ada di katalog berikut, jangan mengarang produk atau harga:
${catalogContext}
- Jika pelanggan ingin memesan, arahkan untuk klik produk di halaman utama / kategori terkait untuk lanjut checkout, atau hubungi admin via WhatsApp jika butuh bantuan lebih lanjut.
- Balas dengan singkat, hangat, dan sopan (maks 4-5 kalimat). Gunakan Bahasa Indonesia jika pelanggan menulis dalam Bahasa Indonesia, atau English jika pelanggan menulis dalam English. Bahasa saat ini: ${lang === 'en' ? 'English' : 'Bahasa Indonesia'}.
- Jangan mengarang kebijakan, harga, atau stok yang tidak ada di data di atas.`;

    const geminiContents = [
      ...history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
      { role: 'user', parts: [{ text: message }] }
    ];

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: geminiContents,
          generationConfig: { maxOutputTokens: 400, temperature: 0.7 }
        })
      }
    );

    const data = await geminiRes.json();
    if (!geminiRes.ok) {
      console.error('Gemini API error:', data);
      return res.status(502).json({ success: false, message: 'Chatbot sedang bermasalah, coba lagi sebentar lagi ya.' });
    }

    const reply = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n').trim()
      || (lang === 'en' ? 'Sorry, could you rephrase that?' : 'Maaf, boleh diulang pertanyaannya?');

    res.json({ success: true, reply });
  } catch (error) {
    console.error('Gagal memproses chatbot:', error.message);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan pada chatbot' });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const [categories] = await db.query('SELECT * FROM categories ORDER BY name ASC');
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal mengambil kategori' });
  }
});

app.get('/api/categories/:slug', async (req, res) => {
  try {
    const [categories] = await db.query('SELECT id, name, slug, image_url FROM categories WHERE slug = ?', [req.params.slug]);
    if (!categories.length) return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan' });
    const [products] = await db.query(`
      SELECT p.*, c.name AS category_name, COALESCE(pi.image_url, ?) AS image_url
      FROM products p
      JOIN categories c ON c.id = p.category_id
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = TRUE
      WHERE p.is_active = TRUE AND p.category_id = ?
      ORDER BY p.created_at DESC`, [FALLBACK_IMAGE, categories[0].id]);
    res.json({ success: true, category: categories[0], data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal mengambil produk kategori' });
  }
});

app.post('/api/admin/categories', authenticate, requireAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Nama kategori wajib diisi' });
    const imageUrl = String(req.body.image_url || '').trim() || null;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    await db.query('INSERT INTO categories (name, slug, image_url) VALUES (?, ?, ?)', [name, slug, imageUrl]);
    res.status(201).json({ success: true, message: 'Kategori ditambahkan!' });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Kategori sudah ada atau tidak valid' });
  }
});

app.put('/api/admin/categories/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Nama kategori wajib diisi' });
    const imageUrl = String(req.body.image_url || '').trim() || null;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    await db.query('UPDATE categories SET name = ?, slug = ?, image_url = ? WHERE id = ?', [name, slug, imageUrl, req.params.id]);
    res.json({ success: true, message: 'Kategori diperbarui!' });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Kategori sudah ada atau tidak valid' });
  }
});

app.delete('/api/admin/categories/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const [products] = await db.query('SELECT COUNT(*) AS total FROM products WHERE category_id = ?', [req.params.id]);
    if (products[0].total > 0) return res.status(409).json({ success: false, message: 'Kategori masih dipakai produk dan tidak dapat dihapus' });
    await db.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Kategori dihapus!' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal menghapus kategori' });
  }
});

app.get('/api/admin/products', authenticate, requireAdmin, async (req, res) => {
  try {
    const [products] = await db.query(`
      SELECT p.*, c.name AS category_name, COALESCE(pi.image_url, ?) AS image_url
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = TRUE
      ORDER BY p.created_at DESC`, [FALLBACK_IMAGE]);
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal mengambil produk admin' });
  }
});

app.post('/api/admin/products', authenticate, requireAdmin, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });

    try {
      const { category_id, name, name_en, description, description_en, price, shopee_link, badge } = req.body;
      const cleanName = String(name || '').trim();
      if (!cleanName || !category_id || !price) return res.status(400).json({ success: false, message: 'Nama, kategori, dan harga wajib diisi' });
      const slug = `${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now()}`;

      const [result] = await db.query(
        `INSERT INTO products (category_id, name, name_en, slug, description, description_en, price, shopee_link, badge) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [category_id, cleanName, name_en || null, slug, description || null, description_en || null, price, shopee_link || null, badge || 'NONE']
      );

      if (req.file) {
        const imageUrl = await saveProductImage(req.file);
        await db.query(`INSERT INTO product_images (product_id, image_url, is_primary) VALUES (?, ?, TRUE)`, [result.insertId, imageUrl]);
      }

      res.status(201).json({ success: true, message: 'Produk berhasil disimpan!' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Gagal menyimpan produk' });
    }
  });
});

app.put('/api/admin/products/:id', authenticate, requireAdmin, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    try {
      const { category_id, name, name_en, description, description_en, price, shopee_link, badge, is_active } = req.body;
      const cleanName = String(name || '').trim();
      await db.query(
        `UPDATE products SET category_id = ?, name = ?, name_en = ?, description = ?, description_en = ?, price = ?, shopee_link = ?, badge = ?, is_active = ? WHERE id = ?`,
        [category_id, cleanName, name_en || null, description || null, description_en || null, price, shopee_link || null, badge || 'NONE', is_active === '0' ? 0 : 1, req.params.id]
      );
      if (req.file) {
        const imageUrl = await saveProductImage(req.file);
        await db.query('UPDATE product_images SET is_primary = FALSE WHERE product_id = ?', [req.params.id]);
        await db.query('INSERT INTO product_images (product_id, image_url, is_primary) VALUES (?, ?, TRUE)', [req.params.id, imageUrl]);
      }
      res.json({ success: true, message: 'Produk diperbarui!' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message || 'Gagal memperbarui produk' });
    }
  });
});

app.delete('/api/admin/products/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const [items] = await db.query('SELECT COUNT(*) AS total FROM order_items WHERE product_id = ?', [req.params.id]);
    if (items[0].total > 0) {
      await db.query('UPDATE products SET is_active = FALSE WHERE id = ?', [req.params.id]);
      return res.json({ success: true, message: 'Produk sudah dipakai pada pesanan, jadi dinonaktifkan agar riwayat tetap aman' });
    }
    await db.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Produk dihapus' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal menghapus produk' });
  }
});

app.post('/api/orders', async (req, res) => {
  const result = await createOrder(req.body);
  res.status(result.status).json(result.body);
});

app.post('/api/custom-orders', async (req, res) => {
  const { name, email, phone, category, color_request, lettering, event_date, budget, message } = req.body;
  if (!name || !email || !phone || !category || !message) return res.status(400).json({ success: false, message: 'Nama, email, telepon, kategori, dan detail request wajib diisi' });
  try {
    await db.query(`INSERT INTO custom_inquiries (name, email, phone, message, category, color_request, lettering, budget, event_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [name.trim(), email.trim(), phone.trim(), message.trim(), category, color_request || null, lettering || null, budget || null, event_date || null]);
    res.status(201).json({ success: true, message: 'Request custom berhasil dikirim. Florist kami akan menghubungi Anda.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal menyimpan request custom' });
  }
});

app.get('/api/admin/dashboard', authenticate, requireAdmin, async (req, res) => {
  try {
    const [[summary]] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM site_visits) AS total_visits,
        (SELECT COUNT(*) FROM site_visits WHERE DATE(created_at) = CURDATE()) AS today_visits,
        (SELECT COUNT(*) FROM orders) AS total_orders,
        (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pending_orders,
        (SELECT COUNT(DISTINCT sender_phone) FROM orders) AS total_customers,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE status NOT IN ('cancelled')) AS total_revenue`);
    const [orders] = await db.query(`
      SELECT o.id, o.order_number, o.total_amount, o.unique_code, o.payment_amount, o.status, o.delivery_type, o.delivery_address,
        o.delivery_date, o.time_slot, o.sender_name, o.sender_phone, o.card_from, o.card_to, o.card_message,
        o.created_at,
        GROUP_CONCAT(CONCAT(p.name, ' x', oi.quantity) SEPARATOR ', ') AS product_name,
        MAX(p.description) AS product_description,
        COALESCE(MAX(pi.image_url), ?) AS product_image
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = TRUE
      GROUP BY o.id
      ORDER BY o.created_at DESC LIMIT 100`, [FALLBACK_IMAGE]);
    const [customers] = await db.query(`
      SELECT sender_name, sender_phone, COUNT(*) AS order_count, MAX(created_at) AS last_order_at
      FROM orders GROUP BY sender_phone, sender_name ORDER BY last_order_at DESC LIMIT 100`);
    res.json({ success: true, summary, orders, customers });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal mengambil dashboard admin' });
  }
});

app.patch('/api/admin/orders/:id/status', authenticate, requireAdmin, async (req, res) => {
  const allowed = ['pending', 'paid', 'processing', 'shipped', 'completed', 'cancelled'];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ success: false, message: 'Status pesanan tidak valid' });
  await db.query('UPDATE orders SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
  res.json({ success: true, message: 'Status pesanan diperbarui' });
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});