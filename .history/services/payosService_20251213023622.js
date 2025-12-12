const axios = require('axios');
const crypto = require('crypto');

/**
 * PayOS Service - Xử lý tích hợp PayOS API
 * 
 * PayOS API Documentation:
 * - Create Payment: POST https://api.payos.vn/v2/payment-requests
 * - Get Payment Info: GET https://api.payos.vn/v2/payment-requests/{id}
 * - Cancel Payment: POST https://api.payos.vn/v2/payment-requests/{id}/cancel
 */

class PayOSService {
    constructor() {
        // Lấy thông tin từ environment variables
        this.clientId = process.env.PAYOS_CLIENT_ID;
        this.apiKey = process.env.PAYOS_API_KEY;
        this.checksumKey = process.env.PAYOS_CHECKSUM_KEY;
        this.baseUrl = process.env.PAYOS_BASE_URL || 'https://api.payos.vn/v2';
        // Default port 5001 (có thể override bằng PAYOS_RETURN_URL và PAYOS_CANCEL_URL trong .env)
        const defaultPort = process.env.PORT || 5001;
        this.returnUrl = process.env.PAYOS_RETURN_URL || `http://localhost:${defaultPort}/api/transactions/return`;
        this.cancelUrl = process.env.PAYOS_CANCEL_URL || `http://localhost:${defaultPort}/api/transactions/cancel`;
        
        // Validate config
        if (!this.clientId || !this.apiKey || !this.checksumKey) {
            console.warn('PayOS credentials chưa được cấu hình đầy đủ trong .env');
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
     * @returns {Promise<Object>} Payment link response từ PayOS
     */
    async createPaymentLink(paymentData) {
        try {
            const { orderCode, amount, description, buyerName, buyerEmail, buyerPhone, items } = paymentData;

            // Validate required fields
            if (!orderCode || !amount || !description) {
                throw new Error('Thiếu thông tin bắt buộc: orderCode, amount, description');
            }

            // Tạo request body theo PayOS API format
            const requestBody = {
                orderCode: orderCode, // Số nguyên dương, unique
                amount: amount, // Số tiền (VND)
                description: description, // Mô tả đơn hàng
                items: items || [
                    {
                        name: description,
                        quantity: 1,
                        price: amount
                    }
                ],
                cancelUrl: this.cancelUrl,
                returnUrl: this.returnUrl,
                buyerName: buyerName || 'Khách hàng',
                buyerEmail: buyerEmail || '',
                buyerPhone: buyerPhone || '',
                expiredAt: Math.floor(Date.now() / 1000) + 3600 // Expire sau 1 giờ
            };

            // Gọi PayOS API
            const response = await axios.post(
                `${this.baseUrl}/payment-requests`,
                requestBody,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-client-id': this.clientId,
                        'x-api-key': this.apiKey
                    }
                }
            );

            return {
                success: true,
                data: response.data.data, // Chứa checkoutUrl, qrCode, etc.
                paymentLink: response.data.data.checkoutUrl
            };

        } catch (error) {
            console.error('PayOS Create Payment Error:', error.response?.data || error.message);
            throw new Error(`PayOS API Error: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Lấy thông tin payment từ PayOS
     * @param {number} orderCode - Mã đơn hàng
     * @returns {Promise<Object>} Payment info
     */
    async getPaymentInfo(orderCode) {
        try {
            const response = await axios.get(
                `${this.baseUrl}/payment-requests/${orderCode}`,
                {
                    headers: {
                        'x-client-id': this.clientId,
                        'x-api-key': this.apiKey
                    }
                }
            );

            return {
                success: true,
                data: response.data.data
            };

        } catch (error) {
            console.error('PayOS Get Payment Info Error:', error.response?.data || error.message);
            throw new Error(`PayOS API Error: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Hủy payment link
     * @param {number} orderCode - Mã đơn hàng
     * @returns {Promise<Object>} Cancel result
     */
    async cancelPayment(orderCode) {
        try {
            const response = await axios.post(
                `${this.baseUrl}/payment-requests/${orderCode}/cancel`,
                {},
                {
                    headers: {
                        'x-client-id': this.clientId,
                        'x-api-key': this.apiKey
                    }
                }
            );

            return {
                success: true,
                data: response.data.data
            };

        } catch (error) {
            console.error('PayOS Cancel Payment Error:', error.response?.data || error.message);
            throw new Error(`PayOS API Error: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Verify webhook signature từ PayOS
     * @param {Object} webhookData - Dữ liệu webhook
     * @param {string} signature - Signature từ header
     * @returns {boolean} True nếu signature hợp lệ
     */
    verifyWebhookSignature(webhookData, signature) {
        try {
            // Tạo checksum từ webhook data
            const dataString = JSON.stringify(webhookData);
            const hmac = crypto.createHmac('sha256', this.checksumKey);
            hmac.update(dataString);
            const calculatedSignature = hmac.digest('hex');

            // So sánh signature
            return calculatedSignature === signature;
        } catch (error) {
            console.error('Verify Webhook Signature Error:', error);
            return false;
        }
    }
}

module.exports = new PayOSService();


