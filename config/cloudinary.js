const cloudinary = require('cloudinary').v2;
require('dotenv').config();

// Kenapa ini dibutuhkan:
// Sebelumnya foto produk/kategori ditulis langsung ke folder lokal
// (public/images/products & public/images/categories) di server.
// Folder itu TIDAK ikut tersimpan permanen setiap kali aplikasi
// di-deploy ulang / di-restart / di-push ulang lewat git, karena hanya
// file yang benar-benar di-commit ke git yang ikut. Akibatnya foto yang
// diupload lewat admin panel hilang lagi walau data di database aman.
//
// Solusinya: upload file gambar ke Cloudinary (storage terpisah dari
// server aplikasi), lalu yang disimpan ke DB adalah URL permanennya.
// Dengan begini gambar tidak akan pernah hilang lagi walau server
// di-redeploy, di-restart, atau dipindah hosting sekalipun.

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Upload buffer gambar (hasil kompres sharp) ke Cloudinary.
 * @param {Buffer} buffer - buffer gambar (biasanya sudah di-compress jadi JPEG)
 * @param {string} folder - subfolder di Cloudinary, mis. 'mahira-flowers/products'
 * @returns {Promise<string>} secure_url permanen dari Cloudinary
 */
function uploadBufferToCloudinary(buffer, folder, format = 'jpg') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image', format },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

module.exports = { cloudinary, uploadBufferToCloudinary };
