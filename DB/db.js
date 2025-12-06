const mongoose = require('mongoose');
var uri = process.env.MONGO_URI
const connectDB = async (req, res) => {
    try {
        const connect = await mongoose.connect(uri);
        console.log("Connect Done")
    } catch (error) {
        console.error(' MongoDB connection error:', error.message);
        // process.exit(1); // dừng app nếu connect fail
    }
}
module.exports = connectDB