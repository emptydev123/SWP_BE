const jwt = require('jsonwebtoken');
const prisma = require('../prisma/client');
const JWT_SECRET = process.env.SECRET_KEY


const authMiddleWare = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ message: 'No token provided' });

        const decoded = jwt.verify(token, JWT_SECRET);
        // Find user by id from decoded token (select auth_role để check permission)
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
                id: true,
                email: true,
                fullName: true,
                auth_role: true,
                isActive: true,
                emailVerified: true
            }
        });

        if (!user) return res.status(401).json({ message: 'Account not found' });
        if (!user.isActive) return res.status(401).json({ message: 'Account is inactive' });

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
        if (!req.user || !roles.includes(req.user.auth_role)) {
            return res.status(403).json({ message: 'Forbidden - No permission' });
        }
        next();
    };
};

module.exports = { authMiddleWare, requireRole };