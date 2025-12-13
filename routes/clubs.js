const express = require('express');
const router = express.Router();
const clubController = require('../controller/ClubController');
const auth = require('../middlewares/auth');
const upload = require('../middlewares/upload');

/**
 * @swagger
 * tags:
 *   name: Clubs
 *   description: Quản lý CLB
 */

/**
 * @swagger
 * /api/clubs:
 *   get:
 *     summary: Lấy danh sách tất cả CLB (Public)
 *     tags: [Clubs]
 *     responses:
 *       200:
 *         description: Danh sách CLB
 */
router.get('/',
    auth.authMiddleWare,
    auth.requireRole("ADMIN", "USER"),
    clubController.getAllClubs);

/**
 * @swagger
 * /api/clubs/{slug}:
 *   get:
 *     summary: Xem chi tiết CLB theo Slug hoặc ID
 *     tags: [Clubs]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Slug hoặc ID của CLB
 *     responses:
 *       200:
 *         description: Thông tin chi tiết CLB
 *       404:
 *         description: Không tìm thấy CLB
 */
router.get('/:slug',
    auth.authMiddleWare,
    auth.requireRole('USER', "ADMIN"),
    clubController.getClubDetail);

/**
 * @swagger
 * /api/clubs:
 *   post:
 *     summary: Tạo CLB mới với import Excel (Admin Only)
 *     tags: [Clubs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - excelFile
 *             properties:
 *               excelFile:
 *                 type: string
 *                 format: binary
 *                 description: File Excel chứa danh sách members. Các cột bắt buộc - email, student_code, phone, email_verified, role, is_leader, full_name
 *               name:
 *                 type: string
 *                 description: Tên club
 *                 example: FPT Software Engineering Club
 *               slug:
 *                 type: string
 *                 description: Slug của club (tùy chọn)
 *                 example: fpt-se-club
 *               description:
 *                 type: string
 *                 description: Mô tả club
 *                 example: Câu lạc bộ lập trình FPT
 *               logoUrl:
 *                 type: string
 *                 description: URL logo club
 *                 example: https://example.com/logo.png
 *     responses:
 *       201:
 *         description: Tạo CLB thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       400:
 *         description: Lỗi validate hoặc file Excel không hợp lệ
 *       403:
 *         description: Forbidden (Not Admin)
 */
router.post('/',
    auth.authMiddleWare,
    auth.requireRole('ADMIN'),
    upload.single('excelFile'),
    clubController.createClub
);

module.exports = router;
