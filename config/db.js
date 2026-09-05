const mysql = require('mysql2/promise');
require('dotenv').config();

// DB_SSL=true kalau host butuh SSL (mis. Aiven, PlanetScale, dsb saat deploy).
// Laragon lokal biasanya tidak perlu SSL, jadi default-nya off.
const useSsl = String(process.env.DB_SSL || '').toLowerCase() === 'true';

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {})
});

pool.getConnection()
    .then(() => console.log('✅ Terhubung ke database MySQL'))
    .catch((err) => console.error('❌ Gagal koneksi database:', err.message));

module.exports = pool;