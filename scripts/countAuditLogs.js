const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function countAuditLogs() {
  try {
    const total = await prisma.auditLog.count();
    const latest = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 5 });
    console.log(`Total audit logs: ${total}`);
    console.log('Latest 5:', latest.map(l => ({ id: l.id, action: l.action, userEmail: l.userEmail, createdAt: l.createdAt })));
  } catch (err) {
    console.error('Failed to count audit logs:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

countAuditLogs();
