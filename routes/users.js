var express = require('express');
var router = express.Router();
const user = require('../controller/UserController');
const auth = require('../middlewares/auth');

/**
 * @swagger
 * tags:
 *   name: Users
 *   description:  
 */

/**
 * @swagger
 * /api/users/register:
 *   post:
 *     summary: Đăng ký tài khoản mới (SCMS)
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - fullName
 *             properties:
 *               email:
 *                 type: string
 *                 example: student@university.edu.vn
 *               password:
 *                 type: string
 *                 example: 123456
 *               fullName:
 *                 type: string
 *                 example: Huỳnh Trấn Tâm
 *               studentCode:
 *                 type: string
 *                 example: SE171218
 *               phone:
 *                 type: string
 *                 example: 0907057587
 *     responses:
 *       200:
 *         description: Đăng ký thành công
 *       400:
 *         description: Lỗi validate hoặc email tồn tại
 */
router.post('/register', user.registerUser);

/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: Đăng nhập bằng Email (SCMS)
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: student@university.edu.vn
 *               password:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       200:
 *         description: Login thành công, trả về accessToken
 *       400:
 *         description: Sai email hoặc password
 */
router.post('/login', user.login);

/**
 * @swagger
 * /api/users/login-with-google:
 *   post:
 *     summary: Đăng nhập bằng Google OAuth (cho user đã có trong hệ thống)
 *     tags: [Users]
 *     description: |
 *       User đã login với Google qua Supabase, FE gửi email lên để BE tạo JWT token.
 *       Chỉ áp dụng cho các user đã được đăng ký trong hệ thống (có email trong bảng users).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 description: Email từ Google OAuth (đã được verify bởi Supabase)
 *                 example: student@university.edu.vn
 *     responses:
 *       200:
 *         description: Login thành công, trả về accessToken
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 accessToken:
 *                   type: string
 *                 user:
 *                   type: object
 *       404:
 *         description: Email chưa được đăng ký trong hệ thống
 *       403:
 *         description: Tài khoản đã bị vô hiệu hóa
 */
router.post('/login-with-google', user.loginWithGoogle);

/**
 * @swagger
 * /api/users/getprofile:
 *   get:
 *     summary: Lấy profile của user hiện tại
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy profile thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get('/getprofile', auth.authMiddleWare,
    auth.requireRole('USER', 'ADMIN'), // System Roles
    user.getProfileUser
);

/**
 * @swagger
 * /api/users/profile:
 *   patch:
 *     summary: Cập nhật profile của user hiện tại
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: "Nguyễn Văn A"
 *               phone:
 *                 type: string
 *                 example: "0901234567"
 *               avatarUrl:
 *                 type: string
 *                 example: "https://example.com/avatar.png"
 *               studentCode:
 *                 type: string
 *                 example: "SE123456"
 *     responses:
 *       200:
 *         description: Cập nhật profile thành công
 *       400:
 *         description: Không có dữ liệu cập nhật hoặc studentCode trùng
 *       401:
 *         description: Unauthorized
 */
router.patch('/profile',
    auth.authMiddleWare,
    auth.requireRole('USER', 'ADMIN'),
    user.updateProfileUser
);

/**
 * @swagger
 * /api/users/getallprofile:
 *   get:
 *     summary: Lấy tất cả user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách thành công
 *       403:
 *         description: Forbidden (Not Admin)
 */
router.get('/getallprofile', auth.authMiddleWare,
    auth.requireRole('ADMIN'),
    user.getAllProfileUsers
);

/**
 * @swagger
 * /api/admin/users/{userId}:
 *   patch:
 *     summary: Cập nhật thông tin user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của user cần cập nhật
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: Nguyễn Văn A
 *               email:
 *                 type: string
 *                 example: nguyenvana@fpt.edu.vn
 *               phone:
 *                 type: string
 *                 example: 0901234567
 *               studentCode:
 *                 type: string
 *                 example: SE171234
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Lỗi validate hoặc dữ liệu trùng
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Not Admin)
 *       404:
 *         description: User không tồn tại
 */
router.patch('/admin/users/:userId',
    auth.authMiddleWare,
    auth.requireRole('ADMIN'),
    user.updateUserByAdmin
);

module.exports = router;
