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

        // Cập nhật loginProvider = 'email' để đánh dấu user đã login bằng email/password
        await prisma.user.update({
            where: { id: user.id },
            data: { loginProvider: 'email' }
        });

        const accessToken = jwt.sign({
            userId: user.id,
            email: user.email,
            role: user.auth_role // Use auth_role field from schema
        }, secretKey, { expiresIn: '1h' })

        res.status(200).json({
            success: true,
            accessToken,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.auth_role, // Use auth_role field from schema
                loginProvider: 'email'
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
                auth_role: true, // Use auth_role field from schema
                avatarUrl: true,
                loginProvider: true, // Thêm loginProvider để biết user login bằng cách nào
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

// UPDATE PROFILE
exports.updateProfileUser = async (req, res) => {
    try {
        const userId = req.userId;
        const { fullName, phone, avatarUrl, studentCode } = req.body;

        // Không có gì để cập nhật
        if (!fullName && !phone && !avatarUrl && !studentCode) {
            return res.status(400).json({
                success: false,
                message: "Không có dữ liệu để cập nhật"
            });
        }

        const updateData = {};
        if (fullName !== undefined) updateData.fullName = fullName;
        if (phone !== undefined) updateData.phone = phone;
        if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

        // Nếu có studentCode, kiểm tra unique
        if (studentCode !== undefined) {
            const existingStudent = await prisma.user.findUnique({
                where: { studentCode }
            });
            if (existingStudent && existingStudent.id !== userId) {
                return res.status(400).json({
                    success: false,
                    message: "Student Code đã tồn tại"
                });
            }
            updateData.studentCode = studentCode;
        }

        const updated = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                email: true,
                fullName: true,
                phone: true,
                studentCode: true,
                avatarUrl: true,
                auth_role: true,
                updatedAt: true
            }
        });

        return res.status(200).json({
            success: true,
            message: "Cập nhật profile thành công",
            data: updated
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal Server Error"
        });
    }
};

// LOGIN WITH GOOGLE
// User đã login với Google qua Supabase, FE gửi email lên để BE tạo JWT token
exports.loginWithGoogle = async (req, res) => {
    const secretKey = process.env.SECRET_KEY;
    const { email } = req.body;

    try {
        if (!email) {
            return res.status(400).json({
                message: "Email is required",
                success: false
            });
        }

        // Tìm user trong DB theo email
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return res.status(404).json({
                message: "Email chưa được đăng ký trong hệ thống. Vui lòng đăng ký trước.",
                success: false
            });
        }

        // Kiểm tra user có active không
        if (!user.isActive) {
            return res.status(403).json({
                message: "Tài khoản đã bị vô hiệu hóa",
                success: false
            });
        }

        // Cập nhật loginProvider = 'google' để đánh dấu user đã login bằng Google
        await prisma.user.update({
            where: { id: user.id },
            data: { loginProvider: 'google' }
        });

        // Tạo JWT token (giống như login thông thường, nhưng không cần verify password)
        const accessToken = jwt.sign({
            userId: user.id,
            email: user.email,
            role: user.auth_role
        }, secretKey, { expiresIn: '1h' });

        res.status(200).json({
            success: true,
            accessToken,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.auth_role,
                loginProvider: 'google'
            }
        });
    } catch (error) {
        console.error('Login with Google Error:', error);
        res.status(500).json({
            message: error.message || "Internal Server Error",
            success: false
        });
    }
};

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
