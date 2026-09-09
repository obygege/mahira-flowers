-- Hapus/kosongkan semua data KECUALI tabel `categories` dan akun admin di `users`.
-- Struktur tabel tetap utuh, cuma isinya yang dibersihkan. Jalankan di database mahira_flowers.

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE `carts`;
TRUNCATE TABLE `custom_inquiries`;
TRUNCATE TABLE `order_items`;
TRUNCATE TABLE `orders`;
TRUNCATE TABLE `product_images`;
TRUNCATE TABLE `products`;
TRUNCATE TABLE `reviews`;
TRUNCATE TABLE `site_visits`;
TRUNCATE TABLE `voucher_products`;
TRUNCATE TABLE `vouchers`;
TRUNCATE TABLE `wishlists`;

-- users: sisain akun admin doang, buang customer/akun lain
DELETE FROM `users` WHERE `role` <> 'admin';

-- categories: sengaja TIDAK disentuh sesuai permintaan

SET FOREIGN_KEY_CHECKS = 1;
