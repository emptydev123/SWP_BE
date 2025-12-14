const prisma = require('../prisma/client');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const emailService = require('../services/emailService');
const { paginateWithWhere } = require('../utils/paginationUtils');

/**
 * Parse file Excel để lấy danh sách members
 * @param {string} filePath - Đường dẫn file Excel
 * @returns {Array} - Mảng các object member
 */
const parseExcelFile = (filePath) => {
    try {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        // Chuẩn hóa tên cột (case-insensitive)
        return data.map(row => {
            const normalizedRow = {};
            Object.keys(row).forEach(key => {
                const lowerKey = key.toLowerCase().trim();
                if (lowerKey.includes('email')) normalizedRow.email = row[key];
                if (lowerKey.includes('student_code') || lowerKey.includes('studentcode')) normalizedRow.studentCode = row[key];
                if (lowerKey.includes('phone')) normalizedRow.phone = row[key];
                if (lowerKey.includes('email_verified') || lowerKey.includes('emailverified')) normalizedRow.emailVerified = row[key];
                if (lowerKey.includes('role')) normalizedRow.role = row[key];
                if (lowerKey.includes('is_leader') || lowerKey.includes('isleader')) normalizedRow.isLeader = row[key];
                if (lowerKey.includes('full_name') || lowerKey.includes('fullname')) normalizedRow.fullName = row[key];
            });
            return normalizedRow;
        }).filter(row => row.email); // Chỉ lấy các dòng có email
    } catch (error) {
        throw new Error(`Lỗi đọc file Excel: ${error.message}`);
    }
};

/**
 * Tạo mật khẩu mặc định
 */
const generateDefaultPassword = () => {
    return 'Student@123'; // Mật khẩu mặc định
};

/**
 * Tạo Club mới với import Excel (Admin Only)
 * - Tạo record Club
 * - Import members từ Excel file
 * - Tạo user nếu chưa tồn tại
 * - Tạo ClubMembership cho tất cả members
 * - Gửi email thông báo
 */
exports.createClub = async (req, res) => {
    let excelFilePath = null;

    try {
        const { name, description, slug, logoUrl } = req.body;
        const excelFile = req.file;

        // Validate input
        if (!name) {
            return res.status(400).json({ success: false, message: "Tên club là bắt buộc" });
        }

        if (!excelFile) {
            return res.status(400).json({ success: false, message: "Vui lòng upload file Excel" });
        }

        excelFilePath = excelFile.path;

        // Parse Excel file trước để lấy danh sách email
        const membersData = parseExcelFile(excelFilePath);

        if (membersData.length === 0) {
            if (fs.existsSync(excelFilePath)) fs.unlinkSync(excelFilePath);
            return res.status(400).json({ success: false, message: "File Excel không có dữ liệu hợp lệ" });
        }

        // Check Name unique (name đã có @unique trong schema)
        const existingClubByName = await prisma.club.findUnique({
            where: { name },
            include: {
                memberships: {
                    select: {
                        user: {
                            select: { email: true }
                        }
                    }
                }
            }
        });

        if (existingClubByName) {
            // Kiểm tra xem các email trong Excel có trùng với tất cả thành viên của club đã tồn tại không
            const excelEmails = new Set(membersData.map(m => m.email).filter(e => e));
            const existingClubEmails = new Set(
                existingClubByName.memberships.map(m => m.user.email).filter(e => e)
            );

            // So sánh số lượng và các email
            const isDuplicateMembers =
                excelEmails.size === existingClubEmails.size &&
                [...excelEmails].every(email => existingClubEmails.has(email));

            if (isDuplicateMembers) {
                // Xóa file tạm
                if (fs.existsSync(excelFilePath)) fs.unlinkSync(excelFilePath);
                return res.status(400).json({
                    success: false,
                    message: `Club với tên "${name}" và danh sách thành viên này đã tồn tại. Vui lòng chọn tên khác hoặc thay đổi danh sách thành viên.`
                });
            } else {
                // Tên trùng nhưng thành viên khác → chỉ báo tên trùng
                if (fs.existsSync(excelFilePath)) fs.unlinkSync(excelFilePath);
                return res.status(400).json({
                    success: false,
                    message: `Club với tên "${name}" đã tồn tại. Vui lòng chọn tên khác.`
                });
            }
        }

        // Check Slug unique
        if (slug) {
            const existingClub = await prisma.club.findUnique({ where: { slug } });
            if (existingClub) {
                // Xóa file tạm
                if (fs.existsSync(excelFilePath)) fs.unlinkSync(excelFilePath);
                return res.status(400).json({ success: false, message: "Club slug already exists" });
            }
        }

        // Tìm leader từ Excel (is_leader = true)
        const leaderData = membersData.find(m => m.isLeader === true || m.isLeader === 'true' || m.isLeader === 1);

        if (!leaderData || !leaderData.email) {
            if (fs.existsSync(excelFilePath)) fs.unlinkSync(excelFilePath);
            return res.status(400).json({ success: false, message: "Không tìm thấy leader trong file Excel (cần có is_leader = true)" });
        }

        const defaultPassword = generateDefaultPassword();
        const salt = await bcrypt.genSalt(10);
        const hashPassword = await bcrypt.hash(defaultPassword, salt);

        // Pre-fetch: Lấy tất cả studentCodes và emails đã tồn tại để tránh query nhiều lần trong transaction
        const allStudentCodes = membersData
            .map(m => m.studentCode)
            .filter(code => code && code.trim() !== '');

        const allEmails = membersData
            .map(m => m.email)
            .filter(email => email && email.trim() !== '');

        const existingStudentCodes = new Set();
        const existingUsersMap = new Map(); // Map email -> user object

        // Pre-fetch tất cả users đã tồn tại (theo email và studentCode)
        if (allEmails.length > 0 || allStudentCodes.length > 0) {
            const existingUsers = await prisma.user.findMany({
                where: {
                    OR: [
                        { email: { in: allEmails } },
                        { studentCode: { in: allStudentCodes } }
                    ]
                },
                select: {
                    id: true,
                    email: true,
                    studentCode: true
                }
            });

            existingUsers.forEach(u => {
                if (u.email) existingUsersMap.set(u.email, u);
                if (u.studentCode) existingStudentCodes.add(u.studentCode);
            });
        }

        // Transaction: Tạo Club + Tạo/Cập nhật Users + Tạo Memberships + Gửi email
        // Tăng timeout lên 30 giây để xử lý nhiều members
        const result = await prisma.$transaction(
            async (tx) => {
                // 1. Tạo hoặc tìm Leader User (dùng Map đã pre-fetch)
                let leaderUser = existingUsersMap.get(leaderData.email) || null;
                const isNewLeader = !leaderUser;

                if (!leaderUser) {
                    // Kiểm tra studentCode đã tồn tại chưa (dùng Set đã pre-fetch)
                    let studentCodeToUse = leaderData.studentCode || null;
                    if (studentCodeToUse && existingStudentCodes.has(studentCodeToUse)) {
                        // Nếu studentCode đã tồn tại, bỏ qua (set null) để tránh lỗi unique constraint
                        console.warn(`Student code ${studentCodeToUse} đã tồn tại, bỏ qua cho user ${leaderData.email}`);
                        studentCodeToUse = null;
                    }

                    // Tạo user mới cho leader (dùng try-catch để handle unique constraint nếu có)
                    try {
                        leaderUser = await tx.user.create({
                            data: {
                                email: leaderData.email,
                                passwordHash: hashPassword,
                                fullName: leaderData.fullName || leaderData.email.split('@')[0],
                                studentCode: studentCodeToUse,
                                phone: leaderData.phone || null,
                                emailVerified: false,
                                isActive: true,
                                auth_role: 'USER' // Force auth_role = USER, không phụ thuộc vào Excel
                            }
                        });
                        // Update Map sau khi tạo user mới
                        existingUsersMap.set(leaderData.email, leaderUser);
                    } catch (createError) {
                        // Xử lý unique constraint error
                        if (createError.code === 'P2002') {
                            const target = createError.meta?.target || [];

                            if (target.includes('email')) {
                                // Email đã tồn tại, tìm lại user đó
                                console.warn(`Email ${leaderData.email} đã tồn tại, tìm lại user`);
                                leaderUser = await tx.user.findUnique({ where: { email: leaderData.email } });
                                if (leaderUser) {
                                    // Update emailVerified = true
                                    leaderUser = await tx.user.update({
                                        where: { id: leaderUser.id },
                                        data: { emailVerified: true }
                                    });
                                    // Update Map
                                    existingUsersMap.set(leaderData.email, leaderUser);
                                } else {
                                    throw new Error(`Không tìm thấy user với email ${leaderData.email} sau khi bị unique constraint`);
                                }
                            } else if (target.includes('student_code')) {
                                // StudentCode đã tồn tại, thử lại với studentCode = null
                                console.warn(`Unique constraint error cho studentCode, thử lại với studentCode = null cho ${leaderData.email}`);
                                try {
                                    leaderUser = await tx.user.create({
                                        data: {
                                            email: leaderData.email,
                                            passwordHash: hashPassword,
                                            fullName: leaderData.fullName || leaderData.email.split('@')[0],
                                            studentCode: null, // Bỏ qua studentCode
                                            phone: leaderData.phone || null,
                                            emailVerified: false,
                                            isActive: true,
                                            auth_role: 'USER' // Force auth_role = USER, không phụ thuộc vào Excel
                                        }
                                    });
                                    // Update Map
                                    existingUsersMap.set(leaderData.email, leaderUser);
                                } catch (retryError) {
                                    // Nếu vẫn lỗi (có thể do email), tìm lại user
                                    if (retryError.code === 'P2002' && retryError.meta?.target?.includes('email')) {
                                        leaderUser = await tx.user.findUnique({ where: { email: leaderData.email } });
                                        if (leaderUser) {
                                            leaderUser = await tx.user.update({
                                                where: { id: leaderUser.id },
                                                data: { emailVerified: true }
                                            });
                                            existingUsersMap.set(leaderData.email, leaderUser);
                                        }
                                    } else {
                                        throw retryError;
                                    }
                                }
                            } else {
                                throw createError; // Ném lại lỗi khác
                            }
                        } else {
                            throw createError; // Ném lại lỗi khác
                        }
                    }
                } else {
                    // Cập nhật emailVerified = true nếu user đã tồn tại
                    leaderUser = await tx.user.update({
                        where: { id: leaderUser.id },
                        data: { emailVerified: true }
                    });
                }

                // 2. Tạo Club
                const newClub = await tx.club.create({
                    data: {
                        name,
                        slug: slug || name.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, ''),
                        description,
                        logoUrl,
                        leaderUserId: leaderUser.id,
                        createdById: req.userId
                    }
                });

                // 3. Xử lý tất cả members từ Excel
                const membershipResults = [];
                const emailResults = [];

                // Thêm leader vào emailQueue nếu là user mới
                emailResults.push({
                    email: leaderData.email,
                    isNewUser: isNewLeader,
                    password: isNewLeader ? defaultPassword : null
                });

                for (const memberData of membersData) {
                    if (!memberData.email) continue;

                    const isLeader = memberData.isLeader === true || memberData.isLeader === 'true' || memberData.isLeader === 1;

                    // Skip leader vì đã xử lý riêng ở phần đầu
                    if (isLeader && memberData.email === leaderData.email) {
                        // Leader đã được xử lý, chỉ cần tạo membership nếu chưa có
                        const existingMembership = await tx.clubMembership.findUnique({
                            where: {
                                clubId_userId: {
                                    clubId: newClub.id,
                                    userId: leaderUser.id
                                }
                            }
                        });

                        if (!existingMembership) {
                            await tx.clubMembership.create({
                                data: {
                                    clubId: newClub.id,
                                    userId: leaderUser.id,
                                    role: 'LEADER',
                                    status: 'ACTIVE',
                                    joinedAt: new Date(),
                                    activatedAt: new Date()
                                }
                            });
                        }

                        membershipResults.push({
                            email: memberData.email,
                            role: 'LEADER',
                            isNewUser: isNewLeader,
                            isLeader: true
                        });
                        continue; // Skip phần xử lý user vì đã xử lý rồi
                    }

                    const membershipRole = isLeader ? 'LEADER' : 'MEMBER';

                    // Tạo hoặc tìm User (dùng Map đã pre-fetch, không query database)
                    let user = existingUsersMap.get(memberData.email) || null;
                    const isNewUser = !user;

                    if (!user) {
                        // Kiểm tra studentCode đã tồn tại chưa (dùng Set đã pre-fetch)
                        let studentCodeToUse = memberData.studentCode || null;
                        if (studentCodeToUse && existingStudentCodes.has(studentCodeToUse)) {
                            // Nếu studentCode đã tồn tại, bỏ qua (set null) để tránh lỗi unique constraint
                            console.warn(`Student code ${studentCodeToUse} đã tồn tại, bỏ qua cho user ${memberData.email}`);
                            studentCodeToUse = null;
                        }

                        // Tạo user mới (dùng try-catch để handle unique constraint nếu có)
                        try {
                            user = await tx.user.create({
                                data: {
                                    email: memberData.email,
                                    passwordHash: hashPassword,
                                    fullName: memberData.fullName || memberData.email.split('@')[0],
                                    studentCode: studentCodeToUse,
                                    phone: memberData.phone || null,
                                    emailVerified: false,
                                    isActive: true,
                                    auth_role: 'USER' // Force auth_role = USER, không phụ thuộc vào Excel
                                }
                            });
                            // Update Map sau khi tạo user mới để tránh duplicate
                            existingUsersMap.set(memberData.email, user);
                        } catch (createError) {
                            // Xử lý unique constraint error
                            if (createError.code === 'P2002') {
                                const target = createError.meta?.target || [];

                                if (target.includes('email')) {
                                    // Email đã tồn tại, tìm lại user đó
                                    console.warn(`Email ${memberData.email} đã tồn tại, tìm lại user`);
                                    user = await tx.user.findUnique({ where: { email: memberData.email } });
                                    if (user) {
                                        // Update emailVerified = true
                                        user = await tx.user.update({
                                            where: { id: user.id },
                                            data: { emailVerified: true }
                                        });
                                        // Update Map
                                        existingUsersMap.set(memberData.email, user);
                                    } else {
                                        throw new Error(`Không tìm thấy user với email ${memberData.email} sau khi bị unique constraint`);
                                    }
                                } else if (target.includes('student_code')) {
                                    // StudentCode đã tồn tại, thử lại với studentCode = null
                                    console.warn(`Unique constraint error cho studentCode, thử lại với studentCode = null cho ${memberData.email}`);
                                    try {
                                        user = await tx.user.create({
                                            data: {
                                                email: memberData.email,
                                                passwordHash: hashPassword,
                                                fullName: memberData.fullName || memberData.email.split('@')[0],
                                                studentCode: null, // Bỏ qua studentCode
                                                phone: memberData.phone || null,
                                                emailVerified: false,
                                                isActive: true,
                                                auth_role: 'USER' // Force auth_role = USER, không phụ thuộc vào Excel
                                            }
                                        });
                                        // Update Map
                                        existingUsersMap.set(memberData.email, user);
                                    } catch (retryError) {
                                        // Nếu vẫn lỗi (có thể do email), tìm lại user
                                        if (retryError.code === 'P2002' && retryError.meta?.target?.includes('email')) {
                                            user = await tx.user.findUnique({ where: { email: memberData.email } });
                                            if (user) {
                                                user = await tx.user.update({
                                                    where: { id: user.id },
                                                    data: { emailVerified: true }
                                                });
                                                existingUsersMap.set(memberData.email, user);
                                            }
                                        } else {
                                            throw retryError;
                                        }
                                    }
                                } else {
                                    throw createError; // Ném lại lỗi khác
                                }
                            } else {
                                throw createError; // Ném lại lỗi khác
                            }
                        }
                    } else {
                        // Cập nhật emailVerified = true nếu user đã tồn tại
                        user = await tx.user.update({
                            where: { id: user.id },
                            data: { emailVerified: true }
                        });
                    }

                    // Tạo ClubMembership (hoặc update nếu đã tồn tại)
                    const existingMembership = await tx.clubMembership.findUnique({
                        where: {
                            clubId_userId: {
                                clubId: newClub.id,
                                userId: user.id
                            }
                        }
                    });

                    if (!existingMembership) {
                        await tx.clubMembership.create({
                            data: {
                                clubId: newClub.id,
                                userId: user.id,
                                role: membershipRole,
                                status: 'ACTIVE',
                                joinedAt: new Date(),
                                activatedAt: new Date()
                            }
                        });
                    } else {
                        // Update membership nếu đã tồn tại
                        await tx.clubMembership.update({
                            where: { id: existingMembership.id },
                            data: {
                                role: membershipRole,
                                status: 'ACTIVE',
                                activatedAt: new Date()
                            }
                        });
                    }

                    membershipResults.push({
                        email: memberData.email,
                        role: membershipRole,
                        isNewUser,
                        isLeader
                    });

                    // Lưu thông tin để gửi email sau
                    emailResults.push({
                        email: memberData.email,
                        isNewUser,
                        password: isNewUser ? defaultPassword : null
                    });
                }

                return {
                    club: newClub,
                    memberships: membershipResults,
                    emailQueue: emailResults
                };
            },
            {
                maxWait: 10000, // 10 giây chờ transaction bắt đầu
                timeout: 30000, // 30 giây timeout cho transaction
            });

        // 4. Gửi email thông báo cho tất cả members (ngoài transaction để không block)
        const emailPromises = result.emailQueue.map(member =>
            emailService.sendWelcomeToClubEmail(
                member.email,
                name,
                member.password,
                member.isNewUser
            )
        );

        // Gửi email không đồng bộ, không chờ kết quả
        Promise.all(emailPromises).catch(err => {
            console.error('Lỗi gửi email:', err);
        });

        // Xóa file Excel tạm
        if (fs.existsSync(excelFilePath)) {
            fs.unlinkSync(excelFilePath);
        }

        res.status(201).json({
            success: true,
            message: "Club created successfully",
            data: {
                club: result.club,
                membersAdded: result.memberships.length,
                memberships: result.memberships
            }
        });

    } catch (error) {
        console.error("Create Club Error:", error);
        console.error("Error Stack:", error.stack);
        console.error("Error Details:", {
            name: error.name,
            message: error.message,
            code: error.code
        });

        // Xóa file tạm nếu có lỗi
        if (excelFilePath && fs.existsSync(excelFilePath)) {
            try {
                fs.unlinkSync(excelFilePath);
            } catch (unlinkError) {
                console.error("Error deleting temp file:", unlinkError);
            }
        }

        res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

/**
 * Lấy danh sách tất cả Clubs (Public)
 * - Có thể filter, search sau này
 */
/**
 * Lấy danh sách tất cả CLB (Public) - Có phân trang
 */
exports.getAllClubs = async (req, res) => {
    try {
        const { search, isActive } = req.query;

        // Build where clause
        const where = {
            ...(isActive !== undefined ? { isActive: isActive === 'true' } : { isActive: true }),
            ...(search && {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } }
                ]
            })
        };

        // Sử dụng pagination utility
        const result = await paginateWithWhere(
            prisma.club,
            where,
            req.query,
            {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    logoUrl: true,
                    description: true,
                    createdAt: true,
                    leader: {
                        select: { fullName: true, email: true }
                    },
                    _count: {
                        select: { memberships: true } // Đếm số thành viên
                    }
                },
                orderBy: { createdAt: 'desc' },
                defaultLimit: 10,
                maxLimit: 50
            }
        );

        res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Lấy chi tiết Club theo Slug hoặc ID (Public)
 */
exports.getClubDetail = async (req, res) => {
    try {
        const { slug } = req.params; // Có thể là id hoặc slug

        const club = await prisma.club.findFirst({
            where: {
                OR: [
                    { slug: slug },
                    { id: slug } // Cho phép tìm bằng ID nếu slug không khớp (lưu ý UUID format)
                ],
                isActive: true
            },
            include: {
                leader: {
                    select: { id: true, fullName: true, email: true, avatarUrl: true }
                },
                socialLinks: true, // Lấy link MXH
                _count: {
                    select: {
                        memberships: true,
                        events: true
                    }
                }
            }
        });

        if (!club) {
            return res.status(404).json({ success: false, message: "Club not found" });
        }

        res.status(200).json({
            success: true,
            data: club
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Update leader của club (Leader hiện tại chuyển quyền cho member khác)
 */
exports.updateClubLeader = async (req, res) => {
    try {
        const { clubId } = req.params;
        const { newLeaderUserId } = req.body;
        const currentUserId = req.userId; // Leader hiện tại

        if (!newLeaderUserId) {
            return res.status(400).json({
                success: false,
                message: "newLeaderUserId là bắt buộc"
            });
        }

        // Kiểm tra club có tồn tại không
        const club = await prisma.club.findUnique({
            where: { id: clubId },
            select: {
                id: true,
                name: true,
                leaderUserId: true
            }
        });

        if (!club) {
            return res.status(404).json({ success: false, message: "Club không tồn tại" });
        }

        // Kiểm tra user hiện tại có phải leader không
        if (club.leaderUserId !== currentUserId && req.user.auth_role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: "Chỉ club leader hiện tại mới có quyền chuyển quyền leader"
            });
        }

        // Không cho chuyển cho chính mình
        if (newLeaderUserId === currentUserId) {
            return res.status(400).json({
                success: false,
                message: "Bạn đã là leader của club này rồi"
            });
        }

        // Kiểm tra user mới có tồn tại không
        const newLeader = await prisma.user.findUnique({
            where: { id: newLeaderUserId },
            select: { id: true, email: true, fullName: true, isActive: true }
        });

        if (!newLeader) {
            return res.status(404).json({ success: false, message: "User mới không tồn tại" });
        }

        if (!newLeader.isActive) {
            return res.status(400).json({ success: false, message: "User mới đã bị vô hiệu hóa" });
        }

        // Kiểm tra user mới có phải member của club không
        const newLeaderMembership = await prisma.clubMembership.findUnique({
            where: {
                clubId_userId: {
                    clubId: clubId,
                    userId: newLeaderUserId
                }
            }
        });

        if (!newLeaderMembership) {
            return res.status(400).json({
                success: false,
                message: "User mới chưa phải là thành viên của club. Vui lòng thêm thành viên trước."
            });
        }

        // Transaction: Update leader và membership roles
        const result = await prisma.$transaction(async (tx) => {
            // 1. Update club leader
            const updatedClub = await tx.club.update({
                where: { id: clubId },
                data: {
                    leaderUserId: newLeaderUserId
                },
                select: {
                    id: true,
                    name: true,
                    leaderUserId: true,
                    leader: {
                        select: { id: true, email: true, fullName: true }
                    }
                }
            });

            // 2. Update membership của leader cũ (A): LEADER → MEMBER
            // Tìm tất cả memberships của leader cũ trong club này (có thể có nhiều nếu có lỗi trước đó)
            const oldLeaderMemberships = await tx.clubMembership.findMany({
                where: {
                    clubId: clubId,
                    userId: currentUserId
                }
            });

            // Update tất cả memberships của leader cũ thành MEMBER (đảm bảo không còn LEADER nào)
            if (oldLeaderMemberships.length > 0) {
                for (const membership of oldLeaderMemberships) {
                    await tx.clubMembership.update({
                        where: { id: membership.id },
                        data: {
                            role: 'MEMBER',
                            // Giữ nguyên status và các field khác
                        }
                    });
                }
                console.log(`Đã update ${oldLeaderMemberships.length} membership(s) của leader cũ (${currentUserId}) thành MEMBER`);
            } else {
                // Nếu leader cũ chưa có membership (trường hợp đặc biệt), tạo mới
                await tx.clubMembership.create({
                    data: {
                        clubId: clubId,
                        userId: currentUserId,
                        role: 'MEMBER',
                        status: 'ACTIVE',
                        joinedAt: new Date(),
                        activatedAt: new Date()
                    }
                });
                console.log(`Đã tạo membership mới cho leader cũ (${currentUserId}) với role MEMBER`);
            }

            // 3. Update membership của leader mới (B): MEMBER → LEADER
            // Đảm bảo chỉ có 1 LEADER trong club
            const updatedNewLeaderMembership = await tx.clubMembership.update({
                where: { id: newLeaderMembership.id },
                data: {
                    role: 'LEADER',
                    status: 'ACTIVE',
                    activatedAt: new Date()
                }
            });
            console.log(`Đã update membership của leader mới (${newLeaderUserId}) thành LEADER`);

            // 4. Đảm bảo không còn LEADER nào khác trong club (safety check)
            const allLeaderMemberships = await tx.clubMembership.findMany({
                where: {
                    clubId: clubId,
                    role: 'LEADER',
                    id: { not: newLeaderMembership.id } // Trừ leader mới
                }
            });

            // Update tất cả LEADER khác thành MEMBER (nếu có)
            if (allLeaderMemberships.length > 0) {
                for (const membership of allLeaderMemberships) {
                    await tx.clubMembership.update({
                        where: { id: membership.id },
                        data: { role: 'MEMBER' }
                    });
                }
                console.log(`Đã update ${allLeaderMemberships.length} LEADER(s) khác thành MEMBER để đảm bảo chỉ có 1 LEADER`);
            }

            return updatedClub;
        });

        res.status(200).json({
            success: true,
            message: "Leader đã được cập nhật thành công",
            data: {
                club: result,
                oldLeaderId: currentUserId,
                newLeaderId: newLeaderUserId
            }
        });

    } catch (error) {
        console.error("Update Club Leader Error:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};

/**
 * Leader config membership fee cho club
 */
exports.configMembershipFee = async (req, res) => {
    try {
        const { clubId } = req.params;
        const { membershipFeeEnabled, membershipFeeAmount } = req.body;
        const userId = req.userId;

        // Kiểm tra club có tồn tại không
        const club = await prisma.club.findUnique({
            where: { id: clubId },
            select: {
                id: true,
                name: true,
                leaderUserId: true,
                membershipFeeEnabled: true,
                membershipFeeAmount: true
            }
        });

        if (!club) {
            return res.status(404).json({ success: false, message: "Club không tồn tại" });
        }

        // Kiểm tra user có phải leader không
        if (club.leaderUserId !== userId && req.user.auth_role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: "Chỉ club leader mới có quyền cấu hình phí tham gia"
            });
        }

        // Validate input
        if (typeof membershipFeeEnabled !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: "membershipFeeEnabled phải là boolean"
            });
        }

        if (membershipFeeEnabled && (!membershipFeeAmount || membershipFeeAmount < 0)) {
            return res.status(400).json({
                success: false,
                message: "Nếu bật tính phí, membershipFeeAmount phải >= 0"
            });
        }

        // Update club
        const updatedClub = await prisma.club.update({
            where: { id: clubId },
            data: {
                membershipFeeEnabled: membershipFeeEnabled,
                membershipFeeAmount: membershipFeeEnabled ? (membershipFeeAmount || 0) : 0
            },
            select: {
                id: true,
                name: true,
                membershipFeeEnabled: true,
                membershipFeeAmount: true
            }
        });

        res.status(200).json({
            success: true,
            message: "Cấu hình phí tham gia đã được cập nhật",
            data: updatedClub
        });

    } catch (error) {
        console.error("Config Membership Fee Error:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};

/**
 * Update role của member trong club (Leader only)
 * Có thể update từ MEMBER lên STAFF, TREASURER, hoặc ngược lại
 */
exports.updateMemberRole = async (req, res) => {
    try {
        const { clubId, membershipId } = req.params;
        const { role } = req.body;
        const userId = req.userId; // Leader ID

        // Validate role
        const validRoles = ['MEMBER', 'STAFF', 'TREASURER', 'ADMIN', 'LEADER'];
        if (!role || !validRoles.includes(role.toUpperCase())) {
            return res.status(400).json({
                success: false,
                message: `role phải là một trong các giá trị: ${validRoles.join(', ')}`
            });
        }

        const newRole = role.toUpperCase();

        // Kiểm tra club có tồn tại không
        const club = await prisma.club.findUnique({
            where: { id: clubId },
            select: {
                id: true,
                name: true,
                leaderUserId: true
            }
        });

        if (!club) {
            return res.status(404).json({ success: false, message: "Club không tồn tại" });
        }

        // Kiểm tra user có phải leader không
        if (club.leaderUserId !== userId && req.user.auth_role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: "Chỉ club leader mới có quyền cập nhật role của member"
            });
        }

        // Kiểm tra membership có tồn tại không
        const membership = await prisma.clubMembership.findUnique({
            where: { id: membershipId },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        fullName: true
                    }
                },
                club: {
                    select: {
                        id: true,
                        name: true,
                        leaderUserId: true
                    }
                }
            }
        });

        if (!membership) {
            return res.status(404).json({ success: false, message: "Membership không tồn tại" });
        }

        // Kiểm tra membership có thuộc club này không
        if (membership.clubId !== clubId) {
            return res.status(400).json({
                success: false,
                message: "Membership không thuộc club này"
            });
        }

        // Không cho update role của chính leader (leader phải update qua API update leader)
        if (membership.userId === club.leaderUserId && newRole !== 'LEADER') {
            return res.status(400).json({
                success: false,
                message: "Không thể thay đổi role của leader. Vui lòng sử dụng API update leader để chuyển quyền."
            });
        }

        // Không cho set role LEADER qua API này (phải dùng API update leader)
        if (newRole === 'LEADER') {
            return res.status(400).json({
                success: false,
                message: "Không thể set role LEADER qua API này. Vui lòng sử dụng API update leader."
            });
        }

        // Update role
        const updatedMembership = await prisma.clubMembership.update({
            where: { id: membershipId },
            data: {
                role: newRole
            },
            select: {
                id: true,
                clubId: true,
                userId: true,
                role: true,
                status: true,
                joinedAt: true,
                activatedAt: true,
                assignedById: true,
                notes: true,
                createdAt: true,
                updatedAt: true,
                user: {
                    select: {
                        id: true,
                        email: true,
                        fullName: true,
                        studentCode: true
                    }
                }
            }
        });

        res.status(200).json({
            success: true,
            message: `Role của member đã được cập nhật thành ${newRole}`,
            data: updatedMembership
        });

    } catch (error) {
        console.error("Update Member Role Error:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};
