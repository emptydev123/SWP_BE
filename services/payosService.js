const { PayOS } = require('@payos/node');

/**
 * PayOS Service - Xử lý tích hợp PayOS API
 * Sử dụng package @payos/node để tự động xử lý kết nối và URL
 */

/**
 * Utility: Truncate description xuống tối đa 25 ký tự (PayOS requirement)
 * @param {string} description - Description gốc
 * @returns {string} Description đã được truncate
 */
function truncateDescription(description) {
    const maxLength = 25;
    if (!description || description.length <= maxLength) {
        return description || '';
    }
    return description.substring(0, maxLength);
}

class PayOSService {
    constructor() {
        // Lấy thông tin từ environment variables
        this.clientId = process.env.PAYOS_CLIENT_ID;
        this.apiKey = process.env.PAYOS_API_KEY;
        this.checksumKey = process.env.PAYOS_CHECKSUM_KEY;

        // Default port 5001 (có thể override bằng PAYOS_RETURN_URL và PAYOS_CANCEL_URL trong .env)
        const defaultPort = process.env.PORT || 5001;
        this.returnUrl = process.env.PAYOS_RETURN_URL || `http://localhost:${defaultPort}/api/transactions/return`;
        this.cancelUrl = process.env.PAYOS_CANCEL_URL || `http://localhost:${defaultPort}/api/transactions/cancel`;

        // Validate config
        if (!this.clientId || !this.apiKey || !this.checksumKey) {
            console.warn('PayOS credentials chưa được cấu hình đầy đủ trong .env');
            this.payOS = null;
        } else {
            // Khởi tạo PayOS instance (giống project cũ)
            this.payOS = new PayOS(
                this.clientId,
                this.apiKey,
                this.checksumKey
            );
        }
    }

    /**
     * Tạo payment link từ PayOS
     * @param {Object} paymentData - Dữ liệu thanh toán
     * @param {number} paymentData.orderCode - Mã đơn hàng (unique)
     * @param {number} paymentData.amount - Số tiền (VND)
     * @param {string} paymentData.description - Mô tả đơn hàng
     * @param {string} paymentData.buyerName - Tên người mua
     * @param {string} paymentData.buyerEmail - Email người mua
     * @param {string} paymentData.buyerPhone - SĐT người mua
     * @param {Object} paymentData.items - Danh sách items
     * @param {number} paymentData.expireMinutes - Số phút hết hạn (mặc định 60 phút)
     * @returns {Promise<Object>} Payment link response từ PayOS
     */
    async createPaymentLink(paymentData) {
        try {
            const { orderCode, amount, description, buyerName, buyerEmail, buyerPhone, items, expireMinutes = 60 } = paymentData;

            // Validate required fields
            if (!orderCode || !amount || !description) {
                throw new Error('Thiếu thông tin bắt buộc: orderCode, amount, description');
            }

            // Validate PayOS credentials
            if (!this.payOS) {
                throw new Error('PayOS credentials chưa được cấu hình. Vui lòng kiểm tra PAYOS_CLIENT_ID, PAYOS_API_KEY và PAYOS_CHECKSUM_KEY trong .env');
            }

            // Truncate description xuống tối đa 25 ký tự (PayOS requirement)
            const truncatedDescription = truncateDescription(description);

            // Tính expiredAt: expireMinutes phút từ bây giờ
            const expiredAt = Math.floor(Date.now() / 1000) + (expireMinutes * 60);

            // Tạo request body theo PayOS API format
            const requestBody = {
                orderCode: orderCode, // Số nguyên dương, unique
                amount: amount, // Số tiền (VND)
                description: truncatedDescription, // Mô tả đơn hàng (tối đa 25 ký tự)
                items: items || [
                    {
                        name: truncatedDescription,
                        quantity: 1,
                        price: amount
                    }
                ],
                cancelUrl: this.cancelUrl,
                returnUrl: this.returnUrl,
                buyerName: buyerName || 'Khách hàng',
                buyerEmail: buyerEmail || '',
                buyerPhone: buyerPhone || '',
                expiredAt: expiredAt // Expire sau expireMinutes phút
            };

            // Log request info để debug
            console.log('PayOS API Request:', {
                orderCode: orderCode,
                amount: amount,
                description: description,
                hasCredentials: !!(this.clientId && this.apiKey && this.checksumKey)
            });

            // Gọi PayOS API sử dụng package @payos/node (tự động xử lý URL và kết nối)
            const response = await this.payOS.paymentRequests.create(requestBody);

            // Lấy expiredAt từ response hoặc từ request body (Unix timestamp)
            const expiredAtTimestamp = response.expiredAt || requestBody.expiredAt;
            const expiredAt = expiredAtTimestamp ? new Date(expiredAtTimestamp * 1000) : null;

            return {
                success: true,
                data: response, // Response từ PayOS package
                paymentLink: response.checkoutUrl,
                expiredAt: expiredAt // Convert từ Unix timestamp sang Date
            };

        } catch (error) {
            // Log chi tiết lỗi để debug
            console.error('PayOS Create Payment Error:', {
                message: error.message,
                code: error.code,
                response: error.response?.data || error.response,
                hasCredentials: !!(this.clientId && this.apiKey && this.checksumKey)
            });

            // Xử lý các loại lỗi khác nhau
            if (error.message) {
                throw new Error(`PayOS API Error: ${error.message}`);
            } else {
                throw new Error(`PayOS API Error: ${JSON.stringify(error)}`);
            }
        }
    }

    /**
     * Lấy thông tin payment từ PayOS
     * @param {number} orderCode - Mã đơn hàng
     * @returns {Promise<Object>} Payment info
     */
    async getPaymentInfo(orderCode) {
        try {
            if (!this.payOS) {
                throw new Error('PayOS credentials chưa được cấu hình');
            }

            const response = await this.payOS.paymentRequests.get(orderCode);

            return {
                success: true,
                data: response
            };

        } catch (error) {
            console.error('PayOS Get Payment Info Error:', error.message || error);
            throw new Error(`PayOS API Error: ${error.message || JSON.stringify(error)}`);
        }
    }

    /**
     * Hủy payment link
     * @param {number} orderCode - Mã đơn hàng
     * @returns {Promise<Object>} Cancel result
     */
    async cancelPayment(orderCode) {
        try {
            if (!this.payOS) {
                throw new Error('PayOS credentials chưa được cấu hình');
            }

            const response = await this.payOS.paymentRequests.cancel(orderCode);

            return {
                success: true,
                data: response
            };

        } catch (error) {
            console.error('PayOS Cancel Payment Error:', error.message || error);
            throw new Error(`PayOS API Error: ${error.message || JSON.stringify(error)}`);
        }
    }

    /**
     * Verify webhook signature từ PayOS
     * @param {Object} webhookData - Dữ liệu webhook
     * @param {string} signature - Signature từ header (optional, nếu dùng package thì không cần)
     * @returns {boolean} True nếu signature hợp lệ
     */
    verifyWebhookSignature(webhookData, signature) {
        try {
            if (!this.payOS) {
                console.error('PayOS not initialized');
                return false;
            }

            // Sử dụng method verifyPaymentWebhookData từ package PayOS
            try {
                const verified = this.payOS.verifyPaymentWebhookData(webhookData);
                return !!verified; // Nếu verify thành công, trả về true
            } catch (verifyError) {
                // Nếu package verify fail, fallback về manual verify
                console.log('PayOS package verification failed, using manual verify:', verifyError.message);
                const crypto = require('crypto');
                const dataString = JSON.stringify(webhookData);
                const hmac = crypto.createHmac('sha256', this.checksumKey);
                hmac.update(dataString);
                const calculatedSignature = hmac.digest('hex');
                return calculatedSignature === signature;
            }
        } catch (error) {
            console.error('Verify Webhook Signature Error:', error);
            return false;
        }
    }
}

module.exports = new PayOSService();


