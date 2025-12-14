/**
 * Pagination Utilities
 * Helper functions để xử lý phân trang cho các API
 */

/**
 * Parse pagination params từ query string
 * @param {Object} query - Query object từ req.query
 * @param {Object} options - Options
 * @param {number} options.defaultPage - Trang mặc định (default: 1)
 * @param {number} options.defaultLimit - Số items mỗi trang mặc định (default: 10)
 * @param {number} options.maxLimit - Số items tối đa mỗi trang (default: 100)
 * @returns {Object} { page, limit, skip, take }
 */
function parsePaginationParams(query, options = {}) {
    const {
        defaultPage = 1,
        defaultLimit = 10,
        maxLimit = 100
    } = options;

    // Parse page (bắt đầu từ 1)
    let page = parseInt(query.page) || defaultPage;
    if (page < 1) page = 1;

    // Parse limit
    let limit = parseInt(query.limit) || parseInt(query.pageSize) || defaultLimit;
    if (limit < 1) limit = defaultLimit;
    if (limit > maxLimit) limit = maxLimit;

    // Tính skip và take cho Prisma
    const skip = (page - 1) * limit;
    const take = limit;

    return {
        page,
        limit,
        skip,
        take
    };
}

/**
 * Format pagination response
 * @param {Object} data - Data từ query
 * @param {number} total - Tổng số records
 * @param {Object} paginationParams - Kết quả từ parsePaginationParams
 * @returns {Object} Formatted response với pagination metadata
 */
function formatPaginationResponse(data, total, paginationParams) {
    const { page, limit } = paginationParams;
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
        data: data,
        pagination: {
            currentPage: page,
            limit: limit,
            total: total,
            totalPages: totalPages,
            hasNext: hasNext,
            hasPrev: hasPrev,
            nextPage: hasNext ? page + 1 : null,
            prevPage: hasPrev ? page - 1 : null
        }
    };
}

/**
 * Tạo pagination object cho Prisma query
 * @param {Object} query - Query object từ req.query
 * @param {Object} options - Options (giống parsePaginationParams)
 * @returns {Object} { skip, take } để dùng trong Prisma query
 */
function getPaginationQuery(query, options = {}) {
    const { skip, take } = parsePaginationParams(query, options);
    return { skip, take };
}

/**
 * Paginate Prisma query với count
 * @param {Function} findManyFn - Function trả về Prisma findMany promise
 * @param {Function} countFn - Function trả về Prisma count promise
 * @param {Object} query - Query object từ req.query
 * @param {Object} options - Options cho pagination
 * @returns {Promise<Object>} Formatted response với pagination
 */
async function paginate(findManyFn, countFn, query, options = {}) {
    const paginationParams = parsePaginationParams(query, options);

    // Chạy song song: lấy data và count
    const [data, total] = await Promise.all([
        findManyFn({
            skip: paginationParams.skip,
            take: paginationParams.take
        }),
        countFn()
    ]);

    return formatPaginationResponse(data, total, paginationParams);
}

/**
 * Paginate với custom where clause
 * @param {Object} prismaModel - Prisma model (ví dụ: prisma.user)
 * @param {Object} where - Where clause cho Prisma
 * @param {Object} query - Query object từ req.query
 * @param {Object} options - Options cho pagination và findMany
 * @param {Object} options.select - Select fields
 * @param {Object} options.include - Include relations
 * @param {Object} options.orderBy - Order by
 * @returns {Promise<Object>} Formatted response với pagination
 */
async function paginateWithWhere(prismaModel, where, query, options = {}) {
    const {
        select,
        include,
        orderBy,
        ...paginationOptions
    } = options;

    const paginationParams = parsePaginationParams(query, paginationOptions);

    // Build findMany options
    const findManyOptions = {
        where: where,
        skip: paginationParams.skip,
        take: paginationParams.take
    };

    if (select) findManyOptions.select = select;
    if (include) findManyOptions.include = include;
    if (orderBy) findManyOptions.orderBy = orderBy;

    // Chạy song song: lấy data và count
    const [data, total] = await Promise.all([
        prismaModel.findMany(findManyOptions),
        prismaModel.count({ where: where })
    ]);

    return formatPaginationResponse(data, total, paginationParams);
}

module.exports = {
    parsePaginationParams,
    formatPaginationResponse,
    getPaginationQuery,
    paginate,
    paginateWithWhere
};

