// Script to seed some sample audit logs for testing
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedAuditLogs() {
    console.log('Seeding audit logs...');

    const sampleLogs = [
        {
            action: 'LOGIN',
            userEmail: 'admin@edu.vn',
            details: 'Đăng nhập thành công',
            ipAddress: '192.168.1.1',
        },
        {
            action: 'CREATE_CLUB',
            userEmail: 'admin@edu.vn',
            details: 'Tạo CLB mới: CLB AI',
            ipAddress: '192.168.1.1',
        },
        {
            action: 'UPDATE_CLUB',
            userEmail: 'admin@edu.vn',
            details: 'Cập nhật thông tin CLB Guitar',
            ipAddress: '192.168.1.1',
        },
        {
            action: 'APPROVE_FUND',
            userEmail: 'admin@edu.vn',
            details: 'Duyệt yêu cầu chi #REQ-002',
            ipAddress: '192.168.1.1',
        },
        {
            action: 'BAN_USER',
            userEmail: 'admin@edu.vn',
            details: 'Khóa tài khoản user #U123',
            ipAddress: '192.168.1.1',
        },
        {
            action: 'CREATE_EVENT',
            userEmail: 'leader@edu.vn',
            details: 'Tạo sự kiện: Workshop AI 2024',
            ipAddress: '192.168.1.5',
        },
        {
            action: 'UPDATE_EVENT',
            userEmail: 'leader@edu.vn',
            details: 'Cập nhật sự kiện: Workshop AI 2024',
            ipAddress: '192.168.1.5',
        },
        {
            action: 'LOGIN',
            userEmail: 'user@edu.vn',
            details: 'Đăng nhập thành công',
            ipAddress: '192.168.1.10',
        },
    ];

    for (const log of sampleLogs) {
        await prisma.auditLog.create({
            data: log
        });
    }

    console.log(`Created ${sampleLogs.length} audit logs`);
    await prisma.$disconnect();
}

seedAuditLogs().catch(error => {
    console.error('Error seeding audit logs:', error);
    process.exit(1);
});
