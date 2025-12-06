var User = require('../model/user')
var bryctjs = require('bcryptjs')
var jwt = require('jsonwebtoken')
var admin = require('../firebase/firebase')
exports.registerUser = async (req, res) => {
    try {
        const { username, password, phoneNumber, email, fullName } = req.body
        const checkuserName = await User.findOne({ username });
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
        const newUser = new User(payload);
        const save = await newUser.save()
        res.status(200).json({
            message: "User register successfully",
            error: false,
            success: true,
            data: {
                username: newUser.username,
                password: newUser.password,
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
        const user = await User.findOne({ username });
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
            userId: user._id,
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




