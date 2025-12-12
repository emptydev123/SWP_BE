const express = require('express');
const router = express.Router();

const userRouter = require('../routes/users');
const clubRouter = require('../routes/clubs');
const transactionRouter = require('../routes/transactions');

router.use('/users', userRouter);
router.use('/clubs', clubRouter);
router.use('/transactions',
    auth.authMiddleWare,
    transactionRouter);

module.exports = router