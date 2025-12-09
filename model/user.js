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
        enum: ['customer', 'staff', 'technical', 'admin'],
        default: 'customer'
    },
    provider: {
        type: String,
        enum: ["local", "google"],
        default: "local"
    }
}, { timestamps: true })
const user = mongoose.model('User', userSchema);
module.exports = user