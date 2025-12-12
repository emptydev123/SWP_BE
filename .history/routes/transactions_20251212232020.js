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
 * /api/transactions/create-payment:
 *   post:
 *     summary: Tạo payment link chung cho tất cả loại thanh toán
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
 *               - type
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [MEMBERSHIP, EVENT_TICKET]
 *                 description: Loại transaction
 *                 example: "MEMBERSHIP"
 *               membershipId:
 *                 type: string
 *                 description: ID của membership (bắt buộc nếu type = MEMBERSHIP)
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *               eventId:
 *                 type: string
 *                 description: ID của event (bắt buộc nếu type = EVENT_TICKET)
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *               ticketType:
 *                 type: string
 *                 description: Loại vé (chỉ dùng khi type = EVENT_TICKET)
 *                 example: "STANDARD"
 *               quantity:
 *                 type: number
 *                 description: Số lượng vé (chỉ dùng khi type = EVENT_TICKET, 1-10)
 *                 default: 1
 *                 example: 1
 *     responses:
 *       200:
 *         description: Tạo payment link thành công
 *       400:
 *         description: Lỗi validate
 *       403:
 *         description: Không có quyền thanh toán
 *       404:
 *         description: Không tìm thấy membership/event
 */
router.post(
    '/create-payment',
    auth.authMiddleWare,
    transactionController.createPayment
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