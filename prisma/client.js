require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

// Prisma v6 với Supabase PostgreSQL
const prisma = new PrismaClient({
    log: ['error', 'warn'],
});

module.exports = prisma;
