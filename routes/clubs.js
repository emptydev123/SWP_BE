const express = require('express');
const router = express.Router();
const clubController = require('../controller/ClubController');
const eventsController = require('../controller/EventsController');
const auth = require('../middlewares/auth');
const upload = require('../middlewares/upload');

/**
 * @swagger
 * tags:
 *   name: Clubs
 *   description: Club Management
 */

/**
 * @swagger
 * /api/clubs:
 *   get:
 *     summary: Get list of all clubs (Public) - With pagination
 *     tags: [Clubs]
 *     parameters:
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *           example: 1
 *         description: Page number (starts from 1)
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *           example: 10
 *         description: Number of items per page (max 50)
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *           example: "FPT"
 *         description: Search by name or description
 *       - in: query
 *         name: isActive
 *         required: false
 *         schema:
 *           type: boolean
 *           example: true
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of clubs with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 *                     nextPage:
 *                       type: integer
 *                       nullable: true
 *                     prevPage:
 *                       type: integer
 *                       nullable: true
 */
router.get('/',
    auth.authMiddleWare,
    auth.requireRole("ADMIN", "USER"),
    clubController.getAllClubs);

/**
 * @swagger
 * /api/clubs/{slug}:
 *   get:
 *     summary: View club details by Slug or ID
 *     tags: [Clubs]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Slug or ID of the club
 *     responses:
 *       200:
 *         description: Club details
 *       404:
 *         description: Club not found
 */
router.get('/:slug',
    auth.authMiddleWare,
    auth.requireRole('USER', "ADMIN"),
    clubController.getClubDetail);

/**
 * @swagger
 * /api/clubs/{clubId}/members:
 *   get:
 *     summary: Get list of club members (Only Leader or club members can view, ADMIN can view all)
 *     tags: [Clubs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clubId
 *         required: true
 *         schema:
 *           type: string
 *         description: Club ID
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           example: "ACTIVE"
 *         description: Filter by membership status (e.g. ACTIVE, PENDING_PAYMENT)
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number (starts from 1)
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of items per page (max 100)
 *     responses:
 *       200:
 *         description: List of club members with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *       403:
 *         description: No permission to view club members list
 */
router.get('/:clubId/members',
    auth.authMiddleWare,
    auth.requireRole('USER', 'ADMIN'),
    clubController.getClubMembers);

/**
 * @swagger
 * /api/clubs:
 *   post:
 *     summary: Create new club with Excel import (Admin Only)
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
 *                 description: Excel file containing member list. Required columns - email, student_code, phone, email_verified, role, is_leader, full_name
 *               name:
 *                 type: string
 *                 description: Club name
 *                 example: FPT Software Engineering Club
 *               slug:
 *                 type: string
 *                 description: Club slug (optional)
 *                 example: fpt-se-club
 *               description:
 *                 type: string
 *                 description: Club description
 *                 example: FPT Programming Club
 *               logoUrl:
 *                 type: string
 *                 description: URL logo club
 *                 example: https://example.com/logo.png
 *     responses:
 *       201:
 *         description: Club created successfully
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
 *         description: Validation error or invalid Excel file
 *       403:
 *         description: Forbidden (Not Admin)
 */
router.post('/',
    auth.authMiddleWare,
    auth.requireRole('ADMIN'),
    upload.single('excelFile'),
    clubController.createClub
);

// Admin: update basic club info
router.patch('/:clubId',
    auth.authMiddleWare,
    auth.requireRole('ADMIN'),
    clubController.updateClubBasicInfo
);

// Club Applications Routes
const applicationController = require('../controller/ClubApplicationController');

/**
 * @swagger
 * /api/clubs/{clubId}/apply:
 *   post:
 *     summary: User applies to join club
 *     tags: [Clubs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clubId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               applicationData:
 *                 type: string
 *                 description: Additional information (optional)
 *     responses:
 *       201:
 *         description: Application submitted successfully
 *       400:
 *         description: Application already exists or user is already a member
 */
/**
 * @swagger
 * /api/clubs/applications/my:
 *   get:
 *     summary: Get list of applications that user can view (Leader only sees applications of their club) - With pagination
 *     tags: [Clubs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [PENDING, APPROVED, REJECTED]
 *           example: "PENDING"
 *         description: Filter by status
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *           example: 1
 *         description: Page number (starts from 1)
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *           example: 10
 *         description: Number of items per page (max 100)
 *     responses:
 *       200:
 *         description: List of applications that user can view with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 *                     nextPage:
 *                       type: integer
 *                       nullable: true
 *                     prevPage:
 *                       type: integer
 *                       nullable: true
 */
router.get('/applications/my',
    auth.authMiddleWare,
    auth.requireRole('USER', 'ADMIN'),
    applicationController.getMyApplications
);

router.post('/:clubId/apply',
    auth.authMiddleWare,
    auth.requireRole('USER', 'ADMIN'),
    applicationController.applyToClub
);

/**
 * @swagger
 * /api/clubs/{clubId}/applications:
 *   get:
 *     summary: Get list of applications (Leader only) - With pagination
 *     tags: [Clubs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clubId
 *         required: true
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [PENDING, APPROVED, REJECTED]
 *           example: "PENDING"
 *         description: Filter by status
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *           example: 1
 *         description: Page number (starts from 1)
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *           example: 10
 *         description: Number of items per page (max 100)
 *     responses:
 *       200:
 *         description: List of applications with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 *                     nextPage:
 *                       type: integer
 *                       nullable: true
 *                     prevPage:
 *                       type: integer
 *                       nullable: true
 */
router.get('/:clubId/applications',
    auth.authMiddleWare,
    auth.requireRole('USER', 'ADMIN'),
    auth.requireClubLeader,
    applicationController.getClubApplications
);

/**
 * @swagger
 * /api/clubs/{clubId}/applications/{applicationId}/review:
 *   post:
 *     summary: Leader approves or rejects application (Combined into 1 API)
 *     tags: [Clubs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clubId
 *         required: true
 *       - in: path
 *         name: applicationId
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [approve, reject]
 *                 description: approve to approve, reject to reject
 *               reviewNotes:
 *                 type: string
 *                 description: Notes (optional)
 *     responses:
 *       200:
 *         description: Application processed (approved or rejected)
 *       400:
 *         description: Club has membership fee (if approve) or application already processed
 */
router.post('/:clubId/applications/:applicationId/review',
    auth.authMiddleWare,
    auth.requireRole('USER', 'ADMIN'),
    auth.requireClubLeader,
    applicationController.reviewApplication
);

/**
 * @swagger
 * /api/clubs/{clubId}/config-membership-fee:
 *   patch:
 *     summary: Leader configures club membership fee
 *     tags: [Clubs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clubId
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - membershipFeeEnabled
 *             properties:
 *               membershipFeeEnabled:
 *                 type: boolean
 *                 description: Enable/disable membership fee
 *               membershipFeeAmount:
 *                 type: integer
 *                 description: Membership fee amount (if fee is enabled)
 *     responses:
 *       200:
 *         description: Configuration updated successfully
 *       403:
 *         description: Only leader has permission
 */
router.patch('/:clubId/config-membership-fee',
    auth.authMiddleWare,
    auth.requireRole('USER', 'ADMIN'),
    auth.requireClubLeader,
    clubController.configMembershipFee
);

/**
 * @swagger
 * /api/clubs/{clubId}/update-leader:
 *   patch:
 *     summary: Leader transfers leadership to another member
 *     tags: [Clubs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clubId
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newLeaderUserId
 *             properties:
 *               newLeaderUserId:
 *                 type: string
 *                 description: ID of user who will become the new leader
 *     responses:
 *       200:
 *         description: Leader updated successfully
 *       400:
 *         description: New user is not a member or is already a leader
 *       403:
 *         description: Only current leader has permission
 *       404:
 *         description: Club or user not found
 */
router.patch('/:clubId/update-leader',
    auth.authMiddleWare,
    auth.requireRole('USER', 'ADMIN'),
    auth.requireClubLeader,
    clubController.updateClubLeader
);

/**
 * @swagger
 * /api/clubs/{clubId}/memberships/{membershipId}/role:
 *   patch:
 *     summary: Leader updates member role in club
 *     tags: [Clubs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clubId
 *         required: true
 *       - in: path
 *         name: membershipId
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [MEMBER, STAFF, TREASURER, ADMIN]
 *                 description: New role for member (cannot set LEADER via this API)
 *     responses:
 *       200:
 *         description: Role updated successfully
 *       400:
 *         description: Invalid role or cannot update leader role
 *       403:
 *         description: Only leader has permission
 *       404:
 *         description: Club or membership not found
 */
router.patch('/:clubId/memberships/:membershipId/role',
    auth.authMiddleWare,
    auth.requireRole('USER', 'ADMIN'),
    auth.requireClubLeader,
    clubController.updateMemberRole
);

/**
 * @swagger
 * /api/clubs/{clubId}/monthly-stats:
 *   get:
 *     summary: Get monthly income and expense statistics (Treasurer/Admin only)
 *     tags: [Clubs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clubId
 *         required: true
 *         schema:
 *           type: string
 *         description: Club ID
 *     responses:
 *       200:
 *         description: Monthly statistics retrieved successfully
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
 *                     monthlyIncome:
 *                       type: number
 *                       description: Total income for current month
 *                     monthlyExpense:
 *                       type: number
 *                       description: Total expense for current month
 *                     balance:
 *                       type: number
 *                       description: Total club balance (all time)
 *       403:
 *         description: No permission (Treasurer or Admin only)
 *       404:
 *         description: Club not found
 */
router.get('/:clubId/monthly-stats',
    auth.authMiddleWare,
    eventsController.getMonthlyStats
);

/**
 * @swagger
 * /api/clubs/{clubId}/chart-data:
 *   get:
 *     summary: Get chart data for income/expense over time and income distribution (Treasurer/Admin only)
 *     tags: [Clubs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clubId
 *         required: true
 *         schema:
 *           type: string
 *         description: Club ID
 *     responses:
 *       200:
 *         description: Chart data retrieved successfully
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
 *                     incomeExpenseOverTime:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           month:
 *                             type: string
 *                           income:
 *                             type: number
 *                           expense:
 *                             type: number
 *                     incomeDistribution:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           value:
 *                             type: number
 *                           color:
 *                             type: string
 *       403:
 *         description: No permission (Treasurer or Admin only)
 *       404:
 *         description: Club not found
 */
router.get('/:clubId/chart-data',
    auth.authMiddleWare,
    eventsController.getChartData
);

/**
 * @swagger
 * /api/clubs/{clubId}/ledger:
 *   get:
 *     summary: Get ledger entries for a club (Treasurer/Admin only)
 *     tags: [Clubs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clubId
 *         required: true
 *         schema:
 *           type: string
 *         description: Club ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [INCOME, EXPENSE]
 *         description: Filter by transaction type
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter from date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter to date (YYYY-MM-DD)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Ledger entries retrieved successfully
 *       403:
 *         description: No permission (Treasurer or Admin only)
 */
router.get('/:clubId/ledger',
    auth.authMiddleWare,
    eventsController.getClubLedgerEntries
);

/**
 * @swagger
 * /api/clubs/{clubId}/transactions:
 *   get:
 *     summary: Get PayOS transactions for a club (Treasurer/Admin only)
 *     tags: [Clubs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clubId
 *         required: true
 *         schema:
 *           type: string
 *         description: Club ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [MEMBERSHIP, EVENT_TICKET, TOPUP, REFUND, FUND_REQ]
 *         description: Filter by transaction type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, SUCCESS, FAILED, CANCELLED, REFUNDED]
 *         description: Filter by transaction status
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter from date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter to date (YYYY-MM-DD)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully
 *       403:
 *         description: No permission (Treasurer or Admin only)
 */
router.get('/:clubId/transactions',
    auth.authMiddleWare,
    eventsController.getClubTransactions
);

/**
 * @swagger
 * /api/clubs/{clubId}/reports/export:
 *   post:
 *     summary: Export financial report for a club (Treasurer/Admin only)
 *     tags: [Clubs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clubId
 *         required: true
 *         schema:
 *           type: string
 *         description: Club ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reportType
 *               - startDate
 *               - endDate
 *             properties:
 *               reportType:
 *                 type: string
 *                 enum: [income-statement, expense-report, balance-sheet, transaction-summary]
 *                 description: Type of report
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: Start date (YYYY-MM-DD)
 *               endDate:
 *                 type: string
 *                 format: date
 *                 description: End date (YYYY-MM-DD)
 *               format:
 *                 type: string
 *                 enum: [excel, csv, pdf]
 *                 default: excel
 *                 description: Export format
 *     responses:
 *       200:
 *         description: Report file
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *           text/csv:
 *             schema:
 *               type: string
 *       403:
 *         description: No permission (Treasurer or Admin only)
 */
router.post('/:clubId/reports/export',
    auth.authMiddleWare,
    eventsController.exportReport
);

module.exports = router;
