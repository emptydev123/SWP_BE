require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

// Prisma v7 tự động đọc DATABASE_URL từ environment variables
const prisma = new PrismaClient();

module.exports = prisma;
