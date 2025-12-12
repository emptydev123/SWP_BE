var express = require('express');
var router = express.Router();
const transactionController = require('../controller/TransactionsController');
const auth = require('../middlewares/auth');

/**
 * @swagger
 * tags:
 *   name: Transactions
 *   description: Quản lý giao dịch thanh toán PayOS
 */

/**
 * @swagger
 * /api/transactions/membership-payment:
 *   post:
 *     summary: Tạo payment link cho phí gia nhập CLB
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - membershipId
 *             properties:
 *               membershipId:
 *                 type: string
 *                 description: ID của membership cần thanh toán
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Tạo payment link thành công
 *       400:
 *         description: Lỗi validate hoặc CLB không yêu cầu phí
 *       403:
 *         description: Không có quyền thanh toán
 *       404:
 *         description: Không tìm thấy membership
 */
router.post(
    '/membership-payment',
    auth.authMiddleWare,
    transactionController.createMembershipPayment
);

/**
 * @swagger
 * /api/transactions/event-ticket-payment:
 *   post:
 *     summary: Tạo payment link cho mua vé event
 *     tags: [Transactions]
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
 *             properties:
 *               eventId:
 *                 type: string
 *                 description: ID của event
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *               ticketType:
 *                 type: string
 *                 description: Loại vé (VIP, STANDARD, etc.)
 *                 example: "STANDARD"
 *               quantity:
 *                 type: number
 *                 description: Số lượng vé (1-10)
 *                 default: 1
 *                 example: 1
 *     responses:
 *       200:
 *         description: Tạo payment link thành công
 *       400:
 *         description: Lỗi validate hoặc event không tính phí
 *       404:
 *         description: Không tìm thấy event
 */
router.post(
    '/event-ticket-payment',
    auth.authMiddleWare,
    transactionController.createEventTicketPayment
);

/**
 * @swagger
 * /api/transactions/webhook:
 *   post:
 *     summary: Webhook endpoint từ PayOS (không cần auth)
 *     tags: [Transactions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       401:
 *         description: Invalid signature
 */
router.post(
    '/webhook',
    transactionController.handleWebhook
);

/**
 * @swagger
 * /api/transactions/return:
 *   get:
 *     summary: Return URL sau khi thanh toán thành công
 *     tags: [Transactions]
 *     parameters:
 *       - in: query
 *         name: orderCode
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Return URL processed
 */
router.get(
    '/return',
    transactionController.handleReturn
);

/**
 * @swagger
 * /api/transactions/cancel:
 *   get:
 *     summary: Cancel URL khi user hủy thanh toán
 *     tags: [Transactions]
 *     parameters:
 *       - in: query
 *         name: orderCode
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cancel URL processed
 */
router.get(
    '/cancel',
    transactionController.handleCancel
);

/**
 * @swagger
 * /api/transactions/{transactionId}:
 *   get:
 *     summary: Lấy thông tin transaction
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thông tin transaction
 *       403:
 *         description: Không có quyền xem
 *       404:
 *         description: Không tìm thấy transaction
 */
router.get(
    '/:transactionId',
    auth.authMiddleWare,
    transactionController.getTransaction
);