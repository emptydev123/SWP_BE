var express = require('express');
var router = express.Router();
const clubController = require('../controller/ClubController');
const auth = require('../middlewares/auth');

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin-only operations
 */

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     summary: Get system-wide statistics for admin dashboard
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalClubs:
 *                       type: integer
 *                     newEventsThisMonth:
 *                       type: integer
 *                     activeMembers:
 *                       type: integer
 *                     newUsersThisMonth:
 *                       type: integer
 *                     eventsThisMonth:
 *                       type: integer
 *                     upcomingEvents:
 *                       type: integer
 *                     growthData:
 *                       type: array
 *       403:
 *         description: Admin access required
 */
router.get('/stats',
    auth.authMiddleWare,
    clubController.getAdminStats
);

module.exports = router;

