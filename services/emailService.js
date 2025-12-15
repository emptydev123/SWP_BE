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
 * Gửi email khi đơn được duyệt
 */
exports.sendApplicationApprovedEmail = async (email, clubName, options = {}) => {
    try {
        const { paymentLink, amount, orderCode } = options;

        const subject = `Đơn tham gia ${clubName} đã được duyệt`;
        let htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4CAF50;">Chúc mừng! Đơn tham gia của bạn đã được duyệt</h2>
                <p>Xin chào,</p>
                <p>Bạn đã được duyệt tham gia câu lạc bộ <strong>${clubName}</strong>.</p>
        `;

        if (paymentLink) {
            htmlContent += `
                <p><strong>Club có thu phí tham gia.</strong></p>
                <p>Số tiền: <strong>${amount || ''}</strong></p>
                <p>Order Code: <strong>${orderCode || ''}</strong></p>
                <p>Vui lòng thanh toán tại liên kết dưới đây (hạn 5 phút):</p>
                <p><a href="${paymentLink}" style="color: #1a73e8;">${paymentLink}</a></p>
            `;
        }

        htmlContent += `
                <p>Hãy đăng nhập vào hệ thống để tiếp tục.</p>
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
        console.log('Email approved sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending approved email:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Gửi email khi đơn bị từ chối
 */
exports.sendApplicationRejectedEmail = async (email, clubName, reviewNotes = '') => {
    try {
        const subject = `Đơn tham gia ${clubName} đã bị từ chối`;
        const htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #d32f2f;">Rất tiếc! Đơn của bạn đã bị từ chối</h2>
                <p>Xin chào,</p>
                <p>Đơn tham gia câu lạc bộ <strong>${clubName}</strong> đã bị từ chối.</p>
                ${reviewNotes ? `<p>Lý do: <em>${reviewNotes}</em></p>` : ''}
                <p>Bạn có thể liên hệ ban quản trị để biết thêm chi tiết.</p>
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
        console.log('Email rejected sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending rejected email:', error);
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



