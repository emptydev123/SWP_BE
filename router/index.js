const express = require('express');
const router = express.Router();

const userRouter = require('../routes/users');

router.use('/users', userRouter);
module.exports = router