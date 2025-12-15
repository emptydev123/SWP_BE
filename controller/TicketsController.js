const prisma = require('../prisma/client');

/**
 * Lấy danh sách vé của user hiện tại
 * Trả về thông tin vé kèm thông tin event
 * Query params: eventId (optional) - filter theo event
 */
exports.getUserTickets = async (req, res) => {
    try {
        const userId = req.userId;
        const { eventId } = req.query;

        // Build where clause
        const whereClause = {
            userId: userId
        };

        // Thêm filter theo eventId nếu có
        if (eventId) {
            whereClause.eventId = eventId;
        }

        // Lấy tất cả tickets của user, kèm thông tin event và club
        const tickets = await prisma.ticket.findMany({
            where: whereClause,
            include: {
                event: {
                    include: {
                        club: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                                logoUrl: true
                            }
                        }
                    }
                },
                transaction: {
                    select: {
                        id: true,
                        status: true,
                        paymentMethod: true,
                        createdAt: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // Format response
        const formattedTickets = tickets.map(ticket => {
            const ticketData = {
                id: ticket.id,
                ticketType: ticket.ticketType,
                price: ticket.price,
                status: ticket.status,
                purchasedAt: ticket.purchasedAt,
                assignedAt: ticket.assignedAt,
                usedAt: ticket.usedAt,
                createdAt: ticket.createdAt,
                event: {
                    id: ticket.event.id,
                    title: ticket.event.title,
                    description: ticket.event.description,
                    type: ticket.event.type,
                    pricingType: ticket.event.pricingType,
                    startTime: ticket.event.startTime,
                    endTime: ticket.event.endTime,
                    location: ticket.event.location,
                    format: ticket.event.format,
                    isActive: ticket.event.isActive,
                    club: ticket.event.club
                },
                transaction: ticket.transaction ? {
                    id: ticket.transaction.id,
                    status: ticket.transaction.status,
                    paymentMethod: ticket.transaction.paymentMethod,
                    createdAt: ticket.transaction.createdAt
                } : null
            };

            // Thêm onlineLink hoặc qrCode tùy theo format của event
            if (ticket.event.format === 'ONLINE') {
                ticketData.onlineLink = ticket.onlineLink;
            } else {
                ticketData.qrCode = ticket.qrCode;
            }

            return ticketData;
        });

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách vé thành công',
            data: {
                tickets: formattedTickets,
                total: formattedTickets.length
            }
        });

    } catch (error) {
        console.error('Get User Tickets Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi lấy danh sách vé'
        });
    }
};

/**
 * Lấy chi tiết một ticket cụ thể
 * User chỉ có thể xem ticket của chính mình
 */
exports.getTicketDetail = async (req, res) => {
    try {
        const userId = req.userId;
        const { ticketId } = req.params;

        // Lấy ticket với đầy đủ thông tin
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: {
                event: {
                    include: {
                        club: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                                logoUrl: true,
                                coverUrl: true
                            }
                        },
                        createdBy: {
                            select: {
                                id: true,
                                email: true,
                                fullName: true
                            }
                        }
                    }
                },
                transaction: {
                    select: {
                        id: true,
                        status: true,
                        paymentMethod: true,
                        amount: true,
                        currency: true,
                        createdAt: true,
                        confirmedAt: true
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
                checkins: {
                    orderBy: {
                        scannedAt: 'desc'
                    },
                    include: {
                        staff: {
                            select: {
                                id: true,
                                email: true,
                                fullName: true
                            }
                        }
                    }
                }
            }
        });

        // Kiểm tra ticket có tồn tại không
        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy vé'
            });
        }

        // Kiểm tra user có quyền xem ticket này không (chỉ owner mới xem được)
        if (ticket.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Bạn không có quyền xem vé này'
            });
        }

        // Format response
        const formattedTicket = {
            id: ticket.id,
            ticketType: ticket.ticketType,
            price: ticket.price,
            status: ticket.status,
            purchasedAt: ticket.purchasedAt,
            assignedAt: ticket.assignedAt,
            usedAt: ticket.usedAt,
            createdAt: ticket.createdAt,
            event: {
                id: ticket.event.id,
                title: ticket.event.title,
                description: ticket.event.description,
                type: ticket.event.type,
                pricingType: ticket.event.pricingType,
                price: ticket.event.price,
                format: ticket.event.format,
                capacity: ticket.event.capacity,
                startTime: ticket.event.startTime,
                endTime: ticket.event.endTime,
                location: ticket.event.location,
                format: ticket.event.format,
                isActive: ticket.event.isActive,
                visibleFrom: ticket.event.visibleFrom,
                createdAt: ticket.event.createdAt,
                club: ticket.event.club,
                createdBy: ticket.event.createdBy
            },
            transaction: ticket.transaction ? {
                id: ticket.transaction.id,
                status: ticket.transaction.status,
                paymentMethod: ticket.transaction.paymentMethod,
                amount: ticket.transaction.amount,
                currency: ticket.transaction.currency,
                createdAt: ticket.transaction.createdAt,
                confirmedAt: ticket.transaction.confirmedAt
            } : null,
            user: ticket.user,
            checkins: ticket.checkins.map(checkin => ({
                id: checkin.id,
                scannedAt: checkin.scannedAt,
                locationMeta: checkin.locationMeta,
                createdAt: checkin.createdAt,
                staff: checkin.staff
            })),
            isCheckedIn: ticket.checkins.length > 0,
            lastCheckin: ticket.checkins.length > 0 ? ticket.checkins[0] : null
        };

        // Thêm onlineLink hoặc qrCode tùy theo format của event
        if (ticket.event.format === 'ONLINE') {
            formattedTicket.onlineLink = ticket.onlineLink;
        } else {
            formattedTicket.qrCode = ticket.qrCode;
        }

        res.status(200).json({
            success: true,
            message: 'Lấy chi tiết vé thành công',
            data: formattedTicket
        });

    } catch (error) {
        console.error('Get Ticket Detail Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi lấy chi tiết vé'
        });
    }
};

