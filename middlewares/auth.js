const jwt = require('jsonwebtoken');
const prisma = require('../prisma/client');
const JWT_SECRET = process.env.SECRET_KEY


const authMiddleWare = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ message: 'No token provided' });

        const decoded = jwt.verify(token, JWT_SECRET);
        console.log(decoded);
        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
        if (!user) return res.status(401).json({ message: 'Account not found' });
        req.user = user;
        req._id = user.id;
        req.userId = user.id;
        next();
    } catch (error) {
        res.status(401).json({ meesage: "Invalid token" })
    }
}

const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Forbidden - No permission' });
        }
        next();
    };
};

module.exports = { authMiddleWare, requireRole };