const prisma = require('../prisma/client');
var bryctjs = require('bcryptjs')
var jwt = require('jsonwebtoken')

// REGISTER
exports.registerUser = async (req, res) => {
    try {
        const { email, password, phone, fullName, studentCode } = req.body

        // Check format email
        if (!email) return res.status(400).json({ message: "Email is required" });

        // Check duplicate email
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: "Email already exists" })
        }

        // Check duplicate studentCode if provided
        if (studentCode) {
            const existingStudent = await prisma.user.findUnique({ where: { studentCode } });
            if (existingStudent) {
                return res.status(400).json({ message: "Student Code already exists" })
            }
        }

        const salt = await bryctjs.genSalt(10)
        const hashPassword = await bryctjs.hash(password, salt)

        // Create new user (SCMS schema)
        const newUser = await prisma.user.create({
            data: {
                email,
                passwordHash: hashPassword, // Mapped to password_hash
                fullName,   // Mapped to full_name
                phone,
                studentCode, // Mapped to student_code
                isActive: true
            }
        });

        res.status(200).json({
            message: "User register successfully",
            success: true,
            data: {
                id: newUser.id,
                email: newUser.email,
                fullName: newUser.fullName,
                phone: newUser.phone,
                studentCode: newUser.studentCode
            }
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: error.message || "Internal Server Error",
            success: false
        })
    }
}

// LOGIN
exports.login = async (req, res) => {
    const secretKey = process.env.SECRET_KEY
    const { email, password } = req.body; // Login by EMAIL

    try {
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return res.status(400).json({
                message: "User not found",
                success: false
            })
        }

        const checkPassword = await bryctjs.compare(password, user.passwordHash); // Check passwordHash
        if (!checkPassword) {
            return res.status(400).json({
                message: "Password Incorrect",
                success: false
            })
        }

        const accessToken = jwt.sign({
            userId: user.id,
            email: user.email,
            role: user.role // Add System Role to Token
        }, secretKey, { expiresIn: '1h' })

        res.status(200).json({
            success: true,
            accessToken,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role
            }
        })
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: error.message || "Internal Server Error",
            success: false
        })
    }
}

// GET PROFILE
exports.getProfileUser = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: {
                id: true,
                email: true,
                fullName: true,
                phone: true,
                studentCode: true,
                role: true, // Show System Role
                avatarUrl: true,
                createdAt: true,
                updatedAt: true,
                // Include memberships to see roles in clubs
                memberships: {
                    select: {
                        clubId: true,
                        role: true,
                        status: true
                    }
                }
            }
        });

        if (!user) {
            return res.status(404).json({
                message: "Not found profile",
                success: false
            })
        }
        res.status(200).json({ user });
    } catch (error) {
        res.status(500).json({
            message: "Server Error",
            error: error.message
        })
    }
}

// GET ALL USERS (Admin only - placeholder logic since no global role)
exports.getAllProfileUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                fullName: true,
                phone: true,
                studentCode: true,
                isActive: true,
                createdAt: true
            }
        });
        res.status(200).json({ users, count: users.length });
    } catch (error) {
        res.status(500).json({
            message: "Server Error",
            error: error.message
        });
    }
};
