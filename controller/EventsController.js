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
            visibleFrom,    // DateTime: thời điểm event hiển thị (optional)
            staffIds,       // Array of user IDs: danh sách thành viên club làm staff quản lý event
            fundRequest     // Object: { title, description, items: [{ name, amount, description? }] }
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
            const numericPrice = Number(price);
            if (!Number.isInteger(numericPrice) || numericPrice <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'price phải là số nguyên dương khi pricingType là PAID'
                });
            }
            finalPrice = numericPrice;
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
        if (!startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: 'startTime và endTime là bắt buộc'
            });
        }

        const start = new Date(startTime);
        const end = new Date(endTime);
        const now = new Date();
        const minStart = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // tối thiểu sau 7 ngày

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'startTime hoặc endTime không hợp lệ'
            });
        }

        if (start <= now) {
            return res.status(400).json({
                success: false,
                message: 'startTime phải sau thời điểm hiện tại'
            });
        }

        if (start < minStart) {
            return res.status(400).json({
                success: false,
                message: 'startTime phải cách hiện tại ít nhất 7 ngày'
            });
        }

        if (start.getTime() === end.getTime()) {
            return res.status(400).json({
                success: false,
                message: 'endTime không được trùng với startTime'
            });
        }

        if (start >= end) {
            return res.status(400).json({
                success: false,
                message: 'endTime phải sau startTime'
            });
        }

        if (visibleFrom) {
            const visibleDate = new Date(visibleFrom);
            if (Number.isNaN(visibleDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'visibleFrom không hợp lệ'
                });
            }
            if (visibleDate > start) {
                return res.status(400).json({
                    success: false,
                    message: 'visibleFrom phải trước startTime'
                });
            }
        }

        // 8. Validate capacity
        if (capacity !== undefined) {
            const numericCapacity = Number(capacity);
            if (!Number.isInteger(numericCapacity) || numericCapacity <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'capacity phải là số nguyên dương'
                });
            }
            req.body.capacity = numericCapacity;
        }

        // 9. Validate staffIds nếu có
        if (staffIds && Array.isArray(staffIds) && staffIds.length > 0) {
            // Kiểm tra tất cả staffIds phải là thành viên của club
            const staffMemberships = await prisma.clubMembership.findMany({
                where: {
                    clubId: clubId,
                    userId: { in: staffIds },
                    status: 'ACTIVE'
                },
                select: {
                    userId: true
                }
            });

            const validStaffIds = staffMemberships.map(m => m.userId);
            const invalidStaffIds = staffIds.filter(id => !validStaffIds.includes(id));

            if (invalidStaffIds.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Một số thành viên không hợp lệ hoặc không phải là thành viên của CLB: ${invalidStaffIds.join(', ')}`
                });
            }
        }

        // 10. Validate fund request
        if (!fundRequest || !Array.isArray(fundRequest.items) || fundRequest.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cần cung cấp fundRequest với danh sách items'
            });
        }

        let normalizedItems;
        try {
            normalizedItems = fundRequest.items.map((item, idx) => {
                const itemName = item?.name?.trim();
                const itemAmount = Number(item?.amount);
                if (!itemName) {
                    throw new Error(`Tên hạng mục quỹ không hợp lệ tại vị trí ${idx + 1}`);
                }
                if (!Number.isInteger(itemAmount) || itemAmount <= 0) {
                    throw new Error(`Số tiền hạng mục phải là số nguyên dương tại vị trí ${idx + 1}`);
                }
                return {
                    name: itemName,
                    description: item?.description?.trim() || null,
                    amount: itemAmount
                };
            });
        } catch (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError.message
            });
        }

        const totalFundAmount = normalizedItems.reduce((sum, item) => sum + item.amount, 0);

        if (totalFundAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Tổng kinh phí phải lớn hơn 0'
            });
        }

        // 11. Tạo event + fund request
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
                startTime: new Date(startTime),
                endTime: new Date(endTime),
                location: eventFormat === 'OFFLINE' ? (location ? location.trim() : null) : null,
                format: eventFormat,
                onlineLink: eventFormat === 'ONLINE' ? (onlineLink ? onlineLink.trim() : null) : null,
                visibleFrom: visibleFrom ? new Date(visibleFrom) : null,
                isActive: false, // Chờ duyệt quỹ / chưa diễn ra
                approvalStatus: 'PENDING', // Trạng thái event: PENDING -> APPROVED -> DONE / REJECTED
                staff: staffIds && Array.isArray(staffIds) && staffIds.length > 0 ? {
                    create: staffIds.map(staffId => ({
                        userId: staffId
                    }))
                } : undefined,
                fundRequests: {
                    create: {
                        clubId: clubId,
                        createdById: userId,
                        title: fundRequest.title?.trim() || `Yêu cầu quỹ cho event: ${title}`,
                        description: fundRequest.description?.trim() || description || null,
                        amount: totalFundAmount,
                        status: 'PENDING',
                        items: {
                            create: normalizedItems
                        }
                    }
                }
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
                },
                staff: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                email: true,
                                fullName: true,
                                studentCode: true
                            }
                        }
                    }
                },
                fundRequests: {
                    include: {
                        items: true
                    }
                }
            }
        });

        // Chuẩn hóa field tổng quỹ: totalAmount thay cho amount
        const mappedFundRequests = newEvent.fundRequests?.map(fr => {
            const { amount, ...rest } = fr;
            return {
                ...rest,
                totalAmount: amount
            };
        });

        // Ghi nhật ký tạo sự kiện
        const auditLogController = require('./AuditLogController');
        auditLogController.createAuditLog({
            action: 'CREATE_EVENT',
            userId: req.userId,
            userEmail: req.user?.email || null,
            details: `Tạo sự kiện: ${title} (CLB ${newEvent.club?.name || clubId})`,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent'),
            metadata: { eventId: newEvent.id, clubId }
        });

        res.status(201).json({
            success: true,
            message: 'Tạo event thành công',
            data: {
                ...newEvent,
                fundRequests: mappedFundRequests
            }
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
 * Lấy danh sách events (Bắt buộc đăng nhập)
 * - Public events: tất cả user đã login đều xem được
 * - Internal events: chỉ members của club mới xem được
 */
exports.getAllEvents = async (req, res) => {
    try {
        const { clubId, type, pricingType, includeInactive, includePending } = req.query;
        const userId = req.userId; // Luôn có giá trị vì đã bắt buộc login

        // Normalize type to uppercase
        const normalizedType = type ? type.toUpperCase() : null;

        // Build where clause
        const where = {};
        const now = new Date();

        // Chỉ trả về events đã duyệt quỹ, trừ khi yêu cầu includePending
        if (includePending !== 'true') {
            where.approvalStatus = 'APPROVED';
        }

        // Filter by endTime instead of isActive status
        // This allows staff to see all their assigned events, including ended ones
        if (includeInactive !== 'true') {
            // Only show events that haven't ended yet
            // If endTime is null, use startTime as the end time
            where.OR = [
                { endTime: { gte: now } }, // Has endTime and it's in the future
                {
                    AND: [
                        { endTime: null }, // No endTime
                        { startTime: { gte: now } } // But startTime is in the future
                    ]
                }
            ];
        }

        // Filter by pricingType
        if (pricingType && ['FREE', 'PAID'].includes(pricingType)) {
            where.pricingType = pricingType;
        }

        // Lấy danh sách clubIds mà user là member
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
        // Note: We need to combine type filters with endTime filter using AND
        const typeFilters = {};

        if (normalizedType === 'INTERNAL') {
            // Filter INTERNAL: chỉ hiển thị INTERNAL events của clubs user là member
            typeFilters.type = 'INTERNAL';

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
                typeFilters.clubId = clubId;
            } else {
                // Không có clubId: chỉ hiển thị INTERNAL của clubs user là member
                typeFilters.clubId = { in: userClubIds };
            }
        } else if (normalizedType === 'PUBLIC') {
            // Filter PUBLIC: chỉ hiển thị PUBLIC events
            typeFilters.type = 'PUBLIC';
            if (clubId) {
                typeFilters.clubId = clubId;
            }
        } else {
            // Không filter type: hiển thị cả PUBLIC và INTERNAL
            if (clubId && userClubIds.includes(clubId)) {
                // User là member của club này, hiển thị cả PUBLIC và INTERNAL của club này
                typeFilters.clubId = clubId;
                // Không set typeFilters.type để hiển thị cả hai
            } else if (!clubId) {
                // Không filter clubId: hiển thị PUBLIC hoặc INTERNAL của clubs user là member
                typeFilters.OR = [
                    { type: 'PUBLIC' },
                    { type: 'INTERNAL', clubId: { in: userClubIds } }
                ];
            } else {
                // Filter clubId nhưng user không phải member: chỉ xem PUBLIC
                typeFilters.type = 'PUBLIC';
                typeFilters.clubId = clubId;
            }
        }

        // Combine all filters: endTime filter (if exists) + type/club filters + pricing filter
        const allFilters = [];

        // Add endTime filter if exists
        if (where.OR) {
            allFilters.push({ OR: where.OR });
            delete where.OR;
        }

        // Add type/club filters
        if (Object.keys(typeFilters).length > 0) {
            allFilters.push(typeFilters);
        }

        // Add other filters (pricingType, etc.)
        Object.keys(where).forEach(key => {
            if (where[key] !== undefined) {
                allFilters.push({ [key]: where[key] });
            }
        });

        // Build final where clause
        if (allFilters.length === 1) {
            Object.assign(where, allFilters[0]);
        } else if (allFilters.length > 1) {
            Object.keys(where).forEach(key => delete where[key]);
            where.AND = allFilters;
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
                staff: {
                    select: {
                        id: true,
                        userId: true,
                        eventId: true,
                        createdAt: true
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
                staff: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                email: true,
                                fullName: true,
                                studentCode: true,
                                avatarUrl: true,
                                phone: true
                            }
                        }
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
        // userId luôn có giá trị vì đã bắt buộc login
        if (event.type === 'INTERNAL') {
            // Check if user is member of the club
            const membership = await prisma.clubMembership.findFirst({
                where: {
                    clubId: event.clubId,
                    userId: userId,
                    status: 'ACTIVE'
                }
            });

            if (!membership && req.user?.auth_role !== 'ADMIN') {
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

        if (!membership && event.club.leaderUserId !== req.userId && req.user.auth_role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Chỉ club leader mới có quyền cập nhật event này'
            });
        }

        if (event.approvalStatus !== 'PENDING' && req.user?.auth_role !== 'ADMIN') {
            return res.status(400).json({
                success: false,
                message: 'Event đã được duyệt/từ chối, không thể chỉnh sửa'
            });
        }

        // 2.1. Kiểm tra số vé đã bán/đăng ký để quyết định field nào được phép update
        const soldTicketsCount = await prisma.ticket.count({
            where: {
                eventId: eventId,
                status: { in: ['PAID', 'RESERVED', 'USED', 'INIT'] }
            }
        });

        const hasRegistrations = soldTicketsCount > 0;
        const now = new Date();
        const eventStartTime = event.startTime ? new Date(event.startTime) : null;
        const isEventSoon = eventStartTime && (eventStartTime.getTime() - now.getTime()) < 24 * 60 * 60 * 1000; // Còn < 24h

        // 2.2. Chặn update các field quan trọng nếu đã có người đăng ký hoặc event sắp diễn ra
        if (hasRegistrations || isEventSoon) {
            // Không cho update các field ảnh hưởng lớn
            if (type !== undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Không thể thay đổi type (PUBLIC/INTERNAL) khi đã có người đăng ký hoặc event sắp diễn ra'
                });
            }

            if (pricingType !== undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Không thể thay đổi pricingType (FREE/PAID) khi đã có người đăng ký hoặc event sắp diễn ra'
                });
            }

            if (price !== undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Không thể thay đổi giá vé khi đã có người đăng ký hoặc event sắp diễn ra'
                });
            }

            if (format !== undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Không thể thay đổi format (ONLINE/OFFLINE) khi đã có người đăng ký hoặc event sắp diễn ra'
                });
            }

            if (startTime !== undefined || endTime !== undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Không thể thay đổi thời gian diễn ra khi đã có người đăng ký hoặc event sắp diễn ra'
                });
            }
        }

        // 3. Validate pricingType và price nếu có thay đổi
        if (pricingType) {
            if (!['FREE', 'PAID'].includes(pricingType)) {
                return res.status(400).json({
                    success: false,
                    message: 'pricingType phải là FREE hoặc PAID'
                });
            }

            const numericPrice = Number(price);
            if (pricingType === 'PAID' && (!Number.isInteger(numericPrice) || numericPrice <= 0)) {
                return res.status(400).json({
                    success: false,
                    message: 'price phải là số nguyên dương khi pricingType là PAID'
                });
            }
        }

        // Validate capacity nếu thay đổi
        if (capacity !== undefined) {
            const numericCapacity = Number(capacity);
            if (!Number.isInteger(numericCapacity) || numericCapacity <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'capacity phải là số nguyên dương'
                });
            }

            // Capacity mới phải >= số vé đã bán
            if (numericCapacity < soldTicketsCount) {
                return res.status(400).json({
                    success: false,
                    message: `capacity mới (${numericCapacity}) phải lớn hơn hoặc bằng số vé đã bán (${soldTicketsCount})`
                });
            }
        }

        // Validate thời gian nếu thay đổi (không bắt buộc >= 7 ngày, chỉ check hợp lệ và thứ tự)
        if (startTime !== undefined || endTime !== undefined) {
            const nextStart = startTime !== undefined ? new Date(startTime) : event.startTime;
            const nextEnd = endTime !== undefined ? new Date(endTime) : event.endTime;

            if (!nextStart || !nextEnd || Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'startTime/endTime không hợp lệ'
                });
            }

            if (nextStart.getTime() === nextEnd.getTime()) {
                return res.status(400).json({
                    success: false,
                    message: 'endTime không được trùng với startTime'
                });
            }

            if (nextStart >= nextEnd) {
                return res.status(400).json({
                    success: false,
                    message: 'endTime phải sau startTime'
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
        if (price !== undefined) updateData.price = Number(price);
        if (capacity !== undefined) updateData.capacity = Number(capacity);
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

        // Ghi nhật ký cập nhật sự kiện
        const auditLogController = require('./AuditLogController');
        auditLogController.createAuditLog({
            action: 'UPDATE_EVENT',
            userId: req.userId,
            userEmail: req.user?.email || null,
            details: `Cập nhật sự kiện: ${updatedEvent.title}`,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent'),
            metadata: { eventId: updatedEvent.id, clubId: updatedEvent.club?.id }
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
        // Ghi nhật ký xóa sự kiện
        const auditLogController = require('./AuditLogController');
        auditLogController.createAuditLog({
            action: 'DELETE_EVENT',
            userId: req.userId,
            userEmail: req.user?.email || null,
            details: `Xóa sự kiện: ${event.title}`,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent'),
            metadata: { eventId }
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
        if (quantity !== 1) {
            return res.status(400).json({
                success: false,
                message: 'Chỉ được mua 1 vé cho chính bạn'
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
                approvalStatus: true,
                startTime: true,
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

        // 4.1 Kiểm tra trạng thái duyệt quỹ
        if (event.approvalStatus !== 'APPROVED') {
            return res.status(400).json({
                success: false,
                message: 'Event chưa được duyệt quỹ, không thể đăng ký'
            });
        }

        // 4.2 Đóng cổng đăng ký trước giờ bắt đầu 1 giờ
        if (event.startTime) {
            const now = new Date();
            const startTime = new Date(event.startTime);
            if (startTime - now <= 60 * 60 * 1000) {
                return res.status(400).json({
                    success: false,
                    message: 'Đã đóng đăng ký: event sẽ diễn ra trong vòng 1 giờ'
                });
            }
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

        // 5. Kiểm tra user đã có vé chưa (chặn cả pending)
        const existingPaidTickets = await prisma.ticket.findMany({
            where: {
                eventId: eventId,
                userId: userId,
                status: { in: ['PAID', 'USED', 'RESERVED', 'INIT'] }
            }
        });

        if (existingPaidTickets.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Bạn đã đăng ký event này rồi'
            });
        }

        // Lấy thông tin user để set holder info
        const purchaser = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                fullName: true,
                email: true,
                phone: true
            }
        });

        // 6. Xử lý theo pricingType
        if (event.pricingType === 'FREE') {
            // FREE: Tạo ticket ngay
            const tickets = [];

            for (let i = 0; i < quantity; i++) {
                const holderName = purchaser?.fullName || purchaser?.email || 'Người tham dự';
                const holderEmail = purchaser?.email || null;
                const holderPhone = purchaser?.phone || null;

                const ticketData = {
                    eventId: eventId,
                    userId: userId,
                    ticketType: ticketType || 'STANDARD',
                    price: 0,
                    holderName: holderName,
                    holderEmail: holderEmail,
                    holderPhone: holderPhone,
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

                // Tạo EventRegistration cho mỗi ticket (chỉ tạo 1 lần cho user đầu tiên)
                if (i === 0) {
                    await prisma.eventRegistration.create({
                        data: {
                            eventId: eventId,
                            clubId: event.clubId, // Thêm clubId để query nhanh hơn
                            userId: userId,
                            ticketId: ticket.id,
                            registeredAt: new Date()
                        }
                    });
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
                const holderName = user.fullName || user.email || 'Người tham dự';
                const holderEmail = user.email || null;
                const holderPhone = user.phone || null;

                const ticketData = {
                    eventId: eventId,
                    userId: userId,
                    ticketType: ticketType || 'STANDARD',
                    price: event.price,
                    holderName: holderName,
                    holderEmail: holderEmail,
                    holderPhone: holderPhone,
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

                // Tạo EventRegistration cho user nếu chưa có (tránh trùng eventId + userId)
                if (i === 0) {
                    const existingRegistration = await prisma.eventRegistration.findFirst({
                        where: {
                            eventId: eventId,
                            userId: userId
                        }
                    });

                    if (!existingRegistration) {
                        await prisma.eventRegistration.create({
                            data: {
                                eventId: eventId,
                                clubId: event.clubId, // Thêm clubId
                                userId: userId,
                                ticketId: ticket.id,
                                registeredAt: new Date()
                            }
                        });
                    }
                }

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

/**
 * Lấy danh sách người tham gia event (đã đăng ký)
 * Club Leader hoặc Staff có thể xem danh sách
 */
exports.getEventParticipants = async (req, res) => {
    try {
        const { eventId } = req.params;
        const { checkedIn, search } = req.query; // checkedIn: true/false, search: email hoặc tên
        const userId = req.userId;

        // 1. Tìm event
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            include: {
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

        // 2. Kiểm tra quyền:
        // - Club leader / staff / admin trong membership (còn ACTIVE)
        // - HOẶC là event staff của sự kiện *và* đang là member ACTIVE của CLB
        const activeMembership = await prisma.clubMembership.findFirst({
            where: {
                clubId: event.clubId,
                userId: userId,
                status: 'ACTIVE'
            }
        });

        const isLeaderOrClubAdminOrStaff =
            !!activeMembership &&
            ['LEADER', 'STAFF', 'ADMIN'].includes(activeMembership.role);

        // Event staff (không phụ thuộc membership còn hạn hay không)
        const eventStaff = await prisma.eventStaff.findFirst({
            where: {
                eventId: event.id,
                userId: userId,
                isActive: true
            }
        });

        // Staff hợp lệ phải vừa có membership ACTIVE, vừa nằm trong event_staff
        const isEventStaffWithActiveMembership = !!eventStaff && !!activeMembership;

        if (!isLeaderOrClubAdminOrStaff && !isEventStaffWithActiveMembership && req.user?.auth_role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Chỉ club leader, staff hoặc admin mới có quyền xem danh sách người tham gia'
            });
        }

        // 3. Build where clause
        const where = {
            eventId: eventId
        };

        // Filter theo checkedIn status
        if (checkedIn === 'true') {
            where.checkedInAt = { not: null };
        } else if (checkedIn === 'false') {
            where.checkedInAt = null;
        }

        // 4. Lấy danh sách registrations
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

        // 5. Filter theo search nếu có
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

        // 6. Format response
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
                event: {
                    id: event.id,
                    title: event.title,
                    format: event.format,
                    startTime: event.startTime,
                    endTime: event.endTime,
                    club: event.club
                },
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

/**
 * Duyệt event (Treasurer hoặc Admin)
 * - Kiểm tra quỹ có đủ không
 * - Cập nhật fund request + event
 */
exports.approveEvent = async (req, res) => {
    try {
        const { eventId } = req.params;
        const { proofImageUrl } = req.body;
        const reviewerId = req.userId;

        const uploadedProof = req.file ? `/uploads/${req.file.filename}` : null;
        const finalProofUrl = (proofImageUrl && proofImageUrl.trim()) || uploadedProof;

        if (!finalProofUrl) {
            return res.status(400).json({
                success: false,
                message: 'Cần cung cấp hình ảnh chuyển khoản xác nhận (upload file hoặc proofImageUrl)'
            });
        }

        const event = await prisma.event.findUnique({
            where: { id: eventId },
            include: {
                club: true,
                fundRequests: {
                    include: { items: true },
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy event'
            });
        }

        // Chỉ treasurer hoặc admin được duyệt
        const treasurer = await prisma.clubMembership.findFirst({
            where: {
                clubId: event.clubId,
                userId: reviewerId,
                status: 'ACTIVE',
                role: 'TREASURER'
            }
        });

        if (!treasurer && req.user?.auth_role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Chỉ thủ quỹ hoặc admin mới được duyệt event'
            });
        }

        if (event.approvalStatus !== 'PENDING') {
            return res.status(400).json({
                success: false,
                message: 'Event đã được xử lý trước đó'
            });
        }

        const fundRequest = event.fundRequests?.[0];
        if (!fundRequest || fundRequest.status !== 'PENDING') {
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy fund request chờ duyệt'
            });
        }

        // Kiểm tra số dư quỹ
        const incomeAgg = await prisma.clubLedger.aggregate({
            where: { clubId: event.clubId, type: 'INCOME' },
            _sum: { amount: true }
        });
        const expenseAgg = await prisma.clubLedger.aggregate({
            where: { clubId: event.clubId, type: 'EXPENSE' },
            _sum: { amount: true }
        });
        const currentBalance = (incomeAgg._sum.amount || 0) - (expenseAgg._sum.amount || 0);

        if (currentBalance < fundRequest.amount) {
            return res.status(400).json({
                success: false,
                message: `Quỹ hiện có ${currentBalance} VND, không đủ so với yêu cầu ${fundRequest.amount} VND`
            });
        }

        // Tính số dư sau khi chi (để lưu vào ledger)
        const balanceAfter = currentBalance - fundRequest.amount;

        // Tạo ledger entry để ghi nhận chi tiền + update fund request + event
        const [ledgerEntry, updatedFund, updatedEvent] = await prisma.$transaction([
            // Tạo ledger entry ghi nhận chi tiền
            prisma.clubLedger.create({
                data: {
                    clubId: event.clubId,
                    type: 'EXPENSE',
                    fundRequestId: fundRequest.id,
                    amount: fundRequest.amount,
                    balanceAfter: balanceAfter,
                    note: `Chi quỹ cho event: ${event.title}`
                }
            }),
            // Update fund request
            prisma.fundRequest.update({
                where: { id: fundRequest.id },
                data: {
                    status: 'APPROVED',
                    approvedById: reviewerId,
                    reviewedAt: new Date(),
                    disbursedAt: new Date(),
                    proofImageUrl: finalProofUrl
                },
                include: { items: true }
            }),
            // Update event
            prisma.event.update({
                where: { id: eventId },
                data: {
                    approvalStatus: 'APPROVED',
                    approvalById: reviewerId,
                    approvalAt: new Date(),
                    isActive: true
                }
            })
        ]);

        res.status(200).json({
            success: true,
            message: 'Duyệt event thành công',
            data: {
                event: updatedEvent,
                fundRequest: updatedFund,
                ledgerEntry: {
                    id: ledgerEntry.id,
                    amount: ledgerEntry.amount,
                    balanceAfter: ledgerEntry.balanceAfter,
                    note: ledgerEntry.note
                },
                previousBalance: currentBalance,
                newBalance: balanceAfter
            }
        });
    } catch (error) {
        console.error('Approve Event Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi duyệt event'
        });
    }
};

/**
 * Từ chối event (Treasurer hoặc Admin)
 */
exports.rejectEvent = async (req, res) => {
    try {
        const { eventId } = req.params;
        const { reason } = req.body;
        const reviewerId = req.userId;

        if (!reason || reason.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Cần cung cấp lý do từ chối'
            });
        }

        const event = await prisma.event.findUnique({
            where: { id: eventId },
            include: {
                club: true,
                fundRequests: {
                    include: { items: true },
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy event'
            });
        }

        // Chỉ treasurer hoặc admin được từ chối
        const treasurer = await prisma.clubMembership.findFirst({
            where: {
                clubId: event.clubId,
                userId: reviewerId,
                status: 'ACTIVE',
                role: 'TREASURER'
            }
        });

        if (!treasurer && req.user?.auth_role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Chỉ thủ quỹ hoặc admin mới được từ chối event'
            });
        }

        if (event.approvalStatus !== 'PENDING') {
            return res.status(400).json({
                success: false,
                message: 'Event đã được xử lý trước đó'
            });
        }

        const fundRequest = event.fundRequests?.[0];
        if (!fundRequest || fundRequest.status !== 'PENDING') {
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy fund request chờ duyệt'
            });
        }

        const [updatedFund, updatedEvent] = await prisma.$transaction([
            prisma.fundRequest.update({
                where: { id: fundRequest.id },
                data: {
                    status: 'REJECTED',
                    approvedById: reviewerId,
                    reviewedAt: new Date(),
                    rejectReason: reason.trim()
                },
                include: { items: true }
            }),
            prisma.event.update({
                where: { id: eventId },
                data: {
                    approvalStatus: 'REJECTED',
                    approvalById: reviewerId,
                    approvalAt: new Date(),
                    isActive: false
                }
            })
        ]);

        res.status(200).json({
            success: true,
            message: 'Từ chối event thành công',
            data: {
                event: updatedEvent,
                fundRequest: updatedFund
            }
        });
    } catch (error) {
        console.error('Reject Event Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi từ chối event'
        });
    }
};

/**
 * Lấy danh sách events chờ duyệt quỹ của club (Treasurer hoặc Admin)
 */
exports.getPendingEvents = async (req, res) => {
    try {
        const { clubId } = req.query;
        const userId = req.userId;

        if (!clubId) {
            return res.status(400).json({
                success: false,
                message: 'Cần cung cấp clubId'
            });
        }

        // Kiểm tra quyền: chỉ treasurer hoặc admin
        const treasurer = await prisma.clubMembership.findFirst({
            where: {
                clubId: clubId,
                userId: userId,
                status: 'ACTIVE',
                role: 'TREASURER'
            }
        });

        if (!treasurer && req.user?.auth_role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Chỉ thủ quỹ hoặc admin mới có quyền xem danh sách events chờ duyệt'
            });
        }

        // Lấy events chờ duyệt của club
        const events = await prisma.event.findMany({
            where: {
                clubId: clubId,
                approvalStatus: 'PENDING'
            },
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
                        email: true,
                        fullName: true
                    }
                },
                fundRequests: {
                    include: {
                        items: true
                    },
                    orderBy: {
                        createdAt: 'desc'
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

        // Tính số dư quỹ hiện tại
        const incomeAgg = await prisma.clubLedger.aggregate({
            where: { clubId: clubId, type: 'INCOME' },
            _sum: { amount: true }
        });
        const expenseAgg = await prisma.clubLedger.aggregate({
            where: { clubId: clubId, type: 'EXPENSE' },
            _sum: { amount: true }
        });
        const balance = (incomeAgg._sum.amount || 0) - (expenseAgg._sum.amount || 0);

        // Chuẩn hóa fundRequests: đổi amount -> totalAmount
        const mappedEvents = events.map(ev => ({
            ...ev,
            fundRequests: ev.fundRequests?.map(fr => {
                const { amount, ...rest } = fr;
                return {
                    ...rest,
                    totalAmount: amount
                };
            })
        }));

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách events chờ duyệt thành công',
            data: {
                events: mappedEvents,
                clubBalance: balance,
                count: events.length
            }
        });

    } catch (error) {
        console.error('Get Pending Events Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi lấy danh sách events chờ duyệt'
        });
    }
};

/**
 * Tạo payment link cho fund request (Treasurer only)
 */
exports.createFundRequestPayment = async (req, res) => {
    try {
        const { eventId } = req.params;
        const userId = req.userId;

        // 1. Tìm event và fund request
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            include: {
                club: true,
                fundRequests: {
                    include: {
                        items: true
                    },
                    orderBy: {
                        createdAt: 'desc'
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

        // 2. Kiểm tra quyền: chỉ treasurer hoặc admin
        const treasurer = await prisma.clubMembership.findFirst({
            where: {
                clubId: event.clubId,
                userId: userId,
                status: 'ACTIVE',
                role: 'TREASURER'
            }
        });

        if (!treasurer && req.user?.auth_role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Chỉ thủ quỹ hoặc admin mới có quyền tạo payment link cho fund request'
            });
        }

        // 3. Kiểm tra event status
        if (event.approvalStatus !== 'PENDING') {
            return res.status(400).json({
                success: false,
                message: 'Event không ở trạng thái chờ duyệt'
            });
        }

        const fundRequest = event.fundRequests?.[0];
        if (!fundRequest || fundRequest.status !== 'PENDING') {
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy fund request chờ duyệt'
            });
        }

        // 4. Kiểm tra số dư quỹ (bắt buộc: nếu thiếu thì không tạo payment)
        const incomeAgg = await prisma.clubLedger.aggregate({
            where: { clubId: event.clubId, type: 'INCOME' },
            _sum: { amount: true }
        });
        const expenseAgg = await prisma.clubLedger.aggregate({
            where: { clubId: event.clubId, type: 'EXPENSE' },
            _sum: { amount: true }
        });
        const balance = (incomeAgg._sum.amount || 0) - (expenseAgg._sum.amount || 0);

        if (balance < fundRequest.amount) {
            return res.status(400).json({
                success: false,
                message: `Quỹ hiện có ${balance} VND, thiếu ${fundRequest.amount - balance} VND so với yêu cầu. Không thể tạo payment link.`
            });
        }

        // 5. Lấy thông tin treasurer
        const treasurerUser = await prisma.user.findUnique({
            where: { id: userId }
        });

        // 6. Tạo orderCode
        const orderCode = parseInt(Date.now().toString().slice(-10)) + Math.floor(Math.random() * 1000);

        // 7. Tạo transaction để track payment
        const transaction = await prisma.transaction.create({
            data: {
                clubId: event.clubId,
                userId: userId,
                type: 'FUND_REQ',
                amount: fundRequest.amount,
                currency: 'VND',
                paymentMethod: 'PAYOS',
                status: 'PENDING',
                paymentReference: orderCode.toString()
            }
        });

        // 8. Tạo payment link từ PayOS
        let paymentResult;
        try {
            paymentResult = await payosService.createPaymentLink({
                orderCode: orderCode,
                amount: fundRequest.amount,
                description: `Thanh toán quỹ: ${fundRequest.title}`,
                buyerName: treasurerUser.fullName || treasurerUser.email,
                buyerEmail: treasurerUser.email,
                buyerPhone: treasurerUser.phone || '',
                items: fundRequest.items.map(item => ({
                    name: item.name,
                    quantity: 1,
                    price: item.amount
                })),
                expireMinutes: 60 // Hết hạn sau 60 phút
            });
        } catch (payosError) {
            // Nếu PayOS API fail, update transaction status
            console.error('PayOS API Error:', payosError);
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

            throw new Error(`Không thể tạo payment link từ PayOS: ${payosError.message}`);
        }

        // 9. Lấy QR code: ưu tiên QR code từ PayOS (thanh toán trực tiếp), nếu không có thì generate từ payment link
        let qrCodeDataUrl = null;
        if (paymentResult.qrCode) {
            // PayOS trả về QR code thanh toán trực tiếp (VietQR)
            qrCodeDataUrl = paymentResult.qrCode;
        } else {
            // Fallback: generate QR code từ payment link (navigate tới trang PayOS)
            try {
                qrCodeDataUrl = await QRCode.toDataURL(paymentResult.paymentLink);
            } catch (qrError) {
                console.error('Error generating QR code:', qrError);
            }
        }

        // 10. Cập nhật transaction với PayOS data
        await prisma.transaction.update({
            where: { id: transaction.id },
            data: {
                qr_code: qrCodeDataUrl,
                time_out: paymentResult.expiredAt,
                payosPayload: JSON.stringify({
                    orderCode: orderCode,
                    checkoutUrl: paymentResult.paymentLink,
                    qrCode: paymentResult.qrCode || null,
                    fundRequestId: fundRequest.id,
                    eventId: eventId,
                    ...paymentResult.data
                })
            }
        });

        res.status(200).json({
            success: true,
            message: 'Tạo payment link thành công',
            data: {
                eventId: eventId,
                eventTitle: event.title,
                fundRequestId: fundRequest.id,
                fundRequestTitle: fundRequest.title,
                amount: fundRequest.amount,
                clubBalance: balance,
                transactionId: transaction.id,
                paymentLink: paymentResult.paymentLink,
                qrCode: qrCodeDataUrl,
                timeOut: paymentResult.expiredAt,
                orderCode: orderCode,
                note: balance < fundRequest.amount
                    ? `Cảnh báo: Quỹ hiện có ${balance} VND, thiếu ${fundRequest.amount - balance} VND so với yêu cầu`
                    : 'Quỹ đủ để thanh toán'
            }
        });

    } catch (error) {
        console.error('Create Fund Request Payment Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi tạo payment link'
        });
    }
};

/**
 * Gửi hoặc cập nhật feedback cho event
 * Điều kiện:
 *  - Đã đăng ký event (có event_registrations)
 *  - Đã check-in (checkedInAt != null)
 *  - Event đã diễn ra (sau startTime) và đã kết thúc nếu có endTime
 */
exports.createEventFeedback = async (req, res) => {
    try {
        const { eventId } = req.params;
        const { rating, comment } = req.body;
        const userId = req.userId;

        // Validate rating
        const numericRating = Number(rating);
        if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
            return res.status(400).json({
                success: false,
                message: 'rating phải là số nguyên từ 1 đến 5'
            });
        }

        // Lấy thông tin event
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            select: { id: true, startTime: true, endTime: true, title: true }
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy event'
            });
        }

        if (!event.startTime) {
            return res.status(400).json({
                success: false,
                message: 'Event chưa có thời gian bắt đầu, không thể feedback'
            });
        }

        const now = new Date();
        const eventHasStarted = now >= new Date(event.startTime);
        const eventHasEnded = event.endTime ? now >= new Date(event.endTime) : eventHasStarted;

        if (!eventHasStarted) {
            return res.status(400).json({
                success: false,
                message: 'Event chưa bắt đầu, vui lòng feedback sau khi sự kiện diễn ra'
            });
        }

        // Nếu có endTime, yêu cầu event đã kết thúc
        if (event.endTime && !eventHasEnded) {
            return res.status(400).json({
                success: false,
                message: 'Event chưa kết thúc, vui lòng feedback sau khi sự kiện kết thúc'
            });
        }

        // Kiểm tra đăng ký và check-in
        const registration = await prisma.eventRegistration.findFirst({
            where: { eventId, userId },
            select: { id: true, checkedInAt: true, registeredAt: true }
        });

        if (!registration) {
            return res.status(403).json({
                success: false,
                message: 'Bạn chưa đăng ký sự kiện này nên không thể feedback'
            });
        }

        if (!registration.checkedInAt) {
            return res.status(403).json({
                success: false,
                message: 'Bạn cần check-in sự kiện trước khi feedback'
            });
        }

        // Tạo mới feedback (không cho sửa lại nếu đã đánh giá)
        const existingFeedback = await prisma.feedback.findFirst({
            where: { eventId, userId }
        });

        if (existingFeedback) {
            return res.status(400).json({
                success: false,
                message: 'Bạn đã đánh giá sự kiện này rồi, không thể đánh giá lại'
            });
        }

        const savedFeedback = await prisma.feedback.create({
            data: {
                eventId,
                userId,
                rating: numericRating,
                comment: comment?.trim() || null
            }
        });

        res.status(200).json({
            success: true,
            message: 'Ghi nhận feedback thành công',
            data: savedFeedback
        });
    } catch (error) {
        console.error('Create Event Feedback Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi lưu feedback'
        });
    }
};

/**
 * Lấy danh sách feedback của một event
 */
exports.getEventFeedbacks = async (req, res) => {
    try {
        const { eventId } = req.params;

        const event = await prisma.event.findUnique({
            where: { id: eventId },
            select: { id: true, title: true }
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy event'
            });
        }

        const [feedbacks, stats] = await Promise.all([
            prisma.feedback.findMany({
                where: { eventId },
                orderBy: { createdAt: 'desc' },
                include: {
                    user: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                            avatarUrl: true
                        }
                    }
                }
            }),
            prisma.feedback.aggregate({
                where: { eventId },
                _avg: { rating: true },
                _count: { _all: true }
            })
        ]);

        res.status(200).json({
            success: true,
            message: 'Lấy feedback thành công',
            data: {
                eventId: event.id,
                eventTitle: event.title,
                total: stats._count._all || 0,
                averageRating: stats._avg.rating ? Number(stats._avg.rating.toFixed(2)) : null,
                feedbacks
            }
        });
    } catch (error) {
        console.error('Get Event Feedbacks Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi lấy feedback'
        });
    }
};

/**
 * Lấy thống kê thu chi tháng hiện tại (Treasurer hoặc Admin)
 */
exports.getMonthlyStats = async (req, res) => {
    try {
        const { clubId } = req.params;
        const userId = req.userId;

        if (!clubId) {
            return res.status(400).json({
                success: false,
                message: 'Cần cung cấp clubId'
            });
        }

        // Kiểm tra quyền: chỉ treasurer hoặc admin
        const treasurer = await prisma.clubMembership.findFirst({
            where: {
                clubId: clubId,
                userId: userId,
                status: 'ACTIVE',
                role: 'TREASURER'
            }
        });

        if (!treasurer && req.user?.auth_role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Chỉ thủ quỹ hoặc admin mới có quyền xem thống kê thu chi'
            });
        }

        // Tính toán thời gian đầu và cuối tháng hiện tại
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        // Tính tổng thu nhập trong tháng
        const monthlyIncomeAgg = await prisma.clubLedger.aggregate({
            where: {
                clubId: clubId,
                type: 'INCOME',
                createdAt: {
                    gte: startOfMonth,
                    lte: endOfMonth
                }
            },
            _sum: { amount: true }
        });

        // Tính tổng chi tiêu trong tháng
        const monthlyExpenseAgg = await prisma.clubLedger.aggregate({
            where: {
                clubId: clubId,
                type: 'EXPENSE',
                createdAt: {
                    gte: startOfMonth,
                    lte: endOfMonth
                }
            },
            _sum: { amount: true }
        });

        // Tính số dư tổng (tất cả thời gian)
        const totalIncomeAgg = await prisma.clubLedger.aggregate({
            where: { clubId: clubId, type: 'INCOME' },
            _sum: { amount: true }
        });
        const totalExpenseAgg = await prisma.clubLedger.aggregate({
            where: { clubId: clubId, type: 'EXPENSE' },
            _sum: { amount: true }
        });
        const balance = (totalIncomeAgg._sum.amount || 0) - (totalExpenseAgg._sum.amount || 0);

        const monthlyIncome = monthlyIncomeAgg._sum.amount || 0;
        const monthlyExpense = monthlyExpenseAgg._sum.amount || 0;

        res.status(200).json({
            success: true,
            message: 'Lấy thống kê thu chi tháng thành công',
            data: {
                monthlyIncome,
                monthlyExpense,
                balance
            }
        });

    } catch (error) {
        console.error('Get Monthly Stats Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi lấy thống kê thu chi'
        });
    }
};

/**
 * Lấy dữ liệu biểu đồ thu chi và phân bổ thu nhập (Treasurer hoặc Admin)
 */
exports.getChartData = async (req, res) => {
    try {
        const { clubId } = req.params;
        const userId = req.userId;

        if (!clubId) {
            return res.status(400).json({
                success: false,
                message: 'Cần cung cấp clubId'
            });
        }

        // Kiểm tra quyền: chỉ treasurer hoặc admin
        const treasurer = await prisma.clubMembership.findFirst({
            where: {
                clubId: clubId,
                userId: userId,
                status: 'ACTIVE',
                role: 'TREASURER'
            }
        });

        if (!treasurer && req.user?.auth_role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Chỉ thủ quỹ hoặc admin mới có quyền xem dữ liệu biểu đồ'
            });
        }

        // Lấy dữ liệu ledger trong 6 tháng gần nhất
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        sixMonthsAgo.setDate(1);
        sixMonthsAgo.setHours(0, 0, 0, 0);

        const ledgerEntries = await prisma.clubLedger.findMany({
            where: {
                clubId: clubId,
                createdAt: {
                    gte: sixMonthsAgo
                }
            },
            include: {
                transaction: {
                    select: {
                        type: true
                    }
                }
            },
            orderBy: {
                createdAt: 'asc'
            }
        });

        // 1. Dữ liệu biểu đồ thu chi theo thời gian (group by month)
        const incomeExpenseByMonth = {};
        
        ledgerEntries.forEach(entry => {
            const date = new Date(entry.createdAt);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            
            if (!incomeExpenseByMonth[monthKey]) {
                incomeExpenseByMonth[monthKey] = {
                    month: monthKey,
                    income: 0,
                    expense: 0
                };
            }
            
            if (entry.type === 'INCOME') {
                incomeExpenseByMonth[monthKey].income += entry.amount;
            } else if (entry.type === 'EXPENSE') {
                incomeExpenseByMonth[monthKey].expense += entry.amount;
            }
        });

        // Convert to array and format month labels
        const incomeExpenseData = Object.values(incomeExpenseByMonth).map(item => {
            const [year, month] = item.month.split('-');
            const monthNames = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
            return {
                month: `${monthNames[parseInt(month) - 1]}/${year.slice(-2)}`,
                income: item.income,
                expense: item.expense
            };
        });

        // 2. Phân bổ thu nhập theo nguồn (MEMBERSHIP vs EVENT_TICKET)
        const incomeBySource = {
            membership: 0,
            eventTickets: 0,
            other: 0
        };

        ledgerEntries.forEach(entry => {
            if (entry.type === 'INCOME' && entry.transaction) {
                if (entry.transaction.type === 'MEMBERSHIP') {
                    incomeBySource.membership += entry.amount;
                } else if (entry.transaction.type === 'EVENT_TICKET') {
                    incomeBySource.eventTickets += entry.amount;
                } else {
                    incomeBySource.other += entry.amount;
                }
            } else if (entry.type === 'INCOME' && !entry.transaction) {
                // Income without transaction (manual entries if any)
                incomeBySource.other += entry.amount;
            }
        });

        // Format income distribution data
        const incomeDistribution = [
            {
                name: 'Phí thành viên',
                value: incomeBySource.membership,
                color: '#3b82f6' // blue
            },
            {
                name: 'Vé sự kiện',
                value: incomeBySource.eventTickets,
                color: '#10b981' // green
            },
            {
                name: 'Khác',
                value: incomeBySource.other,
                color: '#6b7280' // gray
            }
        ].filter(item => item.value > 0); // Only include sources with income

        res.status(200).json({
            success: true,
            message: 'Lấy dữ liệu biểu đồ thành công',
            data: {
                incomeExpenseOverTime: incomeExpenseData,
                incomeDistribution: incomeDistribution
            }
        });

    } catch (error) {
        console.error('Get Chart Data Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi lấy dữ liệu biểu đồ'
        });
    }
};

/**
 * Lấy danh sách ledger entries của club (Treasurer hoặc Admin)
 */
exports.getClubLedgerEntries = async (req, res) => {
    try {
        const { clubId } = req.params;
        const userId = req.userId;
        const { type, startDate, endDate, page = 1, limit = 50 } = req.query;

        if (!clubId) {
            return res.status(400).json({
                success: false,
                message: 'Cần cung cấp clubId'
            });
        }

        // Kiểm tra quyền: chỉ treasurer hoặc admin
        const treasurer = await prisma.clubMembership.findFirst({
            where: {
                clubId: clubId,
                userId: userId,
                status: 'ACTIVE',
                role: 'TREASURER'
            }
        });

        if (!treasurer && req.user?.auth_role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Chỉ thủ quỹ hoặc admin mới có quyền xem sổ cái'
            });
        }

        // Build where clause
        const where = {
            clubId: clubId
        };

        if (type && (type === 'INCOME' || type === 'EXPENSE')) {
            where.type = type;
        }

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) {
                where.createdAt.gte = new Date(startDate);
            }
            if (endDate) {
                const endDateTime = new Date(endDate);
                endDateTime.setHours(23, 59, 59, 999);
                where.createdAt.lte = endDateTime;
            }
        }

        // Pagination
        const pageNum = parseInt(page) || 1;
        const limitNum = Math.min(parseInt(limit) || 50, 100); // Max 100 per page
        const skip = (pageNum - 1) * limitNum;

        // Get ledger entries with related data
        const [entries, total] = await Promise.all([
            prisma.clubLedger.findMany({
                where,
                include: {
                    transaction: {
                        select: {
                            id: true,
                            type: true,
                            amount: true,
                            status: true
                        }
                    },
                    fundRequest: {
                        select: {
                            id: true,
                            title: true,
                            amount: true
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                },
                skip,
                take: limitNum
            }),
            prisma.clubLedger.count({ where })
        ]);

        // Format response
        const formattedEntries = entries.map(entry => ({
            id: entry.id,
            clubId: entry.clubId,
            type: entry.type,
            transactionId: entry.transactionId,
            fundRequestId: entry.fundRequestId,
            amount: entry.amount,
            balanceAfter: entry.balanceAfter,
            note: entry.note,
            createdAt: entry.createdAt.toISOString(),
            transaction: entry.transaction ? {
                id: entry.transaction.id,
                type: entry.transaction.type,
                amount: entry.transaction.amount,
                status: entry.transaction.status
            } : null,
            fundRequest: entry.fundRequest ? {
                id: entry.fundRequest.id,
                title: entry.fundRequest.title,
                totalAmount: entry.fundRequest.amount
            } : null
        }));

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách sổ cái thành công',
            data: formattedEntries,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
                hasNext: pageNum * limitNum < total,
                hasPrev: pageNum > 1
            }
        });

    } catch (error) {
        console.error('Get Club Ledger Entries Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi lấy danh sách sổ cái'
        });
    }
};

/**
 * Lấy danh sách transactions của club (Treasurer hoặc Admin)
 */
exports.getClubTransactions = async (req, res) => {
    try {
        const { clubId } = req.params;
        const userId = req.userId;
        const { type, status, startDate, endDate, page = 1, limit = 50 } = req.query;

        if (!clubId) {
            return res.status(400).json({
                success: false,
                message: 'Cần cung cấp clubId'
            });
        }

        // Kiểm tra quyền: chỉ treasurer hoặc admin
        const treasurer = await prisma.clubMembership.findFirst({
            where: {
                clubId: clubId,
                userId: userId,
                status: 'ACTIVE',
                role: 'TREASURER'
            }
        });

        if (!treasurer && req.user?.auth_role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Chỉ thủ quỹ hoặc admin mới có quyền xem giao dịch của club'
            });
        }

        // Build where clause
        const where = {
            clubId: clubId
        };

        if (type) {
            where.type = type;
        }

        if (status) {
            where.status = status;
        }

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) {
                where.createdAt.gte = new Date(startDate);
            }
            if (endDate) {
                const endDateTime = new Date(endDate);
                endDateTime.setHours(23, 59, 59, 999);
                where.createdAt.lte = endDateTime;
            }
        }

        // Pagination
        const pageNum = parseInt(page) || 1;
        const limitNum = Math.min(parseInt(limit) || 50, 100); // Max 100 per page
        const skip = (pageNum - 1) * limitNum;

        // Get transactions with related data
        const [transactions, total] = await Promise.all([
            prisma.transaction.findMany({
                where,
                include: {
                    club: {
                        select: {
                            id: true,
                            name: true,
                            logoUrl: true
                        }
                    },
                    referenceTicket: {
                        select: {
                            id: true,
                            event: {
                                select: {
                                    id: true,
                                    title: true
                                }
                            }
                        }
                    },
                    referenceMembership: {
                        select: {
                            id: true,
                            club: {
                                select: {
                                    id: true,
                                    name: true
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                },
                skip,
                take: limitNum
            }),
            prisma.transaction.count({ where })
        ]);

        // Format response
        const formattedTransactions = transactions.map(tx => ({
            id: tx.id,
            clubId: tx.clubId,
            userId: tx.userId,
            type: tx.type,
            amount: tx.amount,
            currency: tx.currency,
            paymentMethod: tx.paymentMethod,
            paymentReference: tx.paymentReference,
            status: tx.status,
            createdAt: tx.createdAt.toISOString(),
            confirmedAt: tx.confirmedAt ? tx.confirmedAt.toISOString() : null,
            club: tx.club ? {
                id: tx.club.id,
                name: tx.club.name,
                logoUrl: tx.club.logoUrl
            } : null,
            referenceTicket: tx.referenceTicket ? {
                id: tx.referenceTicket.id,
                event: tx.referenceTicket.event
            } : null,
            referenceMembership: tx.referenceMembership ? {
                id: tx.referenceMembership.id,
                club: tx.referenceMembership.club
            } : null
        }));

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách giao dịch thành công',
            data: formattedTransactions,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
                hasNext: pageNum * limitNum < total,
                hasPrev: pageNum > 1
            }
        });

    } catch (error) {
        console.error('Get Club Transactions Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi lấy danh sách giao dịch'
        });
    }
};

/**
 * Export financial report for a club (Treasurer or Admin)
 */
exports.exportReport = async (req, res) => {
    try {
        const { clubId } = req.params;
        const userId = req.userId;
        const { reportType, startDate, endDate, format = 'excel' } = req.body;

        if (!clubId) {
            return res.status(400).json({
                success: false,
                message: 'Cần cung cấp clubId'
            });
        }

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Cần cung cấp khoảng thời gian (startDate và endDate)'
            });
        }

        // Kiểm tra quyền: chỉ treasurer hoặc admin
        const treasurer = await prisma.clubMembership.findFirst({
            where: {
                clubId: clubId,
                userId: userId,
                status: 'ACTIVE',
                role: 'TREASURER'
            }
        });

        if (!treasurer && req.user?.auth_role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Chỉ thủ quỹ hoặc admin mới có quyền xuất báo cáo'
            });
        }

        // Lấy thông tin club
        const club = await prisma.club.findUnique({
            where: { id: clubId },
            select: { id: true, name: true, slug: true }
        });

        if (!club) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy câu lạc bộ'
            });
        }

        // Parse dates
        const startDateTime = new Date(startDate);
        startDateTime.setHours(0, 0, 0, 0);
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);

        // Lấy dữ liệu ledger entries trong khoảng thời gian
        const ledgerEntries = await prisma.clubLedger.findMany({
            where: {
                clubId: clubId,
                createdAt: {
                    gte: startDateTime,
                    lte: endDateTime
                }
            },
            include: {
                transaction: {
                    select: {
                        id: true,
                        type: true,
                        amount: true,
                        status: true,
                        createdAt: true
                    }
                },
                fundRequest: {
                    select: {
                        id: true,
                        title: true,
                        amount: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // Lấy dữ liệu transactions trong khoảng thời gian
        const transactions = await prisma.transaction.findMany({
            where: {
                clubId: clubId,
                createdAt: {
                    gte: startDateTime,
                    lte: endDateTime
                }
            },
            include: {
                referenceTicket: {
                    select: {
                        event: {
                            select: {
                                title: true
                            }
                        }
                    }
                },
                referenceMembership: {
                    select: {
                        club: {
                            select: {
                                name: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // Tính tổng hợp
        const totalIncome = ledgerEntries
            .filter(e => e.type === 'INCOME')
            .reduce((sum, e) => sum + e.amount, 0);
        const totalExpense = ledgerEntries
            .filter(e => e.type === 'EXPENSE')
            .reduce((sum, e) => sum + e.amount, 0);
        const netBalance = totalIncome - totalExpense;

        // Tạo dữ liệu báo cáo dựa trên reportType
        let reportData = [];
        let reportTitle = '';

        switch (reportType) {
            case 'income-statement':
                reportTitle = 'Báo cáo thu nhập';
                reportData = ledgerEntries
                    .filter(e => e.type === 'INCOME')
                    .map(e => ({
                        'Ngày giờ': new Date(e.createdAt).toLocaleString('vi-VN'),
                        'Loại': 'Thu nhập',
                        'Ghi chú': e.note || '',
                        'Số tiền': e.amount,
                        'Số dư sau': e.balanceAfter,
                        'Giao dịch': e.transaction ? `TX-${e.transaction.id.slice(0, 8)}` : '',
                        'Yêu cầu quỹ': e.fundRequest ? e.fundRequest.title : ''
                    }));
                break;

            case 'expense-report':
                reportTitle = 'Báo cáo chi tiêu';
                reportData = ledgerEntries
                    .filter(e => e.type === 'EXPENSE')
                    .map(e => ({
                        'Ngày giờ': new Date(e.createdAt).toLocaleString('vi-VN'),
                        'Loại': 'Chi tiêu',
                        'Ghi chú': e.note || '',
                        'Số tiền': e.amount,
                        'Số dư sau': e.balanceAfter,
                        'Giao dịch': e.transaction ? `TX-${e.transaction.id.slice(0, 8)}` : '',
                        'Yêu cầu quỹ': e.fundRequest ? e.fundRequest.title : ''
                    }));
                break;

            case 'balance-sheet':
                reportTitle = 'Bảng cân đối';
                reportData = [
                    {
                        'Chỉ tiêu': 'Tổng thu nhập',
                        'Giá trị': totalIncome
                    },
                    {
                        'Chỉ tiêu': 'Tổng chi tiêu',
                        'Giá trị': totalExpense
                    },
                    {
                        'Chỉ tiêu': 'Số dư ròng',
                        'Giá trị': netBalance
                    }
                ];
                break;

            case 'transaction-summary':
            default:
                reportTitle = 'Tóm tắt giao dịch';
                reportData = transactions.map(tx => ({
                    'Mã giao dịch': tx.id.slice(0, 8),
                    'Loại': tx.type,
                    'Số tiền': tx.amount,
                    'Trạng thái': tx.status,
                    'Ngày tạo': new Date(tx.createdAt).toLocaleString('vi-VN'),
                    'Ngày xác nhận': tx.confirmedAt ? new Date(tx.confirmedAt).toLocaleString('vi-VN') : '',
                    'Sự kiện': tx.referenceTicket?.event?.title || '',
                    'CLB': tx.referenceMembership?.club?.name || club.name
                }));
                break;
        }

        // Xuất file theo format
        if (format === 'excel' || format === 'xlsx') {
            const XLSX = require('xlsx');
            
            // Tạo workbook
            const workbook = XLSX.utils.book_new();
            
            // Tạo worksheet từ dữ liệu
            const worksheet = XLSX.utils.json_to_sheet(reportData);
            
            // Thêm worksheet vào workbook
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Báo cáo');
            
            // Tạo buffer
            const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            
            // Set headers
            const fileName = `${reportTitle}_${club.name}_${startDate}_${endDate}.xlsx`.replace(/[^a-zA-Z0-9._-]/g, '_');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
            
            return res.send(buffer);

        } else if (format === 'csv') {
            // Convert to CSV
            if (reportData.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Không có dữ liệu để xuất'
                });
            }

            const headers = Object.keys(reportData[0]);
            const csvRows = [
                headers.join(','),
                ...reportData.map(row => 
                    headers.map(header => {
                        const value = row[header];
                        // Escape commas and quotes in CSV
                        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                            return `"${value.replace(/"/g, '""')}"`;
                        }
                        return value;
                    }).join(',')
                )
            ];

            const csvContent = csvRows.join('\n');
            const fileName = `${reportTitle}_${club.name}_${startDate}_${endDate}.csv`.replace(/[^a-zA-Z0-9._-]/g, '_');
            
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
            
            return res.send('\ufeff' + csvContent); // BOM for Excel UTF-8 support

        } else if (format === 'pdf') {
            // For PDF, we'll return a simple text-based response or use a library
            // For now, let's use a simple approach with JSON data that frontend can convert
            // Or we can install pdfkit later
            return res.status(400).json({
                success: false,
                message: 'PDF export chưa được hỗ trợ. Vui lòng sử dụng Excel hoặc CSV.',
                data: {
                    reportTitle,
                    clubName: club.name,
                    startDate,
                    endDate,
                    summary: {
                        totalIncome,
                        totalExpense,
                        netBalance
                    },
                    entries: reportData
                }
            });
        } else {
            return res.status(400).json({
                success: false,
                message: 'Định dạng không được hỗ trợ. Chỉ hỗ trợ: excel, csv'
            });
        }

    } catch (error) {
        console.error('Export Report Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi xuất báo cáo'
        });
    }
};

