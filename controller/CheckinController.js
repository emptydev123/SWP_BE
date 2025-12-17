const prisma = require('../prisma/client');

/**
 * Check-in bằng QR code (cho OFFLINE events)
 * Staff quét QR code từ ticket của user
 */
exports.checkinByQRCode = async (req, res) => {
    try {
        const { qrCode } = req.body;
        const staffUserId = req.userId;

        // 1. Validate input
        if (!qrCode) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu mã QR code'
            });
        }

        // 2. Tìm ticket theo QR code
        const ticket = await prisma.ticket.findUnique({
            where: { qrCode: qrCode },
            include: {
                event: {
                    select: {
                        id: true,
                        clubId: true,
                        title: true,
                        format: true,
                        startTime: true,
                        endTime: true,
                        isActive: true
                    }
                },
                user: {
                    select: {
                        id: true,
                        email: true,
                        fullName: true,
                        studentCode: true
                    }
                },
                checkins: {
                    orderBy: {
                        scannedAt: 'desc'
                    },
                    take: 1
                }
            }
        });

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy vé với QR code này'
            });
        }

        // 3. Kiểm tra event có tồn tại và active không
        if (!ticket.event || !ticket.event.isActive) {
            return res.status(400).json({
                success: false,
                message: 'Event không tồn tại hoặc đã bị vô hiệu hóa'
            });
        }

        // 3b. Kiểm tra quyền staff/leader/event-staff hoặc admin
        const clubStaff = await prisma.clubMembership.findFirst({
            where: {
                clubId: ticket.event.clubId,
                userId: staffUserId,
                status: 'ACTIVE',
                role: { in: ['LEADER', 'STAFF'] }
            }
        });
        const eventStaff = await prisma.eventStaff.findFirst({
            where: {
                eventId: ticket.event.id,
                userId: staffUserId
            }
        });
        const isAdmin = req.user?.auth_role === 'ADMIN';
        if (!clubStaff && !eventStaff && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Chỉ staff/leader của event mới được check-in'
            });
        }

        // 4. Kiểm tra event format phải là OFFLINE
        if (ticket.event.format !== 'OFFLINE') {
            return res.status(400).json({
                success: false,
                message: 'QR code chỉ dùng cho event OFFLINE. Event này là ONLINE, vui lòng check-in bằng email.'
            });
        }

        // 5. Kiểm tra ticket status
        if (ticket.status !== 'PAID' && ticket.status !== 'USED') {
            return res.status(400).json({
                success: false,
                message: `Vé chưa được thanh toán. Trạng thái hiện tại: ${ticket.status}`
            });
        }

        // 6. [DISABLED FOR TESTING] Kiểm tra thời gian check-in (phải từ 30 phút trước khi event bắt đầu)
        // if (ticket.event.startTime) {
        //     const now = new Date();
        //     const startTime = new Date(ticket.event.startTime);
        //     const checkinStartTime = new Date(startTime.getTime() - 30 * 60 * 1000); // 30 phút trước
        //     
        //     // Kiểm tra nếu thời gian hiện tại chưa đến 30 phút trước khi event bắt đầu
        //     if (now < checkinStartTime) {
        //         const minutesUntilCheckin = Math.ceil((checkinStartTime - now) / (1000 * 60));
        //         return res.status(400).json({
        //             success: false,
        //             message: `Chưa đến thời gian check-in. Check-in sẽ mở từ ${checkinStartTime.toLocaleString('vi-VN')} (30 phút trước khi event bắt đầu). Còn ${minutesUntilCheckin} phút nữa.`
        //         });
        //     }
        //     
        //     // Kiểm tra nếu event đã kết thúc
        //     if (ticket.event.endTime) {
        //         const endTime = new Date(ticket.event.endTime);
        //         if (now > endTime) {
        //             return res.status(400).json({
        //                 success: false,
        //                 message: 'Event đã kết thúc. Không thể check-in.'
        //             });
        //         }
        //     }
        // }

        // 7. Kiểm tra đã check-in chưa
        if (ticket.checkins.length > 0) {
            const lastCheckin = ticket.checkins[0];
            return res.status(200).json({
                success: true,
                message: 'User đã được check-in trước đó',
                data: {
                    ticketId: ticket.id,
                    userId: ticket.userId,
                    user: ticket.user,
                    event: ticket.event,
                    lastCheckin: {
                        id: lastCheckin.id,
                        scannedAt: lastCheckin.scannedAt,
                        staff: lastCheckin.staffUserId
                    },
                    isAlreadyCheckedIn: true
                }
            });
        }

        // 7. Tạo check-in record
        const checkin = await prisma.checkin.create({
            data: {
                ticketId: ticket.id,
                eventId: ticket.eventId,
                staffUserId: staffUserId,
                scannedAt: new Date()
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
        });

        // 9. Cập nhật ticket status thành USED
        await prisma.ticket.update({
            where: { id: ticket.id },
            data: {
                status: 'USED',
                usedAt: new Date()
            }
        });

        // 10. Cập nhật EventRegistration checkedInAt
        const registration = await prisma.eventRegistration.findFirst({
            where: {
                eventId: ticket.eventId,
                userId: ticket.userId,
                ticketId: ticket.id
            }
        });

        if (registration) {
            await prisma.eventRegistration.update({
                where: { id: registration.id },
                data: {
                    checkedInAt: new Date(),
                    checkinMethod: 'QR_CODE'
                }
            });
        }

        res.status(200).json({
            success: true,
            message: 'Check-in thành công',
            data: {
                checkinId: checkin.id,
                ticketId: ticket.id,
                userId: ticket.userId,
                user: ticket.user,
                event: ticket.event,
                scannedAt: checkin.scannedAt,
                staff: checkin.staff,
                isAlreadyCheckedIn: false
            }
        });

    } catch (error) {
        console.error('Check-in by QR Code Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi check-in bằng QR code'
        });
    }
};

/**
 * Check-in bằng email (cho ONLINE events)
 * Staff nhập email của user để check-in
 */
exports.checkinByEmail = async (req, res) => {
    try {
        const { eventId, email } = req.body;
        const staffUserId = req.userId;

        // 1. Validate input
        if (!eventId || !email) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu eventId hoặc email'
            });
        }

        // 2. Tìm event
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            select: {
                id: true,
                clubId: true,
                title: true,
                format: true,
                startTime: true,
                endTime: true,
                isActive: true
            }
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy event'
            });
        }

        // 3. Kiểm tra quyền staff/leader/event-staff hoặc admin
        const clubStaff = await prisma.clubMembership.findFirst({
            where: {
                clubId: event.clubId,
                userId: staffUserId,
                status: 'ACTIVE',
                role: { in: ['LEADER', 'STAFF'] }
            }
        });
        const eventStaff = await prisma.eventStaff.findFirst({
            where: {
                eventId: event.id,
                userId: staffUserId
            }
        });
        const isAdmin = req.user?.auth_role === 'ADMIN';
        if (!clubStaff && !eventStaff && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Chỉ staff/leader của event mới được check-in'
            });
        }

        // 3b. Check-in bằng email có thể dùng cho cả ONLINE và OFFLINE (backup khi QR lỗi)
        // Không cần check format nữa

        // 4. Tìm user theo email
        const user = await prisma.user.findUnique({
            where: { email: email },
            select: {
                id: true,
                email: true,
                fullName: true,
                studentCode: true
            }
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy user với email này'
            });
        }

        // 5. Tìm EventRegistration của user cho event này
        const registration = await prisma.eventRegistration.findFirst({
            where: {
                eventId: eventId,
                userId: user.id
            },
            include: {
                ticket: {
                    include: {
                        checkins: {
                            orderBy: {
                                scannedAt: 'desc'
                            },
                            take: 1
                        }
                    }
                }
            }
        });

        if (!registration) {
            return res.status(404).json({
                success: false,
                message: 'User chưa đăng ký tham gia event này'
            });
        }

        // 6. [DISABLED FOR TESTING] Kiểm tra thời gian check-in (phải từ 30 phút trước khi event bắt đầu)
        // if (event.startTime) {
        //     const now = new Date();
        //     const startTime = new Date(event.startTime);
        //     const checkinStartTime = new Date(startTime.getTime() - 30 * 60 * 1000); // 30 phút trước
        //     
        //     // Kiểm tra nếu thời gian hiện tại chưa đến 30 phút trước khi event bắt đầu
        //     if (now < checkinStartTime) {
        //         const minutesUntilCheckin = Math.ceil((checkinStartTime - now) / (1000 * 60));
        //         return res.status(400).json({
        //             success: false,
        //             message: `Chưa đến thời gian check-in. Check-in sẽ mở từ ${checkinStartTime.toLocaleString('vi-VN')} (30 phút trước khi event bắt đầu). Còn ${minutesUntilCheckin} phút nữa.`
        //         });
        //     }
        //     
        //     // Kiểm tra nếu event đã kết thúc
        //     if (event.endTime) {
        //         const endTime = new Date(event.endTime);
        //         if (now > endTime) {
        //             return res.status(400).json({
        //                 success: false,
        //                 message: 'Event đã kết thúc. Không thể check-in.'
        //             });
        //         }
        //     }
        // }

        // 7. Kiểm tra đã check-in chưa
        if (registration.checkedInAt) {
            return res.status(200).json({
                success: true,
                message: 'User đã được check-in trước đó',
                data: {
                    registrationId: registration.id,
                    userId: user.id,
                    user: user,
                    event: event,
                    checkedInAt: registration.checkedInAt,
                    checkinMethod: registration.checkinMethod,
                    isAlreadyCheckedIn: true
                }
            });
        }

        // 8. Tạo check-in record (nếu có ticket)
        let checkin = null;
        if (registration.ticketId) {
            // Tạo check-in record cho ticket
            checkin = await prisma.checkin.create({
                data: {
                    ticketId: registration.ticketId,
                    eventId: eventId,
                    staffUserId: staffUserId,
                    scannedAt: new Date()
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
            });

            // Cập nhật ticket status thành USED
            await prisma.ticket.update({
                where: { id: registration.ticketId },
                data: {
                    status: 'USED',
                    usedAt: new Date()
                }
            });
        }

        // 9. Cập nhật EventRegistration checkedInAt
        await prisma.eventRegistration.update({
            where: { id: registration.id },
            data: {
                checkedInAt: new Date(),
                checkinMethod: 'EMAIL'
            }
        });

        res.status(200).json({
            success: true,
            message: 'Check-in thành công',
            data: {
                registrationId: registration.id,
                checkinId: checkin?.id || null,
                userId: user.id,
                user: user,
                event: event,
                checkedInAt: new Date(),
                checkinMethod: 'EMAIL',
                staff: checkin?.staff || null,
                isAlreadyCheckedIn: false
            }
        });

    } catch (error) {
        console.error('Check-in by Email Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi check-in bằng email'
        });
    }
};

/**
 * Lấy danh sách người tham gia event (đã đăng ký)
 * Staff có thể xem danh sách để check-in
 */
exports.getEventParticipants = async (req, res) => {
    try {
        const { eventId } = req.params;
        const { checkedIn, search } = req.query; // checkedIn: true/false, search: email hoặc tên

        // 1. Tìm event
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            select: {
                id: true,
                title: true,
                format: true,
                startTime: true,
                endTime: true
            }
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy event'
            });
        }

        // 2. Build where clause
        const where = {
            eventId: eventId
        };

        // Filter theo checkedIn status
        if (checkedIn === 'true') {
            where.checkedInAt = { not: null };
        } else if (checkedIn === 'false') {
            where.checkedInAt = null;
        }

        // 3. Lấy danh sách registrations
        const registrations = await prisma.eventRegistration.findMany({
            where: where,
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        fullName: true,
                        studentCode: true,
                        phone: true
                    }
                },
                ticket: {
                    select: {
                        id: true,
                        ticketType: true,
                        status: true,
                        qrCode: true,
                        onlineLink: true
                    }
                },
                club: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        logoUrl: true
                    }
                }
            },
            orderBy: {
                registeredAt: 'desc'
            }
        });

        // 4. Filter theo search nếu có
        let filteredRegistrations = registrations;
        if (search) {
            const searchLower = search.toLowerCase();
            filteredRegistrations = registrations.filter(reg => {
                const email = reg.user.email?.toLowerCase() || '';
                const fullName = reg.user.fullName?.toLowerCase() || '';
                const studentCode = reg.user.studentCode?.toLowerCase() || '';
                return email.includes(searchLower) ||
                    fullName.includes(searchLower) ||
                    studentCode.includes(searchLower);
            });
        }

        // 5. Format response
        const formattedData = filteredRegistrations.map(reg => ({
            id: reg.id,
            userId: reg.userId,
            user: reg.user,
            clubId: reg.clubId,
            club: reg.club,
            ticketId: reg.ticketId,
            ticket: reg.ticket,
            registeredAt: reg.registeredAt,
            checkedInAt: reg.checkedInAt,
            checkinMethod: reg.checkinMethod,
            isCheckedIn: !!reg.checkedInAt
        }));

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách người tham gia thành công',
            data: {
                event: event,
                participants: formattedData,
                total: formattedData.length,
                checkedIn: formattedData.filter(p => p.isCheckedIn).length,
                notCheckedIn: formattedData.filter(p => !p.isCheckedIn).length
            }
        });

    } catch (error) {
        console.error('Get Event Participants Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi lấy danh sách người tham gia'
        });
    }
};

