const express = require('express');
const router = express.Router();
const clubController = require('../controller/ClubController');
const auth = require('../middlewares/auth');
const upload = require('../middlewares/upload');

/**
 * @swagger
 * tags:
 *   name: Clubs
 *   description: Quản lý CLB
 */

/**
 * @swagger
 * /api/clubs:
 *   get:
 *     summary: Lấy danh sách tất cả CLB (Public)
 *     tags: [Clubs]
 *     responses:
 *       200:
 *         description: Danh sách CLB
 */
router.get('/',
    auth.authMiddleWare,
    auth.requireRole("ADMIN", "USER"),
    clubController.getAllClubs);

/**
 * @swagger
 * /api/clubs/{slug}:
 *   get:
 *     summary: Xem chi tiết CLB theo Slug hoặc ID
 *     tags: [Clubs]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Slug hoặc ID của CLB
 *     responses:
 *       200:
 *         description: Thông tin chi tiết CLB
 *       404:
 *         description: Không tìm thấy CLB
 */
router.get('/:slug',
    auth.authMiddleWare,
    auth.requireRole('USER', "ADMIN"),
    clubController.getClubDetail);

/**
 * @swagger
 * /api/clubs:
 *   post:
 *     summary: Tạo CLB mới với import Excel (Admin Only)
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
 *                 description: File Excel chứa danh sách members. Các cột bắt buộc - email, student_code, phone, email_verified, role, is_leader, full_name
 *               name:
 *                 type: string
 *                 description: Tên club
 *                 example: FPT Software Engineering Club
 *               slug:
 *                 type: string
 *                 description: Slug của club (tùy chọn)
 *                 example: fpt-se-club
 *               description:
 *                 type: string
 *                 description: Mô tả club
 *                 example: Câu lạc bộ lập trình FPT
 *               logoUrl:
 *                 type: string
 *                 description: URL logo club
 *                 example: https://example.com/logo.png
 *     responses:
 *       201:
 *         description: Tạo CLB thành công
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
 *         description: Lỗi validate hoặc file Excel không hợp lệ
 *       403:
 *         description: Forbidden (Not Admin)
 */
router.post('/',
    auth.authMiddleWare,
    auth.requireRole('ADMIN'),
    upload.single('excelFile'),
    clubController.createClub
);

// Club Applications Routes
const applicationController = require('../controller/ClubApplicationController');

/**
 * @swagger
 * /api/clubs/{clubId}/apply:
 *   post:
 *     summary: User xin tham gia club
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
 *                 description: Thông tin bổ sung (tùy chọn)
 *     responses:
 *       201:
 *         description: Đơn xin tham gia đã được gửi
 *       400:
 *         description: Đã có đơn xin tham gia hoặc đã là thành viên
 */
router.post('/:clubId/apply',
    auth.authMiddleWare,
    auth.requireRole('USER', 'ADMIN'),
    applicationController.applyToClub
);

/**
 * @swagger
 * /api/clubs/{clubId}/applications:
 *   get:
 *     summary: Lấy danh sách đơn xin tham gia (Leader only)
 *     tags: [Clubs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clubId
 *         required: true
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, APPROVED, REJECTED]
 *     responses:
 *       200:
 *         description: Danh sách applications
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
 *     summary: Leader duyệt hoặc từ chối đơn xin tham gia (Gom thành 1 API)
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
 *                 description: approve để duyệt, reject để từ chối
 *               reviewNotes:
 *                 type: string
 *                 description: Ghi chú (tùy chọn)
 *     responses:
 *       200:
 *         description: Đơn đã được xử lý (duyệt hoặc từ chối)
 *       400:
 *         description: Club có tính phí (nếu approve) hoặc đơn đã được xử lý
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
 *     summary: Leader cấu hình phí tham gia club
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
 *                 description: Bật/tắt tính phí tham gia
 *               membershipFeeAmount:
 *                 type: integer
 *                 description: Số tiền phí tham gia (nếu bật tính phí)
 *     responses:
 *       200:
 *         description: Cấu hình đã được cập nhật
 *       403:
 *         description: Chỉ leader mới có quyền
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
 *     summary: Leader chuyển quyền leader cho member khác
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
 *                 description: ID của user sẽ trở thành leader mới
 *     responses:
 *       200:
 *         description: Leader đã được cập nhật thành công
 *       400:
 *         description: User mới chưa là member hoặc đã là leader
 *       403:
 *         description: Chỉ leader hiện tại mới có quyền
 *       404:
 *         description: Club hoặc user không tồn tại
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
 *     summary: Leader update role của member trong club
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
 *                 description: Role mới cho member (không thể set LEADER qua API này)
 *     responses:
 *       200:
 *         description: Role đã được cập nhật thành công
 *       400:
 *         description: Role không hợp lệ hoặc không thể update role của leader
 *       403:
 *         description: Chỉ leader mới có quyền
 *       404:
 *         description: Club hoặc membership không tồn tại
 */
router.patch('/:clubId/memberships/:membershipId/role',
    auth.authMiddleWare,
    auth.requireRole('USER', 'ADMIN'),
    auth.requireClubLeader,
    clubController.updateMemberRole
);

module.exports = router;
