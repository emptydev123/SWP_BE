const prisma = require('../prisma/client');
const payosService = require('../services/payosService');

exports.createPayment = async (req, res) => {
    try {
        const { type, clubId, eventId, ticketType, quantity = 1 } = req.body;
        const userId = req.userId;

        // 1. Validate type
        if (!type || !['MEMBERSHIP', 'EVENT_TICKET'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Type phải là MEMBERSHIP hoặc EVENT_TICKET'
            });
        }

        // 2. Validate input theo type
        if (type === 'MEMBERSHIP') {
            if (!clubId) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu clubId'
                });
            }
            return await handleMembershipPayment(req, res, clubId, userId);
        } else if (type === 'EVENT_TICKET') {
            if (!eventId) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu eventId'
                });
            }
            if (quantity < 1 || quantity > 10) {
                return res.status(400).json({
                    success: false,
                    message: 'Số lượng vé phải từ 1 đến 10'
                });
            }
            return await handleEventTicketPayment(req, res, eventId, ticketType, quantity, userId);
        }

    } catch (error) {
        console.error('Create Payment Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi tạo payment link'
        });
    }
};

/**
 * Helper function: Xử lý payment cho MEMBERSHIP
 * Tự động tìm membership PENDING_PAYMENT của user trong club
 */
async function handleMembershipPayment(req, res, clubId, userId) {
    try {
        // 1. Validate input
        if (!clubId) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu clubId'
            });
        }

        // 2. Lấy thông tin club
        const club = await prisma.club.findUnique({
            where: { id: clubId }
        });

        if (!club) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy CLB'
            });
        }

        // 3. Kiểm tra club có bật phí gia nhập không
        if (!club.membershipFeeEnabled || club.membershipFeeAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'CLB này không yêu cầu phí gia nhập'
            });
        }

        // 4. Tìm membership PENDING_PAYMENT của user trong club này
        const membership = await prisma.clubMembership.findFirst({
            where: {
                clubId: clubId,
                userId: userId,
                status: 'PENDING_PAYMENT'
            },
            include: {
                club: true,
                user: true
            }
        });

        if (!membership) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy membership đang chờ thanh toán. Có thể bạn chưa được duyệt hoặc đã thanh toán rồi.'
            });
        }

        // 5. Kiểm tra xem đã có transaction PENDING chưa
        const existingTransaction = await prisma.transaction.findFirst({
            where: {
                referenceMembershipId: membership.id,
                status: 'PENDING',
                type: 'MEMBERSHIP'
            }
        });

        if (existingTransaction) {
            // Nếu đã có transaction PENDING, trả về payment link cũ
            const payosData = existingTransaction.payosPayload ? JSON.parse(existingTransaction.payosPayload) : null;
            if (payosData && payosData.checkoutUrl) {
                return res.status(200).json({
                    success: true,
                    message: 'Đã có giao dịch đang chờ thanh toán',
                    data: {
                        transactionId: existingTransaction.id,
                        paymentLink: payosData.checkoutUrl,
                        orderCode: payosData.orderCode
                    }
                });
            }
        }

        // 6. Tạo transaction mới trong DB
        const transaction = await prisma.transaction.create({
            data: {
                clubId: membership.clubId,
                userId: userId,
                type: 'MEMBERSHIP',
                referenceMembershipId: membership.id,
                amount: membership.club.membershipFeeAmount,
                currency: 'VND',
                paymentMethod: 'PAYOS',
                status: 'PENDING'
            }
        });

        // 8. Tạo orderCode từ transaction ID (convert UUID to number)
        // PayOS yêu cầu orderCode là số nguyên dương, unique
        // Sử dụng timestamp + random để tạo unique number
        const orderCode = parseInt(Date.now().toString().slice(-10)) + Math.floor(Math.random() * 1000);

        // 9. Tạo payment link từ PayOS
        const paymentResult = await payosService.createPaymentLink({
            orderCode: orderCode,
            amount: membership.club.membershipFeeAmount,
            description: `Phí gia nhập CLB: ${membership.club.name}`,
            buyerName: membership.user.fullName || membership.user.email,
            buyerEmail: membership.user.email,
            buyerPhone: membership.user.phone || '',
            items: [
                {
                    name: `Phí gia nhập CLB ${membership.club.name}`,
                    quantity: 1,
                    price: membership.club.membershipFeeAmount
                }
            ]
        });

        // 10. Cập nhật transaction với PayOS data
        await prisma.transaction.update({
            where: { id: transaction.id },
            data: {
                paymentReference: orderCode.toString(),
                payosPayload: JSON.stringify({
                    orderCode: orderCode,
                    checkoutUrl: paymentResult.paymentLink,
                    ...paymentResult.data
                })
            }
        });

        res.status(200).json({
            success: true,
            message: 'Tạo payment link thành công',
            data: {
                transactionId: transaction.id,
                paymentLink: paymentResult.paymentLink,
                orderCode: orderCode,
                amount: membership.club.membershipFeeAmount,
                description: `Phí gia nhập CLB: ${membership.club.name}`
            }
        });

    } catch (error) {
        console.error('Create Membership Payment Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi tạo payment link'
        });
    }
};

/**
 * Helper function: Xử lý payment cho EVENT_TICKET
 */
async function handleEventTicketPayment(req, res, eventId, ticketType, quantity, userId) {
    try {

        // 2. Lấy thông tin event
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            include: {
                club: true
            }
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy event'
            });
        }

        // 3. Kiểm tra event có tính phí không
        if (event.pricingType !== 'PAID' || event.price <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Event này không tính phí hoặc chưa có giá'
            });
        }

        // 4. Kiểm tra event còn active không
        if (!event.isActive) {
            return res.status(400).json({
                success: false,
                message: 'Event đã bị vô hiệu hóa'
            });
        }

        // 5. Kiểm tra capacity nếu có
        if (event.capacity) {
            const soldTickets = await prisma.ticket.count({
                where: {
                    eventId: eventId,
                    status: { in: ['PAID', 'RESERVED', 'USED'] }
                }
            });

            if (soldTickets + quantity > event.capacity) {
                return res.status(400).json({
                    success: false,
                    message: `Event chỉ còn ${event.capacity - soldTickets} vé`
                });
            }
        }

        // 6. Lấy thông tin user
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        // 7. Tính tổng tiền
        const totalAmount = event.price * quantity;

        // 8. Tạo transaction trong DB
        const transaction = await prisma.transaction.create({
            data: {
                clubId: event.clubId,
                userId: userId,
                type: 'EVENT_TICKET',
                amount: totalAmount,
                currency: 'VND',
                paymentMethod: 'PAYOS',
                status: 'PENDING'
            }
        });

        // 9. Tạo tickets với status RESERVED
        const tickets = [];
        for (let i = 0; i < quantity; i++) {
            const ticket = await prisma.ticket.create({
                data: {
                    eventId: eventId,
                    userId: userId,
                    ticketType: ticketType || 'STANDARD',
                    price: event.price,
                    transactionId: transaction.id,
                    status: 'RESERVED'
                }
            });
            tickets.push(ticket);
        }

        // 10. Cập nhật transaction với referenceTicketId (lấy ticket đầu tiên)
        await prisma.transaction.update({
            where: { id: transaction.id },
            data: {
                referenceTicketId: tickets[0].id
            }
        });

        // 11. Tạo orderCode
        const orderCode = parseInt(Date.now().toString().slice(-10)) + Math.floor(Math.random() * 1000);

        // 12. Tạo payment link từ PayOS
        const paymentResult = await payosService.createPaymentLink({
            orderCode: orderCode,
            amount: totalAmount,
            description: `Mua vé event: ${event.title}${quantity > 1 ? ` (${quantity} vé)` : ''}`,
            buyerName: user.fullName || user.email,
            buyerEmail: user.email,
            buyerPhone: user.phone || '',
            items: [
                {
                    name: `Vé ${event.title}${ticketType ? ` - ${ticketType}` : ''}`,
                    quantity: quantity,
                    price: event.price
                }
            ]
        });

        // 13. Cập nhật transaction với PayOS data
        await prisma.transaction.update({
            where: { id: transaction.id },
            data: {
                paymentReference: orderCode.toString(),
                payosPayload: JSON.stringify({
                    orderCode: orderCode,
                    checkoutUrl: paymentResult.paymentLink,
                    ticketIds: tickets.map(t => t.id),
                    ...paymentResult.data
                })
            }
        });

        res.status(200).json({
            success: true,
            message: 'Tạo payment link thành công',
            data: {
                transactionId: transaction.id,
                paymentLink: paymentResult.paymentLink,
                orderCode: orderCode,
                amount: totalAmount,
                quantity: quantity,
                tickets: tickets.map(t => ({ id: t.id, ticketType: t.ticketType })),
                description: `Mua vé event: ${event.title}`
            }
        });

    } catch (error) {
        console.error('Create Event Ticket Payment Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi tạo payment link'
        });
    }
};

/**
 * Webhook handler từ PayOS
 * - PayOS sẽ gọi endpoint này khi có thay đổi trạng thái payment
 * - Cần verify signature để đảm bảo request hợp lệ
 * - Cập nhật transaction status và các related records
 */
exports.handleWebhook = async (req, res) => {
    try {
        const webhookData = req.body;
        const signature = req.headers['x-payos-signature'] || req.headers['x-signature'];

        // 1. Verify webhook signature
        if (!payosService.verifyWebhookSignature(webhookData, signature)) {
            console.error('Invalid webhook signature');
            return res.status(401).json({
                success: false,
                message: 'Invalid signature'
            });
        }

        const { code, desc, data } = webhookData;

        // 2. Tìm transaction theo orderCode (paymentReference)
        const orderCode = data?.orderCode || data?.order_code;
        if (!orderCode) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu orderCode'
            });
        }

        const transaction = await prisma.transaction.findUnique({
            where: { paymentReference: orderCode.toString() },
            include: {
                referenceMembership: true,
                referenceTicket: {
                    include: {
                        event: true
                    }
                }
            }
        });

        if (!transaction) {
            console.error(`Transaction not found for orderCode: ${orderCode}`);
            return res.status(404).json({
                success: false,
                message: 'Transaction not found'
            });
        }

        // 3. Xử lý theo code từ PayOS
        // Code = 00: Thanh toán thành công
        if (code === '00' && data?.status === 'PAID') {
            // Cập nhật transaction status
            await prisma.transaction.update({
                where: { id: transaction.id },
                data: {
                    status: 'SUCCESS',
                    confirmedAt: new Date(),
                    payosPayload: JSON.stringify({
                        ...(transaction.payosPayload ? JSON.parse(transaction.payosPayload) : {}),
                        webhookData: webhookData
                    })
                }
            });

            // Xử lý theo transaction type
            if (transaction.type === 'MEMBERSHIP' && transaction.referenceMembershipId) {
                // Cập nhật membership status thành ACTIVE
                await prisma.clubMembership.update({
                    where: { id: transaction.referenceMembershipId },
                    data: {
                        status: 'ACTIVE',
                        activatedAt: new Date(),
                        joinedAt: new Date()
                    }
                });

                // Tạo ledger entry cho club
                const club = await prisma.club.findUnique({
                    where: { id: transaction.clubId }
                });

                if (club) {
                    const lastLedger = await prisma.clubLedger.findFirst({
                        where: { clubId: transaction.clubId },
                        orderBy: { createdAt: 'desc' }
                    });

                    const balanceAfter = (lastLedger?.balanceAfter || 0) + transaction.amount;

                    await prisma.clubLedger.create({
                        data: {
                            clubId: transaction.clubId,
                            type: 'INCOME',
                            transactionId: transaction.id,
                            amount: transaction.amount,
                            balanceAfter: balanceAfter,
                            note: `Phí gia nhập từ ${transaction.referenceMembership?.user?.email || 'N/A'}`
                        }
                    });
                }
            } else if (transaction.type === 'EVENT_TICKET') {
                // Cập nhật tất cả tickets liên quan thành PAID
                const payosPayload = transaction.payosPayload ? JSON.parse(transaction.payosPayload) : {};
                const ticketIds = payosPayload.ticketIds || [];

                if (ticketIds.length > 0) {
                    await prisma.ticket.updateMany({
                        where: {
                            id: { in: ticketIds },
                            transactionId: transaction.id
                        },
                        data: {
                            status: 'PAID',
                            purchasedAt: new Date()
                        }
                    });
                } else {
                    // Fallback: update ticket theo referenceTicketId
                    if (transaction.referenceTicketId) {
                        await prisma.ticket.updateMany({
                            where: {
                                transactionId: transaction.id
                            },
                            data: {
                                status: 'PAID',
                                purchasedAt: new Date()
                            }
                        });
                    }
                }

                // Tạo ledger entry cho club
                const club = await prisma.club.findUnique({
                    where: { id: transaction.clubId }
                });

                if (club && transaction.referenceTicket?.event) {
                    const lastLedger = await prisma.clubLedger.findFirst({
                        where: { clubId: transaction.clubId },
                        orderBy: { createdAt: 'desc' }
                    });

                    const balanceAfter = (lastLedger?.balanceAfter || 0) + transaction.amount;

                    await prisma.clubLedger.create({
                        data: {
                            clubId: transaction.clubId,
                            type: 'INCOME',
                            transactionId: transaction.id,
                            amount: transaction.amount,
                            balanceAfter: balanceAfter,
                            note: `Bán vé event: ${transaction.referenceTicket.event.title}`
                        }
                    });
                }
            }

            return res.status(200).json({
                success: true,
                message: 'Webhook processed successfully'
            });
        }
        // Code khác: Thanh toán thất bại hoặc hủy
        else if (code !== '00' || data?.status === 'CANCELLED') {
            await prisma.transaction.update({
                where: { id: transaction.id },
                data: {
                    status: code === '00' ? 'CANCELLED' : 'FAILED',
                    payosPayload: JSON.stringify({
                        ...(transaction.payosPayload ? JSON.parse(transaction.payosPayload) : {}),
                        webhookData: webhookData
                    })
                }
            });

            // Nếu là EVENT_TICKET, hủy các tickets đã RESERVED
            if (transaction.type === 'EVENT_TICKET') {
                await prisma.ticket.updateMany({
                    where: {
                        transactionId: transaction.id,
                        status: 'RESERVED'
                    },
                    data: {
                        status: 'CANCELLED'
                    }
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Webhook processed - Payment failed/cancelled'
            });
        }

        // Trường hợp khác
        return res.status(200).json({
            success: true,
            message: 'Webhook received'
        });

    } catch (error) {
        console.error('Handle Webhook Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi xử lý webhook'
        });
    }
};

/**
 * Return URL handler - Khi user quay lại sau khi thanh toán thành công
 */
exports.handleReturn = async (req, res) => {
    try {
        const { orderCode, status } = req.query;

        if (!orderCode) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu orderCode'
            });
        }

        // Tìm transaction
        const transaction = await prisma.transaction.findUnique({
            where: { paymentReference: orderCode.toString() }
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy transaction'
            });
        }

        // Redirect hoặc trả về thông tin
        // Trong thực tế, bạn có thể redirect đến frontend với thông tin transaction
        res.status(200).json({
            success: true,
            message: 'Thanh toán thành công',
            data: {
                transactionId: transaction.id,
                status: transaction.status,
                orderCode: orderCode
            }
        });

    } catch (error) {
        console.error('Handle Return Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi xử lý return URL'
        });
    }
};

/**
 * Cancel URL handler - Khi user hủy thanh toán
 */
exports.handleCancel = async (req, res) => {
    try {
        const { orderCode } = req.query;

        if (!orderCode) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu orderCode'
            });
        }

        // Tìm transaction và cập nhật status
        const transaction = await prisma.transaction.findUnique({
            where: { paymentReference: orderCode.toString() }
        });

        if (transaction && transaction.status === 'PENDING') {
            await prisma.transaction.update({
                where: { id: transaction.id },
                data: {
                    status: 'CANCELLED'
                }
            });

            // Hủy tickets nếu là EVENT_TICKET
            if (transaction.type === 'EVENT_TICKET') {
                await prisma.ticket.updateMany({
                    where: {
                        transactionId: transaction.id,
                        status: 'RESERVED'
                    },
                    data: {
                        status: 'CANCELLED'
                    }
                });
            }
        }

        res.status(200).json({
            success: true,
            message: 'Đã hủy thanh toán',
            data: {
                transactionId: transaction?.id,
                orderCode: orderCode
            }
        });

    } catch (error) {
        console.error('Handle Cancel Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi xử lý cancel URL'
        });
    }
};

/**
 * Lấy thông tin transaction
 */
exports.getTransaction = async (req, res) => {
    try {
        const { transactionId } = req.params;
        const userId = req.userId;

        const transaction = await prisma.transaction.findUnique({
            where: { id: transactionId },
            include: {
                club: {
                    select: { id: true, name: true, slug: true }
                },
                user: {
                    select: { id: true, email: true, fullName: true }
                },
                referenceMembership: {
                    include: {
                        club: {
                            select: { id: true, name: true }
                        }
                    }
                },
                referenceTicket: {
                    include: {
                        event: {
                            select: { id: true, title: true }
                        }
                    }
                }
            }
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy transaction'
            });
        }

        // Kiểm tra quyền: chỉ user sở hữu transaction mới xem được
        if (transaction.userId !== userId && req.user.role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Không có quyền xem transaction này'
            });
        }

        // Parse payosPayload nếu có
        let payosData = null;
        if (transaction.payosPayload) {
            try {
                payosData = JSON.parse(transaction.payosPayload);
            } catch (e) {
                console.error('Parse payosPayload error:', e);
            }
        }

        res.status(200).json({
            success: true,
            data: {
                ...transaction,
                payosData: payosData
            }
        });

    } catch (error) {
        console.error('Get Transaction Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi lấy thông tin transaction'
        });
    }
};

