const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const XLSX = require('xlsx');

/**
 * Utility function to create audit log entries
 * Call this from other controllers to log important actions
 */
exports.createAuditLog = async ({ action, userId, userEmail, details, ipAddress, userAgent, metadata }) => {
    try {
        await prisma.auditLog.create({
            data: {
                action,
                userId: userId || null,
                userEmail: userEmail || null,
                details: details || null,
                ipAddress: ipAddress || null,
                userAgent: userAgent || null,
                metadata: metadata || null,
            }
        });
    } catch (error) {
        console.error('Failed to create audit log:', error);
        // Don't throw - logging should not break the main operation
    }
};

/**
 * Get audit logs with filtering and pagination
 * GET /api/admin/audit-logs
 */
exports.getAuditLogs = async (req, res) => {
    try {
        const { 
            action,      // Filter by action type
            search,      // Search in userEmail or details
            page = 1, 
            limit = 50,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        // Build where clause
        const where = {};

        if (action && action !== 'all') {
            where.action = action;
        }

        if (search && search.trim()) {
            where.OR = [
                { userEmail: { contains: search.trim(), mode: 'insensitive' } },
                { details: { contains: search.trim(), mode: 'insensitive' } },
            ];
        }

        // Get logs with pagination
        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                skip,
                take,
                orderBy: { [sortBy]: sortOrder },
            }),
            prisma.auditLog.count({ where })
        ]);

        res.json({
            success: true,
            data: logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get audit logs error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Không thể lấy nhật ký hệ thống',
            error: error.message 
        });
    }
};

/**
 * Export audit logs to Excel
 * GET /api/admin/audit-logs/export
 */
exports.exportAuditLogs = async (req, res) => {
    try {
        const { action, search, startDate, endDate } = req.query;

        // Build where clause
        const where = {};

        if (action && action !== 'all') {
            where.action = action;
        }

        if (search && search.trim()) {
            where.OR = [
                { userEmail: { contains: search.trim(), mode: 'insensitive' } },
                { details: { contains: search.trim(), mode: 'insensitive' } },
            ];
        }

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        // Get all matching logs (limit to reasonable amount)
        const logs = await prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 10000 // Limit to 10k records for export
        });

        // Format data for Excel
        const excelData = logs.map(log => ({
            'Thời gian': new Date(log.createdAt).toLocaleString('vi-VN'),
            'Người thực hiện': log.userEmail || 'system',
            'Hành động': log.action,
            'Chi tiết': log.details || '',
            'IP Address': log.ipAddress || '',
            'User Agent': log.userAgent || ''
        }));

        // Create workbook and worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);

        // Set column widths
        ws['!cols'] = [
            { wch: 20 }, // Thời gian
            { wch: 30 }, // Người thực hiện
            { wch: 20 }, // Hành động
            { wch: 50 }, // Chi tiết
            { wch: 15 }, // IP
            { wch: 40 }  // User Agent
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Nhật ký hệ thống');

        // Generate buffer
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${Date.now()}.xlsx`);

        res.send(buffer);
    } catch (error) {
        console.error('Export audit logs error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Không thể xuất nhật ký',
            error: error.message 
        });
    }
};

/**
 * Get audit log statistics
 * GET /api/admin/audit-logs/stats
 */
exports.getAuditLogStats = async (req, res) => {
    try {
        const { days = 7, startDate: startDateParam } = req.query;
        let startDate;

        if (startDateParam) {
            const parsed = new Date(startDateParam);
            if (isNaN(parsed.getTime())) {
                return res.status(400).json({ success: false, message: 'startDate không hợp lệ' });
            }
            startDate = parsed;
        } else {
            startDate = new Date();
            startDate.setDate(startDate.getDate() - parseInt(days));
        }

        // Get action counts
        const actionCounts = await prisma.auditLog.groupBy({
            by: ['action'],
            where: {
                createdAt: { gte: startDate }
            },
            _count: true,
            orderBy: {
                _count: {
                    action: 'desc'
                }
            }
        });

        // Get total count
        const total = await prisma.auditLog.count({
            where: {
                createdAt: { gte: startDate }
            }
        });

        res.json({
            success: true,
            data: {
                total,
                byAction: actionCounts.map(item => ({
                    action: item.action,
                    count: item._count
                })),
                startDate
            }
        });
    } catch (error) {
        console.error('Get audit log stats error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Không thể lấy thống kê',
            error: error.message 
        });
    }
};
