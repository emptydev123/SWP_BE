const nodemailer = require('nodemailer');

// Cấu hình email transporter
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
    },
});

/**
 * Gửi email chúc mừng khi user được add vào club
 * @param {string} email - Email người nhận
 * @param {string} clubName - Tên club
 * @param {string} password - Mật khẩu mặc định (nếu là user mới)
 * @param {boolean} isNewUser - Có phải user mới không
 */
exports.sendWelcomeToClubEmail = async (email, clubName, password = null, isNewUser = false) => {
    try {
        const subject = `Chúc mừng bạn đã được thêm vào ${clubName}!`;

        let htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4CAF50;">Chúc mừng bạn đã được thêm vào ${clubName}!</h2>
                <p>Xin chào,</p>
                <p>Chúng tôi rất vui mừng thông báo rằng bạn đã được thêm vào câu lạc bộ <strong>${clubName}</strong>.</p>
        `;

        if (isNewUser && password) {
            htmlContent += `
                <div style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <p><strong>Tài khoản của bạn đã được tạo:</strong></p>
                    <p>Email: <strong>${email}</strong></p>
                    <p>Mật khẩu mặc định: <strong>${password}</strong></p>
                    <p style="color: #ff5722;"><em>Vui lòng đổi mật khẩu sau khi đăng nhập lần đầu!</em></p>
                </div>
            `;
        }

        htmlContent += `
                <p>Hãy đăng nhập vào hệ thống để khám phá các hoạt động của club!</p>
                <p>Trân trọng,<br>Hệ thống quản lý CLB</p>
            </div>
        `;

        const mailOptions = {
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to: email,
            subject: subject,
            html: htmlContent,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Kiểm tra cấu hình email
 */
exports.checkEmailConfig = () => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        console.warn(' EMAIL_USER và EMAIL_PASSWORD chưa được cấu hình trong .env');
        return false;
    }
    return true;
};



