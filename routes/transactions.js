var express = require('express');
var router = express.Router();
const transactionController = require('../controller/TransactionsController');
const auth = require('../middlewares/auth');

/**
 * @swagger
 * tags:
 *   name: Transactions
 *   description: PayOS payment transaction management
 */

/**
 * @swagger
 * /api/transactions/create-payment:
 *   post:
 *     summary: Create payment link for all transaction types
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
 *                 description: Transaction type
 *                 example: "MEMBERSHIP"
 *               clubId:
 *                 type: string
 *                 description: Club ID (required if type = MEMBERSHIP)
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *               eventId:
 *                 type: string
 *                 description: Event ID (required if type = EVENT_TICKET)
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *               ticketType:
 *                 type: string
 *                 description: Ticket type (only used when type = EVENT_TICKET)
 *                 example: "STANDARD"
 *               quantity:
 *                 type: number
 *                 description: Number of tickets (only used when type = EVENT_TICKET, 1-10)
 *                 default: 1
 *                 example: 1
 *     responses:
 *       200:
 *         description: Payment link created successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: No permission to make payment
 *       404:
 *         description: Membership/Event not found
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
 *     summary: Webhook endpoint from PayOS (no auth required)
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
 *     summary: Return URL after successful payment
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
 *     summary: Cancel URL when user cancels payment
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
 *     summary: Get transaction information
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
 *         description: Transaction information
 *       403:
 *         description: No permission to view
 *       404:
 *         description: Transaction not found
 */
/**
 * @swagger
 * /api/transactions/my:
 *   get:
 *     summary: Lấy danh sách transactions của user hiện tại (chỉ thấy transaction của chính mình) - Có phân trang
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         required: false
 *         schema:
 *           type: string
 *           enum: [MEMBERSHIP, EVENT_TICKET, TOPUP, REFUND]
 *           example: "MEMBERSHIP"
 *         description: Lọc theo loại transaction
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [PENDING, SUCCESS, FAILED, CANCELLED, REFUNDED]
 *           example: "PENDING"
 *         description: Lọc theo trạng thái
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *           example: 1
 *         description: Số trang (bắt đầu từ 1)
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *           example: 10
 *         description: Số items mỗi trang (tối đa 50)
 *     responses:
 *       200:
 *         description: Danh sách transactions với pagination
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
 */
router.get(
    '/my',
    auth.authMiddleWare,
    transactionController.getMyTransactions
);

router.get(
    '/:transactionId',
    auth.authMiddleWare,
    transactionController.getTransaction
);

/**
 * @swagger
 * /api/transactions/{transactionId}/payment-info:
 *   get:
 *     summary: Lấy payment info (payment link, QR code, orderCode) từ transaction
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
 *         description: Payment info
 *       403:
 *         description: No permission to view
 *       404:
 *         description: Transaction not found
 */
router.get(
    '/:transactionId/payment-info',
    auth.authMiddleWare,
    auth.requireRole("USER", "ADMIN"),
    transactionController.getPaymentInfo
);

/**
 * @swagger
 * /api/transactions/{transactionId}/check-status:
 *   post:
 *     summary: Check and sync payment status from PayOS
 *     description: Kiểm tra trạng thái thanh toán từ PayOS và tự động cập nhật DB nếu đã thanh toán thành công
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
 *         description: Status checked and synced
 *       403:
 *         description: No permission
 *       404:
 *         description: Transaction not found
 */
router.post(
    '/:transactionId/check-status',
    auth.authMiddleWare,
    transactionController.checkAndSyncPaymentStatus
);

/**
 * @swagger
 * /api/transactions/{transactionId}/cancel:
 *   post:
 *     summary: Cancel a pending payment
 *     description: Hủy thanh toán đang chờ. Chỉ user sở hữu transaction mới có quyền hủy.
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
 *         description: Payment cancelled successfully
 *       400:
 *         description: Transaction is not pending
 *       403:
 *         description: No permission
 *       404:
 *         description: Transaction not found
 */
router.post(
    '/:transactionId/cancel',
    auth.authMiddleWare,
    transactionController.cancelPendingPayment
);

module.exports = router;