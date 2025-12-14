const QRCode = require('qrcode');

/**
 * Parse payosPayload từ database (JSON string) thành object
 * @param {string} payosPayloadString - JSON string từ database
 * @returns {Object|null} Parsed payosPayload hoặc null nếu lỗi
 */
function parsePayosPayload(payosPayloadString) {
    if (!payosPayloadString) {
        return null;
    }
    try {
        return JSON.parse(payosPayloadString);
    } catch (error) {
        console.error('Error parsing payosPayload:', error);
        return null;
    }
}

/**
 * Format transaction response với payment info từ payosPayload
 * @param {Object} transaction - Transaction object từ database
 * @param {boolean} includeQRCode - Có generate QR code không (default: false)
 * @returns {Promise<Object>} Formatted transaction với payment info
 */
async function formatTransactionWithPayment(transaction, includeQRCode = false) {
    const payosData = parsePayosPayload(transaction.payosPayload);

    const formatted = {
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        paymentMethod: transaction.paymentMethod,
        paymentReference: transaction.paymentReference, // orderCode
        createdAt: transaction.createdAt,
        confirmedAt: transaction.confirmedAt,
        // Payment info từ payosPayload
        paymentLink: payosData?.checkoutUrl || null,
        orderCode: payosData?.orderCode || transaction.paymentReference || null,
        qrCode: null, // Sẽ generate nếu cần
        expiresAt: payosData?.expiredAt ? new Date(payosData.expiredAt * 1000) : null,
        // Full payosData nếu cần
        payosData: payosData
    };

    // Generate QR code nếu cần và có paymentLink
    if (includeQRCode && formatted.paymentLink) {
        try {
            formatted.qrCode = await QRCode.toDataURL(formatted.paymentLink);
        } catch (qrError) {
            console.error('Error generating QR code:', qrError);
            formatted.qrCode = null;
        }
    }

    return formatted;
}

/**
 * Lấy payment info từ transaction (dùng khi cần payment link và QR code)
 * @param {Object} transaction - Transaction object từ database
 * @returns {Promise<Object>} Payment info với paymentLink, qrCode, orderCode
 */
async function getPaymentInfo(transaction) {
    const payosData = parsePayosPayload(transaction.payosPayload);

    if (!payosData || !payosData.checkoutUrl) {
        return {
            paymentLink: null,
            qrCode: null,
            orderCode: transaction.paymentReference || null,
            error: 'Không tìm thấy payment link'
        };
    }

    // Ưu tiên dùng QR code từ PayOS (nếu có), nếu không thì generate từ paymentLink
    let qrCodeDataUrl = null;
    if (payosData.qrCode) {
        // PayOS đã cung cấp QR code string, convert thành data URL
        // QR code từ PayOS là string dạng: "00020101021238570010A000000727..."
        // Có thể dùng trực tiếp hoặc convert thành image
        // Tạm thời generate từ checkoutUrl để đảm bảo format đúng
        try {
            qrCodeDataUrl = await QRCode.toDataURL(payosData.checkoutUrl);
        } catch (qrError) {
            console.error('Error generating QR code:', qrError);
        }
    } else {
        // Generate QR code từ payment link
        try {
            qrCodeDataUrl = await QRCode.toDataURL(payosData.checkoutUrl);
        } catch (qrError) {
            console.error('Error generating QR code:', qrError);
        }
    }

    return {
        paymentLink: payosData.checkoutUrl,
        qrCode: qrCodeDataUrl,
        qrCodeString: payosData.qrCode || null, // QR code string từ PayOS (nếu có)
        orderCode: payosData.orderCode || transaction.paymentReference,
        amount: transaction.amount,
        status: transaction.status,
        expiresAt: payosData.expiredAt ? new Date(payosData.expiredAt * 1000) : null,
        // Thêm các thông tin khác từ PayOS nếu cần
        accountNumber: payosData.accountNumber || null,
        accountName: payosData.accountName || null,
        bin: payosData.bin || null,
        paymentLinkId: payosData.paymentLinkId || null
    };
}

module.exports = {
    parsePayosPayload,
    formatTransactionWithPayment,
    getPaymentInfo
};

