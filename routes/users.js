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
 *     summary: Đăng ký tài khoản mới
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *               - email
 *             properties:
 *               username:
 *                 type: string
 *                 example: customer1
 *               password:
 *                 type: string
 *                 example: 123456
 *               phoneNumber:
 *                 type: string
 *                 example: 0907057587
 *               email:
 *                 type: string
 *                 example: huynhtrantam13@gmail.com
 *               fullName:
 *                 type: string
 *                 example: Huỳnh Trấn Tâm
 *     responses:
 *       200:
 *         description: Đăng ký thành công
 *       400:
 *         description: Lỗi validate
 */
router.post('/register', user.registerUser);

/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: Đăng nhập để lấy JWT token
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: customer1
 *               password:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       200:
 *         description: Đăng nhập thành công, trả về accessToken 
 *       401:
 *         description: Sai username hoặc password
 */
router.post('/login', user.login);

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
 *         description: Unauthorized / Token invalid
 *       404:
 *         description: Profile không tìm thấy
 */
router.get('/getprofile', auth.authMiddleWare,
    auth.requireRole('customer', 'staff', 'admin'),
    user.getProfileUser
);

/**
 * @swagger
 * /api/users/getallprofile:
 *   get:
 *     summary: Lấy tất cả user (chỉ admin)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách users thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                 count:
 *                   type: integer
 *                   example: 10
 *       401:
 *         description: Unauthorized / Token invalid
 *       403:
 *         description: Forbidden (không phải admin)
 */
router.get('/getallprofile', auth.authMiddleWare,
    auth.requireRole('admin',),
    user.getAllProfileUsers
);
module.exports = router;
