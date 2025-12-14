const express = require('express');
const router = express.Router();
const eventsController = require('../controller/EventsController');
const auth = require('../middlewares/auth');

/**
 * @swagger
 * tags:
 *   name: Events
 *   description: Event Management
 */

/**
 * @swagger
 * /api/events:
 *   get:
 *     summary: Get list of events (Public)
 *     tags: [Events]
 *     parameters:
 *       - in: query
 *         name: clubId
 *         schema:
 *           type: string
 *         description: Filter by clubId
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [PUBLIC, INTERNAL]
 *         description: Filter by event type
 *       - in: query
 *         name: pricingType
 *         schema:
 *           type: string
 *           enum: [FREE, PAID]
 *         description: Filter by pricing type
 *     responses:
 *       200:
 *         description: List of events
 */
router.get('/', eventsController.getAllEvents);

/**
 * @swagger
 * /api/events/{eventId}:
 *   get:
 *     summary: Get event details
 *     tags: [Events]
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event details
 *       403:
 *         description: No permission (INTERNAL events require club membership)
 *       404:
 *         description: Event not found
 */
router.get('/:eventId', eventsController.getEventDetail);

/**
 * @swagger
 * /api/events:
 *   post:
 *     summary: Create new event (Club Leader Only)
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - clubId
 *               - title
 *               - type
 *               - pricingType
 *             properties:
 *               clubId:
 *                 type: string
 *                 description: Club ID
 *               title:
 *                 type: string
 *                 example: Workshop React Native
 *               description:
 *                 type: string
 *                 example: Basic React Native workshop
 *               type:
 *                 type: string
 *                 enum: [PUBLIC, INTERNAL]
 *                 description: PUBLIC = public event, INTERNAL = club members only
 *                 example: PUBLIC
 *               pricingType:
 *                 type: string
 *                 enum: [FREE, PAID]
 *                 description: FREE = free event, PAID = paid event
 *                 example: PAID
 *               price:
 *                 type: integer
 *                 description: Ticket price (VND), required if pricingType = PAID
 *                 example: 50000
 *               capacity:
 *                 type: integer
 *                 description: Maximum number of tickets (optional)
 *                 example: 100
 *               startTime:
 *                 type: string
 *                 format: date-time
 *                 description: Event start time
 *                 example: 2024-12-25T10:00:00Z
 *               endTime:
 *                 type: string
 *                 format: date-time
 *                 description: Event end time
 *                 example: 2024-12-25T12:00:00Z
 *               location:
 *                 type: string
 *                 description: Event location (required if format is OFFLINE, not allowed if format is ONLINE)
 *                 example: Room A101
 *               format:
 *                 type: string
 *                 enum: [ONLINE, OFFLINE]
 *                 description: Event format - ONLINE for online events, OFFLINE for offline events. Default is OFFLINE
 *                 example: OFFLINE
 *               onlineLink:
 *                 type: string
 *                 description: Google Meet link (required if format is ONLINE, not allowed if format is OFFLINE)
 *                 example: https://meet.google.com/abc-defg-hij
 *               visibleFrom:
 *                 type: string
 *                 format: date-time
 *                 description: Event visibility start time (optional)
 *                 example: 2024-12-20T00:00:00Z
 *     responses:
 *       201:
 *         description: Event created successfully
 *       400:
 *         description: Invalid data
 *       403:
 *         description: No permission (club leader only)
 *       404:
 *         description: Club not found
 */
router.post('/',
    auth.authMiddleWare,
    auth.requireClubLeader,
    eventsController.createEvent
);

/**
 * @swagger
 * /api/events/{eventId}:
 *   put:
 *     summary: Update event (Club Leader Only)
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [PUBLIC, INTERNAL]
 *               pricingType:
 *                 type: string
 *                 enum: [FREE, PAID]
 *               price:
 *                 type: integer
 *               capacity:
 *                 type: integer
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               location:
 *                 type: string
 *               format:
 *                 type: string
 *                 enum: [ONLINE, OFFLINE]
 *                 description: Event format - ONLINE for online events, OFFLINE for offline events
 *               onlineLink:
 *                 type: string
 *                 description: Google Meet link (required if format is ONLINE)
 *               visibleFrom:
 *                 type: string
 *                 format: date-time
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Event updated successfully
 *       403:
 *         description: No permission
 *       404:
 *         description: Event not found
 */
router.put('/:eventId',
    auth.authMiddleWare,
    eventsController.updateEvent
);

/**
 * @swagger
 * /api/events/{eventId}:
 *   delete:
 *     summary: Delete event (Club Leader Only) - Soft delete
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event deleted successfully
 *       403:
 *         description: No permission
 *       404:
 *         description: Event not found
 */
router.delete('/:eventId',
    auth.authMiddleWare,
    eventsController.deleteEvent
);

/**
 * @swagger
 * /api/events/{eventId}/register:
 *   post:
 *     summary: Register for event (FREE or PAID)
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quantity:
 *                 type: integer
 *                 description: Number of tickets (1-10)
 *                 example: 1
 *                 default: 1
 *               ticketType:
 *                 type: string
 *                 description: Ticket type (optional)
 *                 example: STANDARD
 *     responses:
 *       200:
 *         description: Registration successful
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
 *                   description: For FREE events, returns QR codes. For PAID events, returns payment link.
 *       400:
 *         description: Invalid request or event full
 *       404:
 *         description: Event not found
 */
router.post('/:eventId/register',
    auth.authMiddleWare,
    eventsController.registerEvent
);

module.exports = router;

