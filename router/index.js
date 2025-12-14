const express = require('express');
const router = express.Router();

const userRouter = require('../routes/users');
const clubRouter = require('../routes/clubs');
const transactionRouter = require('../routes/transactions');
const eventsRouter = require('../routes/events');
const ticketsRouter = require('../routes/tickets');

router.use('/users', userRouter);
router.use('/clubs', clubRouter);
router.use('/transactions', transactionRouter);
router.use('/events', eventsRouter);
router.use('/tickets', ticketsRouter);

module.exports = router