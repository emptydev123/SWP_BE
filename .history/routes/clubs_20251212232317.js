const express = require('express');
const router = express.Router();
const clubController = require('../controller/ClubController');
const auth = require('../middlewares/auth');

/**
 * @swagger
 * tags:
 *   name: Clubs
 *   description: Club management
 */

/**
 * @swagger
 * /api/clubs:
 *   get:
 *     summary: Get all clubs list (Public)
 *     tags: [Clubs]
 *     responses:
 *       200:
 *         description: List of clubs
 */
router.get('/', clubController.getAllClubs);

/**
 * @swagger
 * /api/clubs/{slug}:
 *   get:
 *     summary: Get club details by Slug or ID
 *     tags: [Clubs]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Club slug or ID
 *     responses:
 *       200:
 *         description: Club details
 *       404:
 *         description: Club not found
 */
router.get('/:slug', clubController.getClubDetail);

/**
 * @swagger
 * /api/clubs:
 *   post:
 *     summary: Create new club (Admin Only)
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
 *                 description: Email of student who will be Leader (User must exist first)
 *                 example: student1@fpt.edu.vn
 *     responses:
 *       201:
 *         description: Club created successfully
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
