const jwt = require('jsonwebtoken');
const prisma = require('../prisma/client');
const JWT_SECRET = process.env.SECRET_KEY


const authMiddleWare = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ message: 'No token provided' });

        const decoded = jwt.verify(token, JWT_SECRET);
        // Find user by id from decoded token
        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

        if (!user) return res.status(401).json({ message: 'Account not found' });

        req.user = user;
        req.userId = user.id;
        next();
    } catch (error) {
        res.status(401).json({ message: "Invalid token" })
    }
}

// Check System Role (ADMIN / USER)
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Forbidden - No permission' });
        }
        next();
    };
};

// Check if user is club leader (from clubId in body or params)
const requireClubLeader = async (req, res, next) => {
    try {
        const userId = req.userId;
        const clubId = req.body.clubId || req.params.clubId;

        if (!clubId) {
            return res.status(400).json({ message: 'Thiếu clubId' });
        }

        // Check if user is leader of this club
        const membership = await prisma.clubMembership.findFirst({
            where: {
                clubId: clubId,
                userId: userId,
                role: 'LEADER',
                status: 'ACTIVE'
            }
        });

        // Also check if user is the leader in Club.leaderUserId
        const club = await prisma.club.findUnique({
            where: { id: clubId }
        });

        if (!club) {
            return res.status(404).json({ message: 'Không tìm thấy CLB' });
        }

        // User is leader if: membership role is LEADER OR club.leaderUserId matches
        if (membership || club.leaderUserId === userId || req.user.role === 'ADMIN') {
            req.clubId = clubId;
            next();
        } else {
            return res.status(403).json({ message: 'Chỉ club leader mới có quyền thực hiện hành động này' });
        }
    } catch (error) {
        console.error('Require Club Leader Error:', error);
        res.status(500).json({ message: error.message || 'Lỗi khi kiểm tra quyền' });
    }
};

module.exports = { authMiddleWare, requireRole, requireClubLeader };