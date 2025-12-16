const prisma = require('../prisma/client');

/**
 * Job: Tự động đánh FAILED các transaction PENDING đã hết hạn
 * - Ưu tiên dùng field time_out (lấy từ PayOS expiredAt)
 * - Fallback: createdAt quá 5 phút (cho các transaction cũ chưa có time_out)
 * Chạy mỗi 1 phút để kiểm tra
 */
async function cancelExpiredTransactions() {
    try {
        const now = new Date();
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000); // 5 phút trước (fallback)

        // Tìm tất cả transaction PENDING đã hết hạn (MEMBERSHIP & EVENT_TICKET)
        const expiredTransactions = await prisma.transaction.findMany({
            where: {
                status: 'PENDING',
                type: { in: ['MEMBERSHIP', 'EVENT_TICKET'] },
                OR: [
                    // Case 1: Có time_out và đã quá hạn
                    {
                        time_out: {
                            not: null,
                            lt: now
                        }
                    },
                    // Case 2: Không có time_out (transaction cũ) → dùng createdAt > 5 phút
                    {
                        AND: [
                            { time_out: null },
                            {
                                createdAt: {
                                    lt: fiveMinutesAgo
                                }
                            }
                        ]
                    }
                ]
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
                console.log('[Cancel Expired Transactions] Xử lý transaction hết hạn', {
                    id: transaction.id,
                    type: transaction.type,
                    createdAt: transaction.createdAt,
                    time_out: transaction.time_out
                });

                await prisma.$transaction(async (tx) => {
                    // 1. Update transaction status = FAILED (do hết hạn, user không thanh toán)
                    await tx.transaction.update({
                        where: { id: transaction.id },
                        data: {
                            status: 'FAILED'
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

