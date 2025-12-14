const prisma = require('../prisma/client');

/**
 * User request vào club
 */
exports.applyToClub = async (req, res) => {
    try {
        const { clubId } = req.params;
        // Support cả 2 field names: 'introduction' (đúng) và 'applicationData' (tương thích với frontend cũ)
        const introduction = req.body.introduction || req.body.applicationData || null;
        const userId = req.userId;

        console.log('Apply to Club - Request body:', req.body);
        console.log('Apply to Club - Introduction value:', introduction);

        // Kiểm tra club có tồn tại không
        const club = await prisma.club.findUnique({
            where: { id: clubId },
            select: { id: true, name: true, isActive: true }
        });

        if (!club) {
            return res.status(404).json({ success: false, message: "Club không tồn tại" });
        }

        if (!club.isActive) {
            return res.status(400).json({ success: false, message: "Club đã bị vô hiệu hóa" });
        }

        // Kiểm tra user đã có membership chưa
        const existingMembership = await prisma.clubMembership.findUnique({
            where: {
                clubId_userId: {
                    clubId: clubId,
                    userId: userId
                }
            }
        });

        if (existingMembership && existingMembership.status === 'ACTIVE') {
            return res.status(400).json({
                success: false,
                message: "Bạn đã là thành viên của club này"
            });
        }

        // Kiểm tra đã có application pending chưa
        const existingApplication = await prisma.clubApplication.findFirst({
            where: {
                clubId: clubId,
                userId: userId,
                status: 'PENDING'
            }
        });

        if (existingApplication) {
            return res.status(400).json({
                success: false,
                message: "Bạn đã có đơn xin tham gia đang chờ duyệt"
            });
        }

        // Tạo application mới
        const application = await prisma.clubApplication.create({
            data: {
                clubId: clubId,
                userId: userId,
                introduction: introduction || null, // Field đúng là 'introduction'
                status: 'PENDING'
            },
            select: {
                id: true,
                clubId: true,
                userId: true,
                introduction: true, // Đảm bảo select field introduction
                status: true,
                reviewNotes: true,
                createdAt: true,
                reviewedAt: true,
                club: {
                    select: { id: true, name: true }
                },
                user: {
                    select: { id: true, email: true, fullName: true }
                }
            }
        });

        res.status(201).json({
            success: true,
            message: "Đơn xin tham gia đã được gửi thành công",
            data: application
        });

    } catch (error) {
        console.error("Apply to Club Error:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};

/**
 * Leader duyệt hoặc từ chối application (gom thành 1 API)
 * @param {string} action - 'approve' hoặc 'reject'
 */
exports.reviewApplication = async (req, res) => {
    try {
        const { clubId, applicationId } = req.params;
        const { action, reviewNotes } = req.body;
        const userId = req.userId; // Leader ID

        // Validate action
        if (!action || !['approve', 'reject'].includes(action.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: "action phải là 'approve' hoặc 'reject'"
            });
        }

        const isApprove = action.toLowerCase() === 'approve';

        // Kiểm tra application có tồn tại không
        const application = await prisma.clubApplication.findUnique({
            where: { id: applicationId },
            include: {
                club: {
                    select: {
                        id: true,
                        name: true,
                        membershipFeeEnabled: true,
                        membershipFeeAmount: true
                    }
                },
                user: {
                    select: { id: true, email: true, fullName: true }
                }
            }
        });

        if (!application) {
            return res.status(404).json({ success: false, message: "Không tìm thấy đơn xin tham gia" });
        }

        if (application.clubId !== clubId) {
            return res.status(400).json({ success: false, message: "Application không thuộc club này" });
        }

        if (application.status !== 'PENDING') {
            return res.status(400).json({
                success: false,
                message: `Đơn xin tham gia đã được ${application.status === 'APPROVED' ? 'duyệt' : 'từ chối'}`
            });
        }

        // Nếu là reject → chỉ cần update status
        if (!isApprove) {
            const updatedApplication = await prisma.clubApplication.update({
                where: { id: applicationId },
                data: {
                    status: 'REJECTED',
                    reviewedById: userId,
                    reviewNotes: reviewNotes || null,
                    reviewedAt: new Date()
                }
            });

            return res.status(200).json({
                success: true,
                message: "Đơn xin tham gia đã bị từ chối",
                data: updatedApplication
            });
        }

        // Nếu là approve → kiểm tra club có tính phí không
        if (application.club.membershipFeeEnabled) {
            // Club có tính phí - sẽ xử lý sau (cần thanh toán)
            return res.status(400).json({
                success: false,
                message: "Club này có tính phí tham gia. Vui lòng sử dụng luồng thanh toán."
            });
        }

        // Club free - Duyệt và add membership ngay
        const result = await prisma.$transaction(async (tx) => {
            // 1. Update application status
            const updatedApplication = await tx.clubApplication.update({
                where: { id: applicationId },
                data: {
                    status: 'APPROVED',
                    reviewedById: userId,
                    reviewNotes: reviewNotes || null,
                    reviewedAt: new Date()
                }
            });

            // 2. Kiểm tra membership đã tồn tại chưa
            const existingMembership = await tx.clubMembership.findUnique({
                where: {
                    clubId_userId: {
                        clubId: clubId,
                        userId: application.userId
                    }
                }
            });

            let membership;
            if (existingMembership) {
                // Update membership nếu đã tồn tại
                membership = await tx.clubMembership.update({
                    where: { id: existingMembership.id },
                    data: {
                        role: 'MEMBER',
                        status: 'ACTIVE',
                        activatedAt: new Date(),
                        joinedAt: existingMembership.joinedAt || new Date(),
                        assignedById: userId // Set leader ID là người add/approve
                    }
                });
            } else {
                // Tạo membership mới
                membership = await tx.clubMembership.create({
                    data: {
                        clubId: clubId,
                        userId: application.userId,
                        role: 'MEMBER',
                        status: 'ACTIVE',
                        joinedAt: new Date(),
                        activatedAt: new Date(),
                        assignedById: userId // Set leader ID là người add/approve
                    }
                });
            }

            return { application: updatedApplication, membership };
        });

        res.status(200).json({
            success: true,
            message: "Đơn xin tham gia đã được duyệt và thành viên đã được thêm vào club",
            data: result
        });

    } catch (error) {
        console.error("Review Application Error:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};

/**
 * Lấy danh sách applications của club (Leader only)
 */
exports.getClubApplications = async (req, res) => {
    try {
        const { clubId } = req.params;
        const { status } = req.query; // PENDING, APPROVED, REJECTED

        const applications = await prisma.clubApplication.findMany({
            where: {
                clubId: clubId,
                ...(status && { status: status })
            },
            select: {
                id: true,
                clubId: true,
                userId: true,
                introduction: true, // Đảm bảo select field introduction
                status: true,
                reviewNotes: true,
                createdAt: true,
                reviewedAt: true,
                user: {
                    select: {
                        id: true,
                        email: true,
                        fullName: true,
                        studentCode: true,
                        phone: true
                    }
                },
                reviewedBy: {
                    select: {
                        id: true,
                        email: true,
                        fullName: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.status(200).json({
            success: true,
            count: applications.length,
            data: applications
        });

    } catch (error) {
        console.error("Get Club Applications Error:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};

