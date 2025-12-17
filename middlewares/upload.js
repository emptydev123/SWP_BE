const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Đảm bảo thư mục uploads tồn tại
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

function createUploader({ prefix, exts, maxSizeMB }) {
    const storage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, uploadsDir);
        },
        filename: function (req, file, cb) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, `${prefix}-${uniqueSuffix}${path.extname(file.originalname)}`);
        }
    });

    const fileFilter = (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (exts.includes(ext)) return cb(null, true);
        cb(new Error(`File không hợp lệ. Chỉ chấp nhận: ${exts.join(', ')}`), false);
    };

    return multer({
        storage,
        fileFilter,
        limits: { fileSize: maxSizeMB * 1024 * 1024 }
    });
}

// Upload Excel (giữ tương thích cho club import)
const uploadExcel = createUploader({
    prefix: 'excel',
    exts: ['.xlsx', '.xls'],
    maxSizeMB: 5
});

// Upload hình ảnh (proof)
const uploadImage = createUploader({
    prefix: 'img',
    exts: ['.png', '.jpg', '.jpeg', '.webp'],
    maxSizeMB: 5
});

// Giữ compat: default export vẫn là uploadExcel
module.exports = uploadExcel;
module.exports.uploadExcel = uploadExcel;
module.exports.uploadImage = uploadImage;



