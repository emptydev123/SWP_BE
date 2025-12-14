const crypto = require('crypto');

/**
 * Generate unique QR code for ticket
 * Format: EVENT-{eventId}-{ticketId}-{randomHash}
 * @param {string} eventId - Event ID
 * @param {string} ticketId - Ticket ID
 * @returns {string} QR code string
 */
function generateQRCode(eventId, ticketId) {
    const randomHash = crypto.randomBytes(8).toString('hex').toUpperCase();
    return `EVENT-${eventId.substring(0, 8)}-${ticketId.substring(0, 8)}-${randomHash}`;
}

module.exports = {
    generateQRCode
};

