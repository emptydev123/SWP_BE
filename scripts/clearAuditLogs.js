const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearAuditLogs() {
  try {
    const result = await prisma.auditLog.deleteMany({});
    console.log(`Deleted ${result.count} audit log entries.`);
  } catch (err) {
    console.error('Failed to clear audit logs:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

clearAuditLogs();
