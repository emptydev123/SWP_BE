var express = require('express');
var router = express.Router();
const user = require('../controller/UserController');
const auth = require('../middlewares/auth');

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User Management
 */

/**
 * @swagger
 * /api/users/register:
 *   post:
 *     summary: Register new account (SCMS)
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
 *                 example: John Doe
 *               studentCode:
 *                 type: string
 *                 example: SE171218
 *               phone:
 *                 type: string
 *                 example: 0907057587
 *     responses:
 *       200:
 *         description: Registration successful
 *       400:
 *         description: Validation error or email already exists
 */
router.post('/register', user.registerUser);

/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: Login with Email (SCMS)
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
 *         description: Login successful, returns accessToken
 *       400:
 *         description: Invalid email or password
 */
router.post('/login', user.login);

/**
 * @swagger
 * /api/users/login-with-google:
 *   post:
 *     summary: Login with Google OAuth (for existing users)
 *     tags: [Users]
 *     description: |
 *       User has logged in with Google via Supabase, FE sends email to BE to create JWT token.
 *       Only applies to users already registered in the system (email exists in users table).
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
 *                 description: Email from Google OAuth (verified by Supabase)
 *                 example: student@university.edu.vn
 *     responses:
 *       200:
 *         description: Login successful, returns accessToken
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
 *         description: Email not registered in system
 *       403:
 *         description: Account has been disabled
 */
router.post('/login-with-google', user.loginWithGoogle);

/**
 * @swagger
 * /api/users/getprofile:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
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
 *     summary: Update current user profile
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
 *                 example: "John Doe"
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
 *         description: Profile updated successfully
 *       400:
 *         description: No update data or studentCode already exists
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
 *     summary: Get all users (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List retrieved successfully
 *       403:
 *         description: Forbidden (Not Admin)
 */
router.get('/getallprofile', auth.authMiddleWare,
    auth.requireRole('ADMIN'),
    user.getAllProfileUsers
);
module.exports = router;
