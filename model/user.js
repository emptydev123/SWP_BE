const mongoose = require('mongoose');

const schema = mongoose.Schema
const userSchema = new schema({
    username: {
        type: String,
        unique: true
    },
    fullName: {
        type: String,
        unique: true
    },
    password: {
        type: String,
        required: function () {
            return this.provider === "local";
        },
    },
    email: {
        type: String,

    },
    phoneNumber: {
        type: String,
    },
    role: {
        type: String,
        enum: ['member', 'leader', 'staff', 'treasurer'],
        default: 'member'
    },
}, { timestamps: true })
const user = mongoose.model('User', userSchema);
module.exports = user