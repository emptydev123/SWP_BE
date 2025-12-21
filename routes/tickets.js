const express = require('express');
const router = express.Router();
const ticketsController = require('../controller/TicketsController');
const auth = require('../middlewares/auth');

/**
 * @swagger
 * tags:
 *   name: Tickets
 *   description: Ticket Management
 */

/**
 * @swagger
 * /api/tickets/my-tickets:
 *   get:
 *     summary: Get user's tickets (Authenticated User)
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: eventId
 *         schema:
 *           type: string
 *         description: Filter tickets by event ID (optional)
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: List of user's tickets
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
 *                   properties:
 *                     tickets:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           qrCode:
 *                             type: string
 *                           ticketType:
 *                             type: string
 *                           price:
 *                             type: integer
 *                           status:
 *                             type: string
 *                             enum: [INIT, RESERVED, PAID, CANCELLED, USED, EXPIRED]
 *                           purchasedAt:
 *                             type: string
 *                             format: date-time
 *                           assignedAt:
 *                             type: string
 *                             format: date-time
 *                           usedAt:
 *                             type: string
 *                             format: date-time
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           event:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               title:
 *                                 type: string
 *                               description:
 *                                 type: string
 *                               type:
 *                                 type: string
 *                                 enum: [PUBLIC, INTERNAL]
 *                               pricingType:
 *                                 type: string
 *                                 enum: [FREE, PAID]
 *                               startTime:
 *                                 type: string
 *                                 format: date-time
 *                               endTime:
 *                                 type: string
 *                                 format: date-time
 *                               location:
 *                                 type: string
 *                               format:
 *                                 type: string
 *                                 enum: [ONLINE, OFFLINE]
 *                               isActive:
 *                                 type: boolean
 *                               club:
 *                                 type: object
 *                                 properties:
 *                                   id:
 *                                     type: string
 *                                   name:
 *                                     type: string
 *                                   slug:
 *                                     type: string
 *                                   logoUrl:
 *                                     type: string
 *                           transaction:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: string
 *                               status:
 *                                 type: string
 *                               paymentMethod:
 *                                 type: string
 *                               createdAt:
 *                                 type: string
 *                                 format: date-time
 *                     total:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/my-tickets',
    auth.authMiddleWare,
    ticketsController.getUserTickets
);

/**
 * @swagger
 * /api/tickets/{ticketId}:
 *   get:
 *     summary: Get ticket detail by ID (Authenticated User - Owner Only)
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *         description: Ticket ID
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Ticket detail
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
 *                   properties:
 *                     id:
 *                       type: string
 *                     qrCode:
 *                       type: string
 *                     ticketType:
 *                       type: string
 *                     price:
 *                       type: integer
 *                     status:
 *                       type: string
 *                       enum: [INIT, RESERVED, PAID, CANCELLED, USED, EXPIRED]
 *                     purchasedAt:
 *                       type: string
 *                       format: date-time
 *                     assignedAt:
 *                       type: string
 *                       format: date-time
 *                     usedAt:
 *                       type: string
 *                       format: date-time
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     event:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         title:
 *                           type: string
 *                         description:
 *                           type: string
 *                         type:
 *                           type: string
 *                         pricingType:
 *                           type: string
 *                         price:
 *                           type: integer
 *                         capacity:
 *                           type: integer
 *                         startTime:
 *                           type: string
 *                           format: date-time
 *                         endTime:
 *                           type: string
 *                           format: date-time
 *                         location:
 *                           type: string
 *                         format:
 *                           type: string
 *                         isActive:
 *                           type: boolean
 *                         visibleFrom:
 *                           type: string
 *                           format: date-time
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         club:
 *                           type: object
 *                         createdBy:
 *                           type: object
 *                     transaction:
 *                       type: object
 *                       nullable: true
 *                     user:
 *                       type: object
 *                     checkins:
 *                       type: array
 *                       items:
 *                         type: object
 *                     isCheckedIn:
 *                       type: boolean
 *                     lastCheckin:
 *                       type: object
 *                       nullable: true
 *       403:
 *         description: Forbidden - Not ticket owner
 *       404:
 *         description: Ticket not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/:ticketId',
    auth.authMiddleWare,
    ticketsController.getTicketDetail
);

module.exports = router;

