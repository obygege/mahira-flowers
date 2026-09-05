const mysql = require('mysql2/promise');
require('dotenv').config();

// Membuat pool koneksi ke MySQL Laragon
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

pool.getConnection()
    .then(() => console.log('✅ Terhubung ke database MySQL (Laragon)'))
    .catch((err) => console.error('❌ Gagal koneksi database:', err.message));

module.exports = pool;