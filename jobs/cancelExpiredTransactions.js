const prisma = require('../prisma/client');

/**
 * Job: Tự động cancel các transaction PENDING quá 15 phút
 * Chạy mỗi 1 phút để kiểm tra
 */
async function cancelExpiredTransactions() {
    try {
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000); // 15 phút trước

        // Tìm tất cả transaction PENDING được tạo trước 15 phút (MEMBERSHIP & EVENT_TICKET)
        const expiredTransactions = await prisma.transaction.findMany({
            where: {
                status: 'PENDING',
                type: { in: ['MEMBERSHIP', 'EVENT_TICKET'] },
                createdAt: {
                    lt: fifteenMinutesAgo
                }
            },
            include: {
                referenceMembership: true,
                tickets: true
            }
        });

        if (expiredTransactions.length === 0) {
            console.log('[Cancel Expired Transactions] Không có transaction nào hết hạn');
            return;
        }

        console.log(`[Cancel Expired Transactions] Tìm thấy ${expiredTransactions.length} transaction hết hạn`);

        // Cancel từng transaction
        for (const transaction of expiredTransactions) {
            try {
                await prisma.$transaction(async (tx) => {
                    // 1. Update transaction status = CANCELLED
                    await tx.transaction.update({
                        where: { id: transaction.id },
                        data: {
                            status: 'CANCELLED'
                        }
                    });

                    // 2. Nếu có tickets ở trạng thái RESERVED/INIT, hủy chúng
                    if (transaction.type === 'EVENT_TICKET' && transaction.tickets?.length) {
                        await tx.ticket.updateMany({
                            where: {
                                id: { in: transaction.tickets.map(t => t.id) },
                                status: { in: ['RESERVED', 'INIT'] }
                            },
                            data: {
                                status: 'CANCELLED'
                            }
                        });
                    }

                    // 3. Membership giữ nguyên PENDING_PAYMENT để user tạo giao dịch mới nếu cần
                });

                console.log(`[Cancel Expired Transactions] Đã cancel transaction ${transaction.id}`);
            } catch (error) {
                console.error(`[Cancel Expired Transactions] Lỗi khi cancel transaction ${transaction.id}:`, error);
            }
        }

        console.log(`[Cancel Expired Transactions] Đã xử lý ${expiredTransactions.length} transaction`);
    } catch (error) {
        console.error('[Cancel Expired Transactions] Lỗi:', error);
    }
}

// Export function để có thể gọi từ bên ngoài
module.exports = {
    cancelExpiredTransactions
};

// Nếu chạy trực tiếp file này, tự động chạy job mỗi 1 phút
if (require.main === module) {
    console.log('[Cancel Expired Transactions] Job đã được khởi động. Chạy mỗi 1 phút.');

    // Chạy ngay lần đầu
    cancelExpiredTransactions();

    // Sau đó chạy mỗi 1 phút
    setInterval(cancelExpiredTransactions, 60 * 1000); // 60 giây = 1 phút
}

