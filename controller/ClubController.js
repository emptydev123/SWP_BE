const prisma = require('../prisma/client');

/**
 * Tạo Club mới (Admin Only)
 * - Tạo record Club
 * - Tạo ClubMembership cho Leader (Role: LEADER)
 */
exports.createClub = async (req, res) => {
    try {
        const { name, description, leaderEmail, slug, logoUrl } = req.body;

        // 1. Validate Admin (đã check ở middleware, check lại cho chắc nếu cần)
        // if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });

        // 2. Tìm User Leader qua email
        const leaderUser = await prisma.user.findUnique({ where: { email: leaderEmail } });
        if (!leaderUser) {
            return res.status(404).json({ message: "Leader email not found" });
        }

        // 3. Check Slug unique
        if (slug) {
            const existingClub = await prisma.club.findUnique({ where: { slug } });
            if (existingClub) return res.status(400).json({ message: "Club slug already exists" });
        }

        // 4. Transaction: Tạo Club + Add Leader Membership
        const result = await prisma.$transaction(async (tx) => {
            // A. Create Club
            const newClub = await tx.club.create({
                data: {
                    name,
                    slug: slug || name.toLowerCase().replace(/ /g, '-'), // Auto slug nếu thiếu
                    description,
                    logoUrl,
                    leaderUserId: leaderUser.id,
                    createdById: req.userId
                }
            });

            // B. Add Leader to Membership
            await tx.clubMembership.create({
                data: {
                    clubId: newClub.id,
                    userId: leaderUser.id,
                    role: 'LEADER',
                    status: 'ACTIVE'
                }
            });

            return newClub;
        });

        res.status(201).json({
            success: true,
            message: "Club created successfully",
            data: result
        });

    } catch (error) {
        console.error("Create Club Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Lấy danh sách tất cả Clubs (Public)
 * - Có thể filter, search sau này
 */
exports.getAllClubs = async (req, res) => {
    try {
        const clubs = await prisma.club.findMany({
            where: { isActive: true },
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
            orderBy: { createdAt: 'desc' }
        });

        res.status(200).json({
            success: true,
            count: clubs.length,
            data: clubs
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
