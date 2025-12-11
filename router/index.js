const express = require('express');
const router = express.Router();

const userRouter = require('../routes/users');

const clubRouter = require('../routes/clubs');

router.use('/users', userRouter);
router.use('/clubs', clubRouter);

module.exports = router