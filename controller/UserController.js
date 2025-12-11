const prisma = require('../prisma/client');
var bryctjs = require('bcryptjs')
var jwt = require('jsonwebtoken')

exports.registerUser = async (req, res) => {
    try {
        const { username, password, phoneNumber, email, fullName } = req.body
        const checkuserName = await prisma.user.findUnique({ where: { username } });
        if (checkuserName) {
            return res.status(400).json({ message: "Please Create New UserName" })
        }
        const salt = await bryctjs.genSalt(10)
        const hashPassword = await bryctjs.hash(password, salt)

        const payload = {
            username,
            password: hashPassword,
            phoneNumber,
            email,
            fullName,
        }
        const newUser = await prisma.user.create({ data: payload });
        res.status(200).json({
            message: "User register successfully",
            error: false,
            success: true,
            data: {
                id: newUser.id,
                username: newUser.username,
                phonenumber: newUser.phoneNumber,
                email: newUser.email,
                fullname: newUser.fullName
            }
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false

        })
    }
}
exports.login = async (req, res) => {

    const secretKey = process.env.SECRET_KEY
    const { username, password } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { username } });
        console.log('1', user)
        if (!user) {
            return res.status(400).json({
                message: "User not found",
                error: false,
                success: false
            })
        }
        const checkPassword = await bryctjs.compare(password, user.password);
        if (!checkPassword) {
            return res.status(400).json({
                message: "Password Incorect",
                error: false,
                success: false
            })
        }
        const accessToken = jwt.sign({
            userId: user.id,
            username: user.username
        }, secretKey, { expiresIn: '1h' })
        res.status(202).json({ status: true, accessToken })
    } catch (error) {
        res.status(401).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }
}

exports.getProfileUser = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: {
                id: true,
                username: true,
                fullName: true,
                email: true,
                phoneNumber: true,
                role: true,
                createdAt: true,
                updatedAt: true,
            }
        });
        if (!user) {
            return res.status(404).json({
                message: "Not found profile",
                error: true,
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
exports.getAllProfileUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                fullName: true,
                email: true,
                phoneNumber: true,
                role: true,
                createdAt: true,
                updatedAt: true,
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
