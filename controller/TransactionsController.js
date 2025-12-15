const prisma = require('../prisma/client');
const payosService = require('../services/payosService');
const { generateQRCode } = require('../utils/ticketUtils');
const QRCode = require('qrcode');
const { formatTransactionWithPayment, getPaymentInfo } = require('../utils/paymentUtils');

/**
 * Create payment link for MEMBERSHIP or EVENT_TICKET
 */
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
                        qrCode: existingTransaction.qr_code,
                        timeOut: existingTransaction.time_out,
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

        // 7. Tạo orderCode từ transaction ID (convert UUID to number)
        // PayOS yêu cầu orderCode là số nguyên dương, unique
        // Sử dụng timestamp + random để tạo unique number
        const orderCode = parseInt(Date.now().toString().slice(-10)) + Math.floor(Math.random() * 1000);

        // 8. Tạo payment link từ PayOS
        // Lưu ý: Description sẽ tự động được truncate xuống 25 ký tự trong payosService
        const paymentResult = await payosService.createPaymentLink({
            orderCode: orderCode,
            amount: membership.club.membershipFeeAmount,
            description: `Phí CLB: ${membership.club.name}`,
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

        // 9. Generate QR code từ payment link
        let qrCodeDataUrl = null;
        try {
            qrCodeDataUrl = await QRCode.toDataURL(paymentResult.paymentLink);
        } catch (qrError) {
            console.error('Error generating QR code:', qrError);
        }

        // 10. Cập nhật transaction với PayOS data, QR code và timeout
        await prisma.transaction.update({
            where: { id: transaction.id },
            data: {
                paymentReference: orderCode.toString(),
                qr_code: qrCodeDataUrl,
                time_out: paymentResult.expiredAt,
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
                qrCode: qrCodeDataUrl,
                timeOut: paymentResult.expiredAt,
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
}

/**
 * Helper function: Xử lý payment cho EVENT_TICKET
 */
async function handleEventTicketPayment(req, res, eventId, ticketType, quantity, userId) {
    try {
        // 1. Lấy thông tin event
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

        // 2. Kiểm tra event có tính phí không
        if (event.pricingType !== 'PAID' || event.price <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Event này không tính phí hoặc chưa có giá'
            });
        }

        // 3. Kiểm tra event còn active không
        if (!event.isActive) {
            return res.status(400).json({
                success: false,
                message: 'Event đã bị vô hiệu hóa'
            });
        }

        // 4. Kiểm tra capacity nếu có
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

        // 5. Lấy thông tin user
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        // 6. Tính tổng tiền
        const totalAmount = event.price * quantity;

        // 7. Tạo transaction trong DB
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

        // 8. Tạo tickets với status RESERVED
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

        // 9. Cập nhật transaction với referenceTicketId (lấy ticket đầu tiên)
        await prisma.transaction.update({
            where: { id: transaction.id },
            data: {
                referenceTicketId: tickets[0].id
            }
        });

        // 10. Tạo orderCode
        const orderCode = parseInt(Date.now().toString().slice(-10)) + Math.floor(Math.random() * 1000);

        // 11. Tạo payment link từ PayOS
        // Lưu ý: Description sẽ tự động được truncate xuống 25 ký tự trong payosService
        const paymentResult = await payosService.createPaymentLink({
            orderCode: orderCode,
            amount: totalAmount,
            description: `Mua vé: ${event.title}${quantity > 1 ? ` (${quantity})` : ''}`,
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

        // 12. Generate QR code từ payment link
        let qrCodeDataUrl = null;
        try {
            qrCodeDataUrl = await QRCode.toDataURL(paymentResult.paymentLink);
        } catch (qrError) {
            console.error('Error generating QR code:', qrError);
        }

        // 13. Cập nhật transaction với PayOS data, QR code và timeout
        await prisma.transaction.update({
            where: { id: transaction.id },
            data: {
                paymentReference: orderCode.toString(),
                qr_code: qrCodeDataUrl,
                time_out: paymentResult.expiredAt,
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
                qrCode: qrCodeDataUrl,
                timeOut: paymentResult.expiredAt,
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
}

/**
 * Webhook handler từ PayOS
 * - PayOS sẽ gọi endpoint này khi có thay đổi trạng thái payment
 * - Cần verify signature để đảm bảo request hợp lệ
 * - Cập nhật transaction status và các related records
 * - Generate QR code cho tickets khi thanh toán thành công
 */
exports.handleWebhook = async (req, res) => {
    try {
        const webhookData = req.body;
        const signature = req.headers['x-payos-signature'] || req.headers['x-signature'];

        console.log('[Webhook] Received webhook:', {
            hasBody: !!webhookData,
            hasSignature: !!signature,
            bodyKeys: webhookData ? Object.keys(webhookData) : []
        });

        // 1. Verify webhook signature
        if (!payosService.verifyWebhookSignature(webhookData, signature)) {
            console.error('[Webhook] Invalid webhook signature');
            return res.status(401).json({
                success: false,
                message: 'Invalid signature'
            });
        }

        const { code, desc, data } = webhookData;

        console.log('[Webhook] Webhook data:', {
            code,
            desc,
            orderCode: data?.orderCode || data?.order_code,
            status: data?.status
        });

        // 2. Tìm transaction theo orderCode (paymentReference)
        const orderCode = data?.orderCode || data?.order_code;
        if (!orderCode) {
            console.error('[Webhook] Missing orderCode');
            return res.status(400).json({
                success: false,
                message: 'Thiếu orderCode'
            });
        }

        const transaction = await prisma.transaction.findUnique({
            where: { paymentReference: orderCode.toString() },
            include: {
                referenceMembership: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                email: true,
                                fullName: true
                            }
                        }
                    }
                },
                referenceTicket: {
                    include: {
                        event: true
                    }
                }
            }
        });

        if (!transaction) {
            console.error(`[Webhook] Transaction not found for orderCode: ${orderCode}`);
            return res.status(404).json({
                success: false,
                message: 'Transaction not found'
            });
        }

        console.log(`[Webhook] Found transaction ${transaction.id}, type: ${transaction.type}, current status: ${transaction.status}`);

        // 3. Xử lý theo code từ PayOS
        // Code = 00: Thanh toán thành công
        if (code === '00' && data?.status === 'PAID') {
            console.log(`[Webhook] Processing successful payment for transaction ${transaction.id}`);
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
                // Cập nhật tất cả tickets liên quan thành PAID và generate QR code
                const payosPayload = transaction.payosPayload ? JSON.parse(transaction.payosPayload) : {};
                const ticketIds = payosPayload.ticketIds || [];

                // Tìm tất cả tickets của transaction này
                let tickets = [];
                if (ticketIds.length > 0) {
                    // Nếu có ticketIds trong payload, dùng chúng
                    tickets = await prisma.ticket.findMany({
                        where: {
                            id: { in: ticketIds },
                            transactionId: transaction.id
                        },
                        include: { event: true }
                    });
                } else {
                    // Fallback: tìm tất cả tickets của transaction
                    tickets = await prisma.ticket.findMany({
                        where: {
                            transactionId: transaction.id
                        },
                        include: { event: true }
                    });
                }

                console.log(`[Webhook] Updating ${tickets.length} tickets for transaction ${transaction.id}`);

                // Update từng ticket
                for (const ticket of tickets) {
                    if (ticket.status !== 'PAID' || !ticket.qrCode) {
                        // Generate QR code nếu chưa có (chỉ cho OFFLINE events)
                        let qrCode = ticket.qrCode;
                        if (ticket.event && ticket.event.format === 'OFFLINE' && !qrCode) {
                            qrCode = generateQRCode(ticket.eventId, ticket.id);
                        }

                        await prisma.ticket.update({
                            where: { id: ticket.id },
                            data: {
                                status: 'PAID',
                                purchasedAt: new Date(),
                                assignedAt: new Date(),
                                ...(qrCode && { qrCode: qrCode })
                            }
                        });

                        console.log(`[Webhook] Updated ticket ${ticket.id} with QR code: ${qrCode || 'N/A (ONLINE event)'}`);
                    } else {
                        // Ticket đã có QR code, chỉ update status nếu cần
                        if (ticket.status !== 'PAID') {
                            await prisma.ticket.update({
                                where: { id: ticket.id },
                                data: {
                                    status: 'PAID',
                                    purchasedAt: new Date()
                                }
                            });
                            console.log(`[Webhook] Updated ticket ${ticket.id} status to PAID`);
                        }
                    }

                    // Tạo EventRegistration nếu chưa có (chỉ tạo 1 lần cho user đầu tiên)
                    if (ticket === tickets[0]) {
                        const existingRegistration = await prisma.eventRegistration.findFirst({
                            where: {
                                eventId: ticket.eventId,
                                userId: ticket.userId
                            }
                        });

                        if (!existingRegistration) {
                            await prisma.eventRegistration.create({
                                data: {
                                    eventId: ticket.eventId,
                                    clubId: ticket.event.clubId, // Thêm clubId
                                    userId: ticket.userId,
                                    ticketId: ticket.id,
                                    registeredAt: new Date()
                                }
                            });
                            console.log(`[Webhook] Created EventRegistration for user ${ticket.userId} and event ${ticket.eventId}`);
                        }
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
 * Kiểm tra trạng thái từ PayOS và trả về QR codes ngay
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
        let transaction = await prisma.transaction.findUnique({
            where: { paymentReference: orderCode.toString() },
            include: {
                referenceTicket: {
                    include: {
                        event: true
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

        // Kiểm tra trạng thái từ PayOS để đảm bảo chính xác
        try {
            const paymentInfo = await payosService.getPaymentInfo(parseInt(orderCode));
            const payosStatus = paymentInfo.data?.status;

            // Nếu PayOS báo đã PAID nhưng DB chưa cập nhật, cập nhật ngay
            if (payosStatus === 'PAID' && transaction.status !== 'SUCCESS') {
                console.log(`Updating transaction ${transaction.id} to SUCCESS from return URL`);

                // Cập nhật transaction
                transaction = await prisma.transaction.update({
                    where: { id: transaction.id },
                    data: {
                        status: 'SUCCESS',
                        confirmedAt: new Date()
                    },
                    include: {
                        referenceTicket: {
                            include: {
                                event: true
                            }
                        }
                    }
                });

                // Nếu là EVENT_TICKET, cập nhật tickets và generate QR codes
                if (transaction.type === 'EVENT_TICKET') {
                    const tickets = await prisma.ticket.findMany({
                        where: {
                            transactionId: transaction.id
                        },
                        include: {
                            event: true
                        }
                    });

                    const updatedTickets = [];
                    for (const ticket of tickets) {
                        if (ticket.status !== 'PAID') {
                            const updateData = {
                                status: 'PAID',
                                purchasedAt: new Date(),
                                assignedAt: new Date()
                            };

                            // Chỉ generate QR code nếu event format là OFFLINE
                            if (ticket.event && ticket.event.format === 'OFFLINE' && !ticket.qrCode) {
                                const qrCode = generateQRCode(ticket.eventId, ticket.id);
                                updateData.qrCode = qrCode;
                                await prisma.ticket.update({
                                    where: { id: ticket.id },
                                    data: updateData
                                });
                                updatedTickets.push({
                                    id: ticket.id,
                                    qrCode: qrCode,
                                    ticketType: ticket.ticketType,
                                    status: 'PAID'
                                });
                            } else {
                                // ONLINE event hoặc đã có QR code
                                await prisma.ticket.update({
                                    where: { id: ticket.id },
                                    data: updateData
                                });
                                const ticketData = {
                                    id: ticket.id,
                                    ticketType: ticket.ticketType,
                                    status: 'PAID'
                                };
                                // Thêm onlineLink hoặc qrCode tùy theo format
                                if (ticket.event && ticket.event.format === 'ONLINE') {
                                    ticketData.onlineLink = ticket.onlineLink;
                                } else {
                                    ticketData.qrCode = ticket.qrCode;
                                }
                                updatedTickets.push(ticketData);
                            }
                        } else {
                            // Ticket đã PAID, chỉ cần format response
                            const ticketData = {
                                id: ticket.id,
                                ticketType: ticket.ticketType,
                                status: ticket.status
                            };
                            // Thêm onlineLink hoặc qrCode tùy theo format
                            if (ticket.event && ticket.event.format === 'ONLINE') {
                                ticketData.onlineLink = ticket.onlineLink;
                            } else {
                                ticketData.qrCode = ticket.qrCode;
                            }
                            updatedTickets.push(ticketData);
                        }
                    }

                    // Trả về response với QR codes hoặc onlineLink
                    return res.status(200).json({
                        success: true,
                        message: 'Thanh toán thành công',
                        data: {
                            transactionId: transaction.id,
                            status: 'SUCCESS',
                            orderCode: orderCode,
                            amount: transaction.amount,
                            tickets: updatedTickets,
                            eventTitle: tickets[0]?.event?.title || null
                        }
                    });
                }
            }
        } catch (payosError) {
            console.error('Error checking PayOS status:', payosError);
            // Nếu không query được PayOS, vẫn trả về thông tin transaction hiện tại
        }

        // Nếu transaction đã SUCCESS, lấy tickets và QR codes
        if (transaction.status === 'SUCCESS' && transaction.type === 'EVENT_TICKET') {
            const tickets = await prisma.ticket.findMany({
                where: {
                    transactionId: transaction.id
                },
                include: {
                    event: true
                }
            });

            const ticketsWithQR = tickets.map(ticket => ({
                id: ticket.id,
                qrCode: ticket.qrCode,
                ticketType: ticket.ticketType,
                status: ticket.status
            }));

            return res.status(200).json({
                success: true,
                message: 'Thanh toán thành công',
                data: {
                    transactionId: transaction.id,
                    status: transaction.status,
                    orderCode: orderCode,
                    amount: transaction.amount,
                    tickets: ticketsWithQR,
                    eventTitle: tickets[0]?.event?.title || null
                }
            });
        }

        // Trường hợp khác (MEMBERSHIP hoặc chưa thanh toán)
        res.status(200).json({
            success: true,
            message: transaction.status === 'SUCCESS' ? 'Thanh toán thành công' : 'Đang xử lý thanh toán',
            data: {
                transactionId: transaction.id,
                status: transaction.status,
                orderCode: orderCode,
                amount: transaction.amount
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
        if (transaction.userId !== userId && req.user.auth_role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Không có quyền xem transaction này'
            });
        }

        // Parse payosPayload để lấy payosData
        let payosData = null;
        if (transaction.payosPayload) {
            try {
                payosData = JSON.parse(transaction.payosPayload);
            } catch (error) {
                console.error('Error parsing payosPayload:', error);
            }
        }

        // Nếu là EVENT_TICKET, lấy tất cả tickets và QR codes
        let tickets = [];
        if (transaction.type === 'EVENT_TICKET') {
            tickets = await prisma.ticket.findMany({
                where: {
                    transactionId: transaction.id
                },
                include: {
                    event: {
                        select: {
                            id: true,
                            title: true,
                            startTime: true,
                            endTime: true,
                            location: true,
                            format: true,
                            onlineLink: true
                        }
                    }
                },
                orderBy: {
                    createdAt: 'asc'
                }
            });

            // Nếu transaction đã SUCCESS nhưng tickets chưa có QR code, generate ngay (chỉ cho OFFLINE events)
            if (transaction.status === 'SUCCESS') {
                for (const ticket of tickets) {
                    if (ticket.status !== 'PAID') {
                        const updateData = {
                            status: 'PAID',
                            purchasedAt: ticket.purchasedAt || new Date(),
                            assignedAt: ticket.assignedAt || new Date()
                        };

                        // Chỉ generate QR code nếu event format là OFFLINE
                        if (ticket.event && ticket.event.format === 'OFFLINE' && !ticket.qrCode) {
                            const qrCode = generateQRCode(ticket.eventId, ticket.id);
                            updateData.qrCode = qrCode;
                            ticket.qrCode = qrCode;
                        }

                        await prisma.ticket.update({
                            where: { id: ticket.id },
                            data: updateData
                        });
                        ticket.status = 'PAID';
                    } else if (ticket.event && ticket.event.format === 'OFFLINE' && !ticket.qrCode) {
                        // Nếu ticket đã PAID nhưng chưa có QR code (cho OFFLINE events)
                        const qrCode = generateQRCode(ticket.eventId, ticket.id);
                        await prisma.ticket.update({
                            where: { id: ticket.id },
                            data: { qrCode: qrCode }
                        });
                        ticket.qrCode = qrCode;
                    }
                }
            }
        }

        // Format response với payment info từ payosPayload
        const responseData = await formatTransactionWithPayment(transaction, true); // includeQRCode = true

        // Thêm các thông tin khác
        responseData.club = transaction.club;
        responseData.user = transaction.user;
        responseData.payosData = payosData;

        // Thêm tickets nếu là EVENT_TICKET
        if (transaction.type === 'EVENT_TICKET') {
            responseData.tickets = tickets.map(ticket => {
                const ticketData = {
                    id: ticket.id,
                    ticketType: ticket.ticketType,
                    status: ticket.status,
                    price: ticket.price,
                    purchasedAt: ticket.purchasedAt,
                    assignedAt: ticket.assignedAt,
                    event: {
                        ...ticket.event
                    }
                };

                // Nếu event là ONLINE, thêm onlineLink từ ticket; nếu OFFLINE, thêm QR code
                if (ticket.event && ticket.event.format === 'ONLINE') {
                    ticketData.onlineLink = ticket.onlineLink;
                } else if (ticket.event && ticket.event.format === 'OFFLINE') {
                    ticketData.qrCode = ticket.qrCode;
                }

                return ticketData;
            });
        }

        // Thêm membership info nếu là MEMBERSHIP
        if (transaction.type === 'MEMBERSHIP' && transaction.referenceMembership) {
            responseData.membership = transaction.referenceMembership;
        }

        // Đảm bảo có payment info (paymentLink, qrCode, orderCode) nếu transaction còn PENDING
        if (transaction.status === 'PENDING' && !responseData.paymentLink) {
            // Nếu chưa có paymentLink, thử lấy từ payosPayload
            const paymentInfo = await getPaymentInfo(transaction);
            if (paymentInfo.paymentLink) {
                responseData.paymentLink = paymentInfo.paymentLink;
                responseData.qrCode = paymentInfo.qrCode;
                responseData.orderCode = paymentInfo.orderCode;
            }
        }

        res.status(200).json({
            success: true,
            data: responseData
        });

    } catch (error) {
        console.error('Get Transaction Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi lấy thông tin transaction'
        });
    }
};

/**
 * Lấy payment info (payment link, QR code, orderCode) từ transaction
 * Dùng khi cần lấy lại payment link hoặc QR code
 */
exports.getPaymentInfo = async (req, res) => {
    try {
        const { transactionId } = req.params;
        const userId = req.userId;

        const transaction = await prisma.transaction.findUnique({
            where: { id: transactionId },
            select: {
                id: true,
                userId: true,
                type: true,
                amount: true,
                status: true,
                paymentMethod: true,
                paymentReference: true,
                payosPayload: true
            }
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy transaction'
            });
        }

        // Kiểm tra quyền: chỉ user sở hữu transaction mới xem được
        if (transaction.userId !== userId && req.user.auth_role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Không có quyền xem transaction này'
            });
        }

        // Chỉ trả về payment info nếu transaction còn PENDING hoặc SUCCESS
        if (transaction.status !== 'PENDING' && transaction.status !== 'SUCCESS') {
            return res.status(400).json({
                success: false,
                message: `Transaction đã ${transaction.status === 'CANCELLED' ? 'bị hủy' : transaction.status === 'FAILED' ? 'thất bại' : 'hoàn tất'}. Không thể lấy payment info.`
            });
        }

        // Lấy payment info từ payosPayload
        const paymentInfo = await getPaymentInfo(transaction);

        res.status(200).json({
            success: true,
            data: {
                transactionId: transaction.id,
                type: transaction.type,
                amount: transaction.amount,
                status: transaction.status,
                ...paymentInfo
            }
        });

    } catch (error) {
        console.error('Get Payment Info Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi lấy payment info'
        });
    }
};

/**
 * Lấy danh sách transactions của user hiện tại (chỉ thấy transaction của chính mình)
 * Có phân trang và filter theo type, status
 */
exports.getMyTransactions = async (req, res) => {
    try {
        const userId = req.userId;
        const { type, status } = req.query; // type: MEMBERSHIP, EVENT_TICKET | status: PENDING, SUCCESS, etc.

        // Build where clause - chỉ lấy transactions của user hiện tại
        const where = {
            userId: userId,
            ...(type && { type: type }),
            ...(status && { status: status })
        };

        // Sử dụng pagination utility
        const { paginateWithWhere } = require('../utils/paginationUtils');
        const result = await paginateWithWhere(
            prisma.transaction,
            where,
            req.query,
            {
                select: {
                    id: true,
                    clubId: true,
                    userId: true,
                    type: true,
                    amount: true,
                    currency: true,
                    status: true,
                    paymentMethod: true,
                    paymentReference: true,
                    payosPayload: true,
                    createdAt: true,
                    confirmedAt: true,
                    club: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            logoUrl: true
                        }
                    },
                    referenceMembership: {
                        select: {
                            id: true,
                            role: true,
                            status: true,
                            club: {
                                select: {
                                    id: true,
                                    name: true
                                }
                            }
                        }
                    },
                    referenceTicket: {
                        select: {
                            id: true,
                            ticketType: true,
                            status: true,
                            price: true,
                            qrCode: true,
                            event: {
                                select: {
                                    id: true,
                                    title: true,
                                    startTime: true,
                                    endTime: true
                                }
                            }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                defaultLimit: 10,
                maxLimit: 50
            }
        );

        // Parse payosPayload và thêm payment info cho tất cả transactions có payosPayload
        const transactionsWithPayment = await Promise.all(
            result.data.map(async (transaction) => {
                const transactionObj = {
                    ...transaction,
                    payosData: null,
                    paymentLink: null,
                    qrCode: null,
                    qrCodeString: null,
                    orderCode: transaction.paymentReference,
                    accountNumber: null,
                    accountName: null,
                    bin: null,
                    paymentLinkId: null
                };

                // Parse payosPayload nếu có (không chỉ PENDING, mà cả SUCCESS, FAILED, etc.)
                if (transaction.payosPayload) {
                    try {
                        const payosData = JSON.parse(transaction.payosPayload);
                        transactionObj.payosData = payosData;
                        transactionObj.paymentLink = payosData.checkoutUrl || null;
                        transactionObj.orderCode = payosData.orderCode || transaction.paymentReference;

                        // Thêm các thông tin khác từ PayOS
                        transactionObj.accountNumber = payosData.accountNumber || null;
                        transactionObj.accountName = payosData.accountName || null;
                        transactionObj.bin = payosData.bin || null;
                        transactionObj.paymentLinkId = payosData.paymentLinkId || null;
                        transactionObj.qrCodeString = payosData.qrCode || null; // QR code string từ PayOS

                        // Generate QR code từ payment link (dạng base64 data URL) - chỉ cho PENDING
                        // Vì SUCCESS/FAILED thì payment link đã hết hạn hoặc không còn cần thiết
                        if (transaction.status === 'PENDING' && transactionObj.paymentLink) {
                            try {
                                const QRCode = require('qrcode');
                                transactionObj.qrCode = await QRCode.toDataURL(transactionObj.paymentLink);
                            } catch (qrError) {
                                console.error('Error generating QR code:', qrError);
                            }
                        }
                    } catch (parseError) {
                        console.error('Error parsing payosPayload:', parseError);
                    }
                }

                return transactionObj;
            })
        );

        res.status(200).json({
            success: true,
            data: transactionsWithPayment,
            pagination: result.pagination
        });

    } catch (error) {
        console.error('Get My Transactions Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi lấy danh sách transactions'
        });
    }
};

/**
 * Check and sync payment status from PayOS
 * Frontend gọi API này để kiểm tra và đồng bộ trạng thái thanh toán
 * Dùng khi không có webhook hoặc muốn verify tức thì
 */
exports.checkAndSyncPaymentStatus = async (req, res) => {
    try {
        const { transactionId } = req.params;
        const userId = req.userId;

        // 1. Tìm transaction
        const transaction = await prisma.transaction.findUnique({
            where: { id: transactionId },
            include: {
                referenceMembership: {
                    include: {
                        user: { select: { id: true, email: true, fullName: true } },
                        club: { select: { id: true, name: true } }
                    }
                },
                club: { select: { id: true, name: true } }
            }
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy transaction'
            });
        }

        // 2. Kiểm tra quyền - chỉ cho phép user sở hữu transaction
        if (transaction.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Không có quyền kiểm tra transaction này'
            });
        }

        // 3. Nếu đã SUCCESS hoặc FAILED thì không cần check nữa
        if (transaction.status === 'SUCCESS') {
            return res.status(200).json({
                success: true,
                message: 'Đã thanh toán thành công',
                data: {
                    transactionId: transaction.id,
                    status: 'SUCCESS',
                    syncedAt: transaction.confirmedAt
                }
            });
        }

        if (transaction.status === 'FAILED' || transaction.status === 'CANCELLED') {
            return res.status(200).json({
                success: true,
                message: 'Giao dịch đã bị hủy hoặc thất bại',
                data: {
                    transactionId: transaction.id,
                    status: transaction.status
                }
            });
        }

        // 4. Nếu PENDING, check với PayOS
        if (!transaction.paymentReference) {
            return res.status(400).json({
                success: false,
                message: 'Transaction chưa có orderCode'
            });
        }

        console.log(`[Check Status] Checking transaction ${transaction.id} with orderCode ${transaction.paymentReference}`);

        try {
            const paymentInfo = await payosService.getPaymentInfo(parseInt(transaction.paymentReference));
            const payosStatus = paymentInfo.data?.status;

            console.log(`[Check Status] PayOS returned status: ${payosStatus}`);

            // 5. Nếu PayOS báo đã PAID → cập nhật DB
            if (payosStatus === 'PAID') {
                console.log(`[Check Status] Syncing transaction ${transaction.id} to SUCCESS`);

                // Update transaction
                await prisma.transaction.update({
                    where: { id: transaction.id },
                    data: {
                        status: 'SUCCESS',
                        confirmedAt: new Date()
                    }
                });

                // Nếu là MEMBERSHIP, update membership status
                if (transaction.type === 'MEMBERSHIP' && transaction.referenceMembershipId) {
                    await prisma.clubMembership.update({
                        where: { id: transaction.referenceMembershipId },
                        data: {
                            status: 'ACTIVE',
                            activatedAt: new Date(),
                            joinedAt: new Date()
                        }
                    });

                    // Tạo ledger entry
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

                    console.log(`[Check Status] Membership ${transaction.referenceMembershipId} activated`);
                }

                return res.status(200).json({
                    success: true,
                    message: 'Thanh toán thành công! Đã cập nhật trạng thái.',
                    data: {
                        transactionId: transaction.id,
                        status: 'SUCCESS',
                        previousStatus: 'PENDING',
                        syncedAt: new Date()
                    }
                });
            }

            // 6. Nếu PayOS báo CANCELLED, EXPIRED
            if (payosStatus === 'CANCELLED' || payosStatus === 'EXPIRED') {
                await prisma.transaction.update({
                    where: { id: transaction.id },
                    data: { status: 'CANCELLED' }
                });

                return res.status(200).json({
                    success: true,
                    message: 'Giao dịch đã bị hủy hoặc hết hạn',
                    data: {
                        transactionId: transaction.id,
                        status: 'CANCELLED',
                        payosStatus: payosStatus
                    }
                });
            }

            // 7. Vẫn PENDING
            return res.status(200).json({
                success: true,
                message: 'Giao dịch vẫn đang chờ thanh toán',
                data: {
                    transactionId: transaction.id,
                    status: 'PENDING',
                    payosStatus: payosStatus
                }
            });

        } catch (payosError) {
            console.error('[Check Status] PayOS API error:', payosError);
            return res.status(200).json({
                success: true,
                message: 'Không thể kiểm tra với PayOS, giữ nguyên trạng thái',
                data: {
                    transactionId: transaction.id,
                    status: transaction.status,
                    error: 'PayOS API unavailable'
                }
            });
        }

    } catch (error) {
        console.error('Check Payment Status Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi kiểm tra trạng thái thanh toán'
        });
    }
};
