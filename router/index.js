const express = require('express');
const router = express.Router();

const userRouter = require('../routes/users');
const clubRouter = require('../routes/clubs');
const transactionRouter = require('../routes/transactions');
const eventsRouter = require('../routes/events');
const ticketsRouter = require('../routes/tickets');
const checkinRouter = require('../routes/checkin');
const adminRouter = require('../routes/admin');
const auditLogsRouter = require('../routes/auditLogs');

router.use('/users', userRouter);
router.use('/clubs', clubRouter);
router.use('/transactions', transactionRouter);
router.use('/events', eventsRouter);
router.use('/tickets', ticketsRouter);
router.use('/checkin', checkinRouter);
router.use('/admin', adminRouter);
router.use('/admin/audit-logs', auditLogsRouter);

module.exports = router