const prisma = require('../prisma/client');
const payosService = require('../services/payosService');
const { generateQRCode } = require('../utils/ticketUtils');
const QRCode = require('qrcode');

/**
 * Tạo Event mới (Club Leader Only)
 * - Event private club (INTERNAL): FREE hoặc PAID
 * - Event public (PUBLIC): FREE hoặc PAID
 */
exports.createEvent = async (req, res) => {
    try {
        const {
            clubId,
            title,
            description,
            type,           // 'PUBLIC' hoặc 'INTERNAL' (private club)
            pricingType,    // 'FREE' hoặc 'PAID'
            price,          // Required nếu pricingType = 'PAID'
            capacity,       // Optional: số lượng vé tối đa
            startTime,      // DateTime
            endTime,        // DateTime
            location,       // String
            format,         // 'ONLINE' hoặc 'OFFLINE'
            onlineLink,     // String: Google Meet link (required nếu format = 'ONLINE')
            visibleFrom     // DateTime: thời điểm event hiển thị (optional)
        } = req.body;

        const userId = req.userId;

        // 1. Validate required fields
        if (!clubId || !title || !type || !pricingType) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu thông tin bắt buộc: clubId, title, type, pricingType'
            });
        }

        // 2. Validate type
        if (!['PUBLIC', 'INTERNAL'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'type phải là PUBLIC hoặc INTERNAL'
            });
        }

        // 3. Validate pricingType
        if (!['FREE', 'PAID'].includes(pricingType)) {
            return res.status(400).json({
                success: false,
                message: 'pricingType phải là FREE hoặc PAID'
            });
        }

        // 4. Validate format và onlineLink/location
        let eventFormat = 'OFFLINE'; // Default
        if (format) {
            if (!['ONLINE', 'OFFLINE'].includes(format.toUpperCase())) {
                return res.status(400).json({
                    success: false,
                    message: 'format phải là "ONLINE" hoặc "OFFLINE"'
                });
            }
            eventFormat = format.toUpperCase();
        }

        // Nếu format là ONLINE, yêu cầu onlineLink và không cần location
        if (eventFormat === 'ONLINE') {
            if (!onlineLink || onlineLink.trim() === '') {
                return res.status(400).json({
                    success: false,
                    message: 'onlineLink là bắt buộc khi format là "ONLINE"'
                });
            }
            // ONLINE event không cần location
            if (location && location.trim() !== '') {
                return res.status(400).json({
                    success: false,
                    message: 'location không được cung cấp khi format là "ONLINE"'
                });
            }
        }

        // Nếu format là OFFLINE, yêu cầu location và không cần onlineLink
        if (eventFormat === 'OFFLINE') {
            if (!location || location.trim() === '') {
                return res.status(400).json({
                    success: false,
                    message: 'location là bắt buộc khi format là "OFFLINE"'
                });
            }
            // OFFLINE event không cần onlineLink
            if (onlineLink && onlineLink.trim() !== '') {
                return res.status(400).json({
                    success: false,
                    message: 'onlineLink không được cung cấp khi format là "OFFLINE"'
                });
            }
        }

        // 5. Validate price nếu là PAID và set finalPrice
        let finalPrice = 0;
        if (pricingType === 'PAID') {
            if (!price || price <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'price phải lớn hơn 0 khi pricingType là PAID'
                });
            }
            finalPrice = price;
        } else {
            // Nếu FREE, set finalPrice = 0
            finalPrice = 0;
        }

        // 6. Validate club exists và user là leader (đã check ở middleware, nhưng check lại cho chắc)
        const club = await prisma.club.findUnique({
            where: { id: clubId }
        });

        if (!club) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy CLB'
            });
        }

        // 7. Validate dates
        if (startTime && endTime) {
            const start = new Date(startTime);
            const end = new Date(endTime);
            
            if (start >= end) {
                return res.status(400).json({
                    success: false,
                    message: 'endTime phải sau startTime'
                });
            }
        }

        // 8. Validate capacity
        if (capacity && capacity <= 0) {
            return res.status(400).json({
                success: false,
                message: 'capacity phải lớn hơn 0'
            });
        }

        // 9. Tạo event
        const newEvent = await prisma.event.create({
            data: {
                clubId: clubId,
                createdById: userId,
                title: title,
                description: description || null,
                type: type,
                pricingType: pricingType,
                price: finalPrice,
                capacity: capacity || null,
                startTime: startTime ? new Date(startTime) : null,
                endTime: endTime ? new Date(endTime) : null,
                location: eventFormat === 'OFFLINE' ? (location ? location.trim() : null) : null,
                format: eventFormat,
                onlineLink: eventFormat === 'ONLINE' ? (onlineLink ? onlineLink.trim() : null) : null,
                visibleFrom: visibleFrom ? new Date(visibleFrom) : null,
                isActive: true
            },
            include: {
                club: {
                    select: {
                        id: true,
                        name: true,
                        slug: true
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
        });

        res.status(201).json({
            success: true,
            message: 'Tạo event thành công',
            data: newEvent
        });

    } catch (error) {
        console.error('Create Event Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi tạo event'
        });
    }
};

/**
 * Lấy danh sách events
 * - Public events: ai cũng xem được
 * - Internal events: chỉ members của club mới xem được
 */
exports.getAllEvents = async (req, res) => {
    try {
        const { clubId, type, pricingType } = req.query;
        const userId = req.userId; // Có thể null nếu chưa đăng nhập

        // Normalize type to uppercase
        const normalizedType = type ? type.toUpperCase() : null;

        // Build where clause
        const where = {
            isActive: true
        };

        // Filter by pricingType
        if (pricingType && ['FREE', 'PAID'].includes(pricingType)) {
            where.pricingType = pricingType;
        }

        // Nếu user đã đăng nhập, có thể xem INTERNAL events của clubs họ là member
        // Nếu chưa đăng nhập, chỉ xem PUBLIC events
        if (!userId) {
            // User chưa đăng nhập
            if (normalizedType === 'INTERNAL') {
                // Nếu filter INTERNAL nhưng chưa đăng nhập → trả về rỗng
                return res.status(200).json({
                    success: true,
                    count: 0,
                    data: []
                });
            }
            // Chỉ xem PUBLIC events
            where.type = 'PUBLIC';
            if (clubId) {
                where.clubId = clubId;
            }
        } else {
            // Nếu có userId, lấy danh sách clubIds mà user là member
            const userMemberships = await prisma.clubMembership.findMany({
                where: {
                    userId: userId,
                    status: 'ACTIVE'
                },
                select: {
                    clubId: true
                }
            });

            const userClubIds = userMemberships.map(m => m.clubId);

            // Xử lý logic theo từng trường hợp filter type
            if (normalizedType === 'INTERNAL') {
                // Filter INTERNAL: chỉ hiển thị INTERNAL events
                where.type = 'INTERNAL';
                
                // Nếu filter type=INTERNAL và có clubId nhưng user không phải member → trả về rỗng
                if (clubId && !userClubIds.includes(clubId)) {
                    return res.status(200).json({
                        success: true,
                        count: 0,
                        data: []
                    });
                }
                
                if (clubId) {
                    // Có clubId: chỉ hiển thị INTERNAL của club đó (user đã là member vì đã check ở trên)
                    where.clubId = clubId;
                } else {
                    // Không có clubId: chỉ hiển thị INTERNAL của clubs user là member
                    where.clubId = { in: userClubIds };
                }
            } else if (normalizedType === 'PUBLIC') {
                // Filter PUBLIC: chỉ hiển thị PUBLIC events
                where.type = 'PUBLIC';
                if (clubId) {
                    where.clubId = clubId;
                }
            } else {
                // Không filter type: hiển thị cả PUBLIC và INTERNAL
                if (clubId && userClubIds.includes(clubId)) {
                    // User là member của club này, hiển thị cả PUBLIC và INTERNAL của club này
                    where.clubId = clubId;
                    // Không set where.type để hiển thị cả hai
                } else if (!clubId) {
                    // Không filter clubId: hiển thị PUBLIC hoặc INTERNAL của clubs user là member
                    where.OR = [
                        { type: 'PUBLIC' },
                        { type: 'INTERNAL', clubId: { in: userClubIds } }
                    ];
                } else {
                    // Filter clubId nhưng user không phải member: chỉ xem PUBLIC
                    where.type = 'PUBLIC';
                    where.clubId = clubId;
                }
            }
        }

        // Debug: log where clause
        console.log('=== getAllEvents Debug ===');
        console.log('Query params:', { clubId, type, normalizedType, pricingType, userId });
        console.log('Where clause:', JSON.stringify(where, null, 2));

        const events = await prisma.event.findMany({
            where: where,
            include: {
                club: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        logoUrl: true
                    }
                },
                createdBy: {
                    select: {
                        id: true,
                        fullName: true
                    }
                },
                _count: {
                    select: {
                        tickets: {
                            where: {
                                status: { in: ['PAID', 'RESERVED', 'USED'] }
                            }
                        }
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        res.status(200).json({
            success: true,
            count: events.length,
            data: events
        });

    } catch (error) {
        console.error('Get All Events Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi lấy danh sách events'
        });
    }
};

/**
 * Lấy chi tiết event
 */
exports.getEventDetail = async (req, res) => {
    try {
        const { eventId } = req.params;
        const userId = req.userId;

        const event = await prisma.event.findUnique({
            where: { id: eventId },
            include: {
                club: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        logoUrl: true,
                        description: true
                    }
                },
                createdBy: {
                    select: {
                        id: true,
                        email: true,
                        fullName: true,
                        avatarUrl: true
                    }
                },
                _count: {
                    select: {
                        tickets: {
                            where: {
                                status: { in: ['PAID', 'RESERVED', 'USED'] }
                            }
                        }
                    }
                }
            }
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy event'
            });
        }

        // Check permission: INTERNAL events chỉ members mới xem được
        if (event.type === 'INTERNAL') {
            if (!userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Cần đăng nhập để xem event này'
                });
            }

            // Check if user is member of the club
            const membership = await prisma.clubMembership.findFirst({
                where: {
                    clubId: event.clubId,
                    userId: userId,
                    status: 'ACTIVE'
                }
            });

            if (!membership && req.user?.role !== 'ADMIN') {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ thành viên của CLB mới xem được event này'
                });
            }
        }

        res.status(200).json({
            success: true,
            data: event
        });

    } catch (error) {
        console.error('Get Event Detail Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi lấy chi tiết event'
        });
    }
};

/**
 * Cập nhật event (Club Leader Only)
 */
exports.updateEvent = async (req, res) => {
    try {
        const { eventId } = req.params;
        const {
            title,
            description,
            type,
            pricingType,
            price,
            capacity,
            startTime,
            endTime,
            location,
            format,
            onlineLink,
            visibleFrom,
            isActive
        } = req.body;

        // 1. Tìm event
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

        // 2. Check permission (user phải là leader của club này)
        const membership = await prisma.clubMembership.findFirst({
            where: {
                clubId: event.clubId,
                userId: req.userId,
                role: 'LEADER',
                status: 'ACTIVE'
            }
        });

        if (!membership && event.club.leaderUserId !== req.userId && req.user.role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Chỉ club leader mới có quyền cập nhật event này'
            });
        }

        // 3. Validate pricingType và price nếu có thay đổi
        if (pricingType) {
            if (!['FREE', 'PAID'].includes(pricingType)) {
                return res.status(400).json({
                    success: false,
                    message: 'pricingType phải là FREE hoặc PAID'
                });
            }

            if (pricingType === 'PAID' && (!price || price <= 0)) {
                return res.status(400).json({
                    success: false,
                    message: 'price phải lớn hơn 0 khi pricingType là PAID'
                });
            }
        }

        // 4. Validate format, onlineLink và location nếu có thay đổi
        let eventFormat = undefined;
        const finalFormat = format !== undefined ? format.toUpperCase() : event.format;
        
        if (format !== undefined) {
            if (!['ONLINE', 'OFFLINE'].includes(format.toUpperCase())) {
                return res.status(400).json({
                    success: false,
                    message: 'format phải là "ONLINE" hoặc "OFFLINE"'
                });
            }
            eventFormat = format.toUpperCase();

            // Nếu format là ONLINE, yêu cầu onlineLink và không cho phép location
            if (eventFormat === 'ONLINE') {
                if (onlineLink !== undefined && (!onlineLink || onlineLink.trim() === '')) {
                    return res.status(400).json({
                        success: false,
                        message: 'onlineLink là bắt buộc khi format là "ONLINE"'
                    });
                }
                // Nếu đang update format sang ONLINE, check onlineLink có được cung cấp không
                if (event.format === 'OFFLINE' && (!onlineLink || onlineLink.trim() === '')) {
                    return res.status(400).json({
                        success: false,
                        message: 'onlineLink là bắt buộc khi format là "ONLINE"'
                    });
                }
                // ONLINE event không được có location
                if (location !== undefined && location && location.trim() !== '') {
                    return res.status(400).json({
                        success: false,
                        message: 'location không được cung cấp khi format là "ONLINE"'
                    });
                }
            }

            // Nếu format là OFFLINE, yêu cầu location và không cho phép onlineLink
            if (eventFormat === 'OFFLINE') {
                if (location !== undefined && (!location || location.trim() === '')) {
                    return res.status(400).json({
                        success: false,
                        message: 'location là bắt buộc khi format là "OFFLINE"'
                    });
                }
                // Nếu đang update format sang OFFLINE, check location có được cung cấp không
                if (event.format === 'ONLINE' && (!location || location.trim() === '')) {
                    return res.status(400).json({
                        success: false,
                        message: 'location là bắt buộc khi format là "OFFLINE"'
                    });
                }
                // OFFLINE event không được có onlineLink
                if (onlineLink !== undefined && onlineLink && onlineLink.trim() !== '') {
                    return res.status(400).json({
                        success: false,
                        message: 'onlineLink không được cung cấp khi format là "OFFLINE"'
                    });
                }
            }
        } else {
            // Nếu không update format, validate dựa trên format hiện tại
            if (event.format === 'ONLINE') {
                // ONLINE event không được có location
                if (location !== undefined && location && location.trim() !== '') {
                    return res.status(400).json({
                        success: false,
                        message: 'location không được cung cấp khi event format là "ONLINE"'
                    });
                }
                // ONLINE event phải có onlineLink
                if (onlineLink !== undefined && (!onlineLink || onlineLink.trim() === '')) {
                    return res.status(400).json({
                        success: false,
                        message: 'onlineLink không được để trống khi event format là "ONLINE"'
                    });
                }
            } else if (event.format === 'OFFLINE') {
                // OFFLINE event không được có onlineLink
                if (onlineLink !== undefined && onlineLink && onlineLink.trim() !== '') {
                    return res.status(400).json({
                        success: false,
                        message: 'onlineLink không được cung cấp khi event format là "OFFLINE"'
                    });
                }
                // OFFLINE event phải có location
                if (location !== undefined && (!location || location.trim() === '')) {
                    return res.status(400).json({
                        success: false,
                        message: 'location không được để trống khi event format là "OFFLINE"'
                    });
                }
            }
        }

        // 5. Build update data
        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (type !== undefined) updateData.type = type;
        if (pricingType !== undefined) updateData.pricingType = pricingType;
        if (price !== undefined) updateData.price = price;
        if (capacity !== undefined) updateData.capacity = capacity;
        if (startTime !== undefined) updateData.startTime = startTime ? new Date(startTime) : null;
        if (endTime !== undefined) updateData.endTime = endTime ? new Date(endTime) : null;
        const finalFormatForUpdate = eventFormat !== undefined ? eventFormat : event.format;
        
        if (eventFormat !== undefined) {
            updateData.format = eventFormat;
            // Nếu format thay đổi sang ONLINE, set location = null và đảm bảo có onlineLink
            if (eventFormat === 'ONLINE' && event.format === 'OFFLINE') {
                updateData.location = null;
                if (onlineLink === undefined) {
                    // Nếu không có onlineLink trong request, giữ nguyên onlineLink hiện tại (nếu có)
                    // Nhưng thường sẽ có vì đã validate ở trên
                }
            }
            // Nếu format thay đổi sang OFFLINE, set onlineLink = null và đảm bảo có location
            if (eventFormat === 'OFFLINE' && event.format === 'ONLINE') {
                updateData.onlineLink = null;
                if (location === undefined) {
                    // Nếu không có location trong request, giữ nguyên location hiện tại (nếu có)
                    // Nhưng thường sẽ có vì đã validate ở trên
                }
            }
        }
        
        if (location !== undefined) {
            // Nếu format là OFFLINE, lưu location, nếu ONLINE thì set null
            if (finalFormatForUpdate === 'OFFLINE') {
                updateData.location = location ? location.trim() : null;
            } else {
                updateData.location = null;
            }
        }
        
        if (onlineLink !== undefined) {
            // Nếu format là ONLINE, lưu onlineLink, nếu OFFLINE thì set null
            if (finalFormatForUpdate === 'ONLINE') {
                updateData.onlineLink = onlineLink ? onlineLink.trim() : null;
            } else {
                updateData.onlineLink = null;
            }
        }
        if (visibleFrom !== undefined) updateData.visibleFrom = visibleFrom ? new Date(visibleFrom) : null;
        if (isActive !== undefined) updateData.isActive = isActive;

        // 6. Update event
        const updatedEvent = await prisma.event.update({
            where: { id: eventId },
            data: updateData,
            include: {
                club: {
                    select: {
                        id: true,
                        name: true,
                        slug: true
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
        });

        res.status(200).json({
            success: true,
            message: 'Cập nhật event thành công',
            data: updatedEvent
        });

    } catch (error) {
        console.error('Update Event Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi cập nhật event'
        });
    }
};

/**
 * Xóa event (Club Leader Only) - Soft delete bằng cách set isActive = false
 */
exports.deleteEvent = async (req, res) => {
    try {
        const { eventId } = req.params;

        // 1. Tìm event
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

        // 2. Check permission
        const membership = await prisma.clubMembership.findFirst({
            where: {
                clubId: event.clubId,
                userId: req.userId,
                role: 'LEADER',
                status: 'ACTIVE'
            }
        });

        if (!membership && event.club.leaderUserId !== req.userId && req.user.role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Chỉ club leader mới có quyền xóa event này'
            });
        }

        // 3. Soft delete
        await prisma.event.update({
            where: { id: eventId },
            data: {
                isActive: false
            }
        });

        res.status(200).json({
            success: true,
            message: 'Xóa event thành công'
        });

    } catch (error) {
        console.error('Delete Event Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi xóa event'
        });
    }
};

/**
 * Đăng ký tham gia event (FREE hoặc PAID)
 * - FREE: Tạo ticket ngay, generate QR code, trả về QR code
 * - PAID: Tạo payment link, trả về payment link (webhook sẽ tạo ticket + QR code sau khi thanh toán thành công)
 */
exports.registerEvent = async (req, res) => {
    try {
        const { eventId } = req.params;
        const { quantity = 1, ticketType } = req.body;
        const userId = req.userId;

        // 1. Validate quantity
        if (quantity < 1 || quantity > 10) {
            return res.status(400).json({
                success: false,
                message: 'Số lượng vé phải từ 1 đến 10'
            });
        }

        // 2. Lấy thông tin event
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            select: {
                id: true,
                clubId: true,
                title: true,
                pricingType: true,
                price: true,
                capacity: true,
                isActive: true,
                format: true,
                onlineLink: true,
                club: {
                    select: {
                        id: true,
                        name: true,
                        slug: true
                    }
                }
            }
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy event'
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
                    status: { in: ['PAID', 'RESERVED', 'USED', 'INIT'] }
                }
            });

            if (soldTickets + quantity > event.capacity) {
                return res.status(400).json({
                    success: false,
                    message: `Event chỉ còn ${event.capacity - soldTickets} vé`
                });
            }
        }

        // 5. Kiểm tra user đã đăng ký chưa (tránh đăng ký trùng)
        const existingTickets = await prisma.ticket.findMany({
            where: {
                eventId: eventId,
                userId: userId,
                status: { in: ['PAID', 'RESERVED', 'INIT'] }
            }
        });

        if (existingTickets.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Bạn đã đăng ký event này rồi'
            });
        }

        // 6. Xử lý theo pricingType
        if (event.pricingType === 'FREE') {
            // FREE: Tạo ticket ngay
            const tickets = [];
            
            for (let i = 0; i < quantity; i++) {
                const ticketData = {
                    eventId: eventId,
                    userId: userId,
                    ticketType: ticketType || 'STANDARD',
                    price: 0,
                    status: 'PAID', // FREE event ticket = PAID ngay
                    purchasedAt: new Date(),
                    assignedAt: new Date()
                };

                // Nếu event là ONLINE, lưu onlineLink vào ticket
                if (event.format === 'ONLINE' && event.onlineLink) {
                    ticketData.onlineLink = event.onlineLink;
                }

                const ticket = await prisma.ticket.create({
                    data: ticketData
                });

                // Nếu event là OFFLINE, generate QR code cho check-in
                if (event.format === 'OFFLINE') {
                    const qrCode = generateQRCode(eventId, ticket.id);
                    await prisma.ticket.update({
                        where: { id: ticket.id },
                        data: { qrCode: qrCode }
                    });
                    ticket.qrCode = qrCode;
                } else if (event.format === 'ONLINE') {
                    ticket.onlineLink = event.onlineLink;
                }

                tickets.push(ticket);
            }

            // Chuẩn bị response data
            const responseData = {
                eventId: eventId,
                eventTitle: event.title,
                type: 'FREE',
                format: event.format
            };

            // Nếu event là ONLINE, trả về onlineLink từ ticket
            if (event.format === 'ONLINE') {
                responseData.tickets = tickets.map(t => ({
                    id: t.id,
                    onlineLink: t.onlineLink,
                    ticketType: t.ticketType,
                    status: t.status
                }));
            } else {
                // Nếu event là OFFLINE, trả về QR code
                responseData.tickets = tickets.map(t => ({
                    id: t.id,
                    qrCode: t.qrCode,
                    ticketType: t.ticketType,
                    status: t.status
                }));
            }

            res.status(200).json({
                success: true,
                message: 'Đăng ký event thành công',
                data: responseData
            });

        } else if (event.pricingType === 'PAID') {
            // PAID: Tạo payment link
            if (!event.price || event.price <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Event này chưa có giá vé'
                });
            }

            // Lấy thông tin user
            const user = await prisma.user.findUnique({
                where: { id: userId }
            });

            // Tính tổng tiền
            const totalAmount = event.price * quantity;

            // Tạo transaction trong DB
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

            // Tạo tickets với status RESERVED (chưa có QR code, sẽ tạo sau khi thanh toán thành công)
            const tickets = [];
            for (let i = 0; i < quantity; i++) {
                const ticketData = {
                    eventId: eventId,
                    userId: userId,
                    ticketType: ticketType || 'STANDARD',
                    price: event.price,
                    transactionId: transaction.id,
                    status: 'RESERVED'
                };

                // Nếu event là ONLINE, lưu onlineLink vào ticket
                if (event.format === 'ONLINE' && event.onlineLink) {
                    ticketData.onlineLink = event.onlineLink;
                }

                const ticket = await prisma.ticket.create({
                    data: ticketData
                });
                tickets.push(ticket);
            }

            // Cập nhật transaction với referenceTicketId
            await prisma.transaction.update({
                where: { id: transaction.id },
                data: {
                    referenceTicketId: tickets[0].id
                }
            });

            // Tạo orderCode
            const orderCode = parseInt(Date.now().toString().slice(-10)) + Math.floor(Math.random() * 1000);

            // Tạo payment link từ PayOS
            // Lưu ý: Description sẽ tự động được truncate xuống 25 ký tự trong payosService
            let paymentResult;
            try {
                paymentResult = await payosService.createPaymentLink({
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
            } catch (payosError) {
                // Nếu PayOS API fail, update transaction và tickets status
                console.error('PayOS API Error:', payosError);
                
                // Update transaction status thành FAILED
                await prisma.transaction.update({
                    where: { id: transaction.id },
                    data: {
                        status: 'FAILED',
                        payosPayload: JSON.stringify({
                            error: payosError.message,
                            orderCode: orderCode
                        })
                    }
                });

                // Update tickets status thành CANCELLED
                await prisma.ticket.updateMany({
                    where: {
                        transactionId: transaction.id,
                        status: 'RESERVED'
                    },
                    data: {
                        status: 'CANCELLED'
                    }
                });

                // Throw error để catch block xử lý
                throw new Error(`Không thể tạo payment link từ PayOS: ${payosError.message}`);
            }

            // Generate QR code từ payment link
            let qrCodeDataUrl = null;
            try {
                qrCodeDataUrl = await QRCode.toDataURL(paymentResult.paymentLink);
            } catch (qrError) {
                console.error('Error generating QR code:', qrError);
            }

            // Cập nhật transaction với PayOS data, QR code và timeout
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

            const responseData = {
                eventId: eventId,
                eventTitle: event.title,
                transactionId: transaction.id,
                paymentLink: paymentResult.paymentLink,
                qrCode: qrCodeDataUrl,
                timeOut: paymentResult.expiredAt,
                orderCode: orderCode,
                amount: totalAmount,
                quantity: quantity,
                type: 'PAID',
                format: event.format
            };

            // Thêm note tùy theo format
            if (event.format === 'ONLINE') {
                responseData.note = 'Sau khi thanh toán thành công, bạn sẽ nhận được link Google Meet để tham gia event';
            } else {
                responseData.note = 'Sau khi thanh toán thành công, bạn sẽ nhận được mã QR code để check-in tại event';
            }

            res.status(200).json({
                success: true,
                message: 'Vui lòng thanh toán để hoàn tất đăng ký',
                data: responseData
            });
        } else {
            return res.status(400).json({
                success: false,
                message: 'Loại pricing không hợp lệ'
            });
        }

    } catch (error) {
        console.error('Register Event Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi đăng ký event'
        });
    }
};

