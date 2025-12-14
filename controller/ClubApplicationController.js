const prisma = require('../prisma/client');
const payosService = require('../services/payosService');
const QRCode = require('qrcode');
const { paginateWithWhere } = require('../utils/paginationUtils');

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
            // Club có tính phí - Tạo membership PENDING_PAYMENT và transaction
            try {
                // Tạo orderCode trước (ngoài transaction)
                const orderCode = parseInt(Date.now().toString().slice(-10)) + Math.floor(Math.random() * 1000);

                // Bước 1: Tạo transaction trong DB (không gọi PayOS trong transaction)
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
                        // Update membership với status PENDING_PAYMENT
                        membership = await tx.clubMembership.update({
                            where: { id: existingMembership.id },
                            data: {
                                role: 'MEMBER',
                                status: 'PENDING_PAYMENT',
                                assignedById: userId
                            }
                        });
                    } else {
                        // Tạo membership mới với status PENDING_PAYMENT
                        membership = await tx.clubMembership.create({
                            data: {
                                clubId: clubId,
                                userId: application.userId,
                                role: 'MEMBER',
                                status: 'PENDING_PAYMENT',
                                assignedById: userId
                            }
                        });
                    }

                    // 3. Tạo transaction với status PENDING
                    const transaction = await tx.transaction.create({
                        data: {
                            clubId: clubId,
                            userId: application.userId,
                            type: 'MEMBERSHIP',
                            referenceMembershipId: membership.id,
                            amount: application.club.membershipFeeAmount,
                            currency: 'VND',
                            paymentMethod: 'PAYOS',
                            status: 'PENDING',
                            paymentReference: orderCode.toString()
                        }
                    });

                    return {
                        application: updatedApplication,
                        membership: membership,
                        transaction: transaction
                    };
                }, {
                    maxWait: 10000,
                    timeout: 30000
                });

                // Bước 2: Tạo payment link từ PayOS (SAU KHI transaction commit thành công)
                let paymentResult;
                let qrCodeDataUrl = null;
                try {
                    paymentResult = await payosService.createPaymentLink({
                        orderCode: orderCode,
                        amount: application.club.membershipFeeAmount,
                        description: `Phí CLB: ${application.club.name}`,
                        buyerName: application.user.fullName || application.user.email,
                        buyerEmail: application.user.email,
                        buyerPhone: null,
                        items: [
                            {
                                name: `Phí gia nhập CLB ${application.club.name}`,
                                quantity: 1,
                                price: application.club.membershipFeeAmount
                            }
                        ],
                        expireMinutes: 5 // Expire sau 5 phút
                    });

                    // Generate QR code từ payment link
                    try {
                        qrCodeDataUrl = await QRCode.toDataURL(paymentResult.paymentLink);
                    } catch (qrError) {
                        console.error('Error generating QR code:', qrError);
                    }

                    // Cập nhật transaction với PayOS data
                    await prisma.transaction.update({
                        where: { id: result.transaction.id },
                        data: {
                            payosPayload: JSON.stringify({
                                orderCode: orderCode,
                                checkoutUrl: paymentResult.paymentLink,
                                ...paymentResult.data
                            })
                        }
                    });
                } catch (payosError) {
                    console.error('Error creating PayOS payment link:', payosError);
                    // Nếu lỗi PayOS, vẫn trả về response nhưng không có payment link
                    // Transaction đã được tạo, user có thể tạo lại payment link sau
                    return res.status(200).json({
                        success: true,
                        message: "Đơn xin tham gia đã được duyệt. Lỗi khi tạo payment link, vui lòng thử lại sau.",
                        data: {
                            application: result.application,
                            membership: result.membership,
                            transaction: {
                                id: result.transaction.id,
                                orderCode: orderCode,
                                amount: application.club.membershipFeeAmount,
                                error: "Không thể tạo payment link. Vui lòng thử lại sau."
                            }
                        }
                    });
                }

                res.status(200).json({
                    success: true,
                    message: "Đơn xin tham gia đã được duyệt. Vui lòng thanh toán để hoàn tất việc tham gia club.",
                    data: {
                        application: result.application,
                        membership: result.membership,
                        transaction: {
                            id: result.transaction.id,
                            orderCode: orderCode,
                            amount: application.club.membershipFeeAmount,
                            paymentLink: paymentResult.paymentLink,
                            qrCode: qrCodeDataUrl, // QR code dạng data URL (base64)
                            expiresIn: 5 // Phút
                        }
                    }
                });
                return;
            } catch (txError) {
                console.error("Review Application - Transaction Error:", txError);
                // Nếu lỗi trong transaction, application status vẫn là PENDING
                throw txError; // Re-throw để catch ở ngoài xử lý
            }
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
        console.error("Error stack:", error.stack);
        console.error("Error details:", {
            message: error.message,
            code: error.code,
            meta: error.meta
        });

        // Trả về lỗi chi tiết hơn để debug
        res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error",
            error: process.env.NODE_ENV === 'development' ? {
                message: error.message,
                stack: error.stack,
                code: error.code,
                meta: error.meta
            } : undefined
        });
    }
};

/**
 * Lấy danh sách applications của club (Leader only) - Có phân trang
 */
exports.getClubApplications = async (req, res) => {
    try {
        const { clubId } = req.params;
        const { status } = req.query; // PENDING, APPROVED, REJECTED

        // Build where clause
        const where = {
            clubId: clubId,
            ...(status && { status: status })
        };

        // Sử dụng pagination utility
        const result = await paginateWithWhere(
            prisma.clubApplication,
            where,
            req.query,
            {
                select: {
                    id: true,
                    clubId: true,
                    userId: true,
                    introduction: true,
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
                orderBy: { createdAt: 'desc' },
                defaultLimit: 10,
                maxLimit: 100
            }
        );

        res.status(200).json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error("Get Club Applications Error:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};

/**
 * Lấy danh sách đơn gia nhập mà user có quyền xem
 * - Nếu user là leader của Club A → thấy đơn gia nhập của Club A
 * - Nếu user là member của Club B → KHÔNG thấy đơn gia nhập của Club B
 * - Nếu user là ADMIN → thấy tất cả đơn
 * - Có phân trang
 */
exports.getMyApplications = async (req, res) => {
    try {
        const userId = req.userId;
        const { status } = req.query; // PENDING, APPROVED, REJECTED

        // Nếu là ADMIN → thấy tất cả đơn
        if (req.user.auth_role === 'ADMIN') {
            const where = {
                ...(status && { status: status })
            };

            const result = await paginateWithWhere(
                prisma.clubApplication,
                where,
                req.query,
                {
                    select: {
                        id: true,
                        clubId: true,
                        userId: true,
                        introduction: true,
                        status: true,
                        reviewNotes: true,
                        createdAt: true,
                        reviewedAt: true,
                        club: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                                logoUrl: true
                            }
                        },
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
                    orderBy: { createdAt: 'desc' },
                    defaultLimit: 10,
                    maxLimit: 100
                }
            );

            return res.status(200).json({
                success: true,
                ...result
            });
        }

        // Nếu không phải ADMIN → chỉ thấy đơn của các clubs mà user là leader
        // 1. Lấy danh sách clubs mà user là leader
        const clubsWhereUserIsLeader = await prisma.club.findMany({
            where: {
                leaderUserId: userId
            },
            select: {
                id: true
            }
            // Có thể thêm điều kiện isActive nếu cần
        });

        const clubIds = clubsWhereUserIsLeader.map(club => club.id);

        if (clubIds.length === 0) {
            // User không phải leader của club nào → trả về empty
            return res.status(200).json({
                success: true,
                data: [],
                pagination: {
                    currentPage: 1,
                    limit: 10,
                    total: 0,
                    totalPages: 0,
                    hasNext: false,
                    hasPrev: false,
                    nextPage: null,
                    prevPage: null
                }
            });
        }

        // 2. Lấy applications của các clubs mà user là leader
        const where = {
            clubId: { in: clubIds },
            ...(status && { status: status })
        };

        const result = await paginateWithWhere(
            prisma.clubApplication,
            where,
            req.query,
            {
                select: {
                    id: true,
                    clubId: true,
                    userId: true,
                    introduction: true,
                    status: true,
                    reviewNotes: true,
                    createdAt: true,
                    reviewedAt: true,
                    club: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            logoUrl: true
                        }
                    },
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
                orderBy: { createdAt: 'desc' },
                defaultLimit: 10,
                maxLimit: 100
            }
        );

        res.status(200).json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error("Get My Applications Error:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};

