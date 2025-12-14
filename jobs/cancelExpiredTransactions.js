const prisma = require('../prisma/client');

/**
 * Job: Tự động cancel các transaction PENDING quá 5 phút
 * Chạy mỗi 1 phút để kiểm tra
 */
async function cancelExpiredTransactions() {
    try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000); // 5 phút trước

        // Tìm tất cả transaction PENDING được tạo trước 5 phút
        const expiredTransactions = await prisma.transaction.findMany({
            where: {
                status: 'PENDING',
                type: 'MEMBERSHIP',
                createdAt: {
                    lt: fiveMinutesAgo
                }
            },
            include: {
                referenceMembership: true
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

                    // 2. Nếu có membership PENDING_PAYMENT, có thể update status hoặc giữ nguyên
                    // (Tùy business logic: có thể giữ PENDING_PAYMENT để user có thể tạo transaction mới)
                    if (transaction.referenceMembershipId && transaction.referenceMembership) {
                        // Option 1: Giữ nguyên status PENDING_PAYMENT (user có thể tạo transaction mới)
                        // Option 2: Update membership status = INACTIVE (nếu muốn)
                        // Hiện tại giữ nguyên để user có thể tạo transaction mới
                    }
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

