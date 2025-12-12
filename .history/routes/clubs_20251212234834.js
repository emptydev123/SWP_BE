const express = require('express');
const router = express.Router();
const clubController = require('../controller/ClubController');
const auth = require('../middlewares/auth');

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
router.get('/', clubController.getAllClubs);

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
router.get('/:slug', clubController.getClubDetail);

/**
 * @swagger
 * /api/clubs:
 *   post:
 *     summary: Tạo CLB mới (Admin Only)
 *     tags: [Clubs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - leaderEmail
 *             properties:
 *               name:
 *                 type: string
 *                 example: FPT Software Engineering Club
 *               slug:
 *                 type: string
 *                 example: fpt-se-club
 *               description:
 *                 type: string
 *               leaderEmail:
 *                 type: string
 *                 description: Email của sinh viên sẽ làm Leader (User phải tồn tại trước)
 *                 example: student1@fpt.edu.vn
 *     responses:
 *       201:
 *         description: Tạo CLB thành công
 *       403:
 *         description: Forbidden (Not Admin)
 *       404:
 *         description: Leader email not found
 */
router.post('/',
    auth.authMiddleWare,
    auth.requireRole('ADMIN'),
    clubController.createClub
);

module.exports = router;
