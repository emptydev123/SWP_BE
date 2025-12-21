const prisma = require('../prisma/client');

/**
 * Job: Cập nhật status của event khi kết thúc
 * - Những event đã được APPROVED và đã qua endTime sẽ được set approvalStatus = 'DONE'
 * - Đồng thời inactive event staff của event đó bằng cách xóa record trong bảng event_staff
 * 
 * Nên chạy job này định kỳ (ví dụ mỗi 5 phút).
 */
async function completeFinishedEvents() {
    try {
        const now = new Date();

        // Tìm các event đã duyệt, đang active, đã qua endTime
        const finishedEvents = await prisma.event.findMany({
            where: {
                approvalStatus: 'APPROVED',
                isActive: true,
                endTime: {
                    lt: now
                }
            },
            select: {
                id: true,
                title: true
            }
        });

        if (finishedEvents.length === 0) {
            console.log('[Complete Finished Events] Không có event nào cần cập nhật');
            return;
        }

        console.log(`[Complete Finished Events] Tìm thấy ${finishedEvents.length} event đã kết thúc, tiến hành cập nhật...`);

        for (const event of finishedEvents) {
            try {
                await prisma.$transaction(async (tx) => {
                    // 1. Cập nhật status event -> DONE + isActive = false
                    await tx.event.update({
                        where: { id: event.id },
                        data: {
                            approvalStatus: 'DONE',
                            isActive: false
                        }
                    });

                    // 2. Đánh dấu toàn bộ event staff của event này là inactive (isActive = false)
                    await tx.eventStaff.updateMany({
                        where: { eventId: event.id },
                        data: {
                            isActive: false
                        }
                    });
                });

                console.log(`[Complete Finished Events] Đã đánh dấu DONE và inactivate staff cho event ${event.id} - ${event.title}`);
            } catch (error) {
                console.error(`[Complete Finished Events] Lỗi khi xử lý event ${event.id}:`, error);
            }
        }

        console.log(`[Complete Finished Events] Đã xử lý ${finishedEvents.length} event`);
    } catch (error) {
        console.error('[Complete Finished Events] Lỗi:', error);
    }
}

module.exports = {
    completeFinishedEvents
};

// Nếu chạy trực tiếp file này, tự động chạy job mỗi 5 phút
if (require.main === module) {
    console.log('[Complete Finished Events] Job đã được khởi động. Chạy mỗi 5 phút.');

    // Chạy ngay lần đầu
    completeFinishedEvents();

    // Sau đó chạy mỗi 5 phút
    setInterval(completeFinishedEvents, 5 * 60 * 1000); // 5 phút
}


