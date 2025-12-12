const express = require('express');
const router = express.Router();

const userRouter = require('../routes/users');
const clubRouter = require('../routes/clubs');
const transactionRouter = require('../routes/transactions');
const auth = require('../middlewares/auth');
router.use('/users', userRouter);
router.use('/clubs', clubRouter);
router.use('/transactions',
    auth.requireRole('USER', 'ADMIN'),
    transactionRouter);

module.exports = router