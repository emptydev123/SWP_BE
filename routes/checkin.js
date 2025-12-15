const express = require('express');
const router = express.Router();
const checkinController = require('../controller/CheckinController');
const auth = require('../middlewares/auth');

/**
 * @swagger
 * tags:
 *   name: Check-in
 *   description: Event Check-in Management
 */

/**
 * @swagger
 * /api/checkin/qr:
 *   post:
 *     summary: Check-in by QR code (for OFFLINE events)
 *     tags: [Check-in]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - qrCode
 *             properties:
 *               qrCode:
 *                 type: string
 *                 description: QR code from user's ticket
 *                 example: "EVENT_ID|TICKET_ID"
 *     responses:
 *       200:
 *         description: Check-in successful or already checked in
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Ticket not found
 */
router.post('/qr',
    auth.authMiddleWare,
    checkinController.checkinByQRCode
);

/**
 * @swagger
 * /api/checkin/email:
 *   post:
 *     summary: Check-in by email (for ONLINE events)
 *     tags: [Check-in]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - eventId
 *               - email
 *             properties:
 *               eventId:
 *                 type: string
 *                 description: Event ID
 *               email:
 *                 type: string
 *                 description: Email of the user to check-in
 *                 example: "student@university.edu.vn"
 *     responses:
 *       200:
 *         description: Check-in successful or already checked in
 *       400:
 *         description: Invalid request
 *       404:
 *         description: User not found or not registered
 */
router.post('/email',
    auth.authMiddleWare,
    checkinController.checkinByEmail
);

/**
 * @swagger
 * /api/checkin/event/{eventId}/participants:
 *   get:
 *     summary: Get list of event participants
 *     tags: [Check-in]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *       - in: query
 *         name: checkedIn
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Filter by check-in status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by email, name or student code
 *     responses:
 *       200:
 *         description: List of participants
 *       404:
 *         description: Event not found
 */
router.get('/event/:eventId/participants',
    auth.authMiddleWare,
    checkinController.getEventParticipants
);

module.exports = router;

