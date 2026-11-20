import { productStore } from '../models/product.js';
import { catchAsync } from '../middleware/catchAsync.js';

/**
 * Standardized API response factory.
 * @param {boolean} success - Whether the request succeeded.
 * @param {*} [data=null] - Response payload on success.
 * @param {Object} [error=null] - Error object on failure.
 * @returns {Object} Formatted response object.
 */
const createResponse = (success, data = null, error = null) => ({
  success,
  data,
  error
});

/**
 * Strips internal fields from product before sending to client.
 * Removes archivedAt (soft-delete timestamp) which is an implementation detail.
 * @param {Object} product - Product object from store.
 * @returns {Object} Sanitized product without archivedAt.
 */
const sanitizeProduct = (product) => {
  const { archivedAt, ...safe } = product;
  return safe;
};

/**
 * GET /products - List products with optional filters.
 * @param {import('express').Request} req - Express request object.
 * @param {Object} req.query - Query parameters.
 * @param {string} [req.query.category] - Filter by category (electronics, clothing, food, books, other).
 * @param {string} [req.query.status] - Filter by status (active, inactive, discontinued).
 * @param {string} [req.query.minPrice] - Minimum price (inclusive).
 * @param {string} [req.query.maxPrice] - Maximum price (inclusive).
 * @param {string} [req.query.inStock] - 'true' for stock>0, 'false' for stock===0.
 * @param {string} [req.query.search] - Case-insensitive search on name, SKU, description (max 100 chars).
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 * @returns {Promise<void>} Sends JSON response.
 * @throws {Error} Passed to error handler via catchAsync wrapper.
 *
 * @apiSuccess {boolean} success true
 * @apiSuccess {Object[]} data Array of product objects (archivedAt stripped)
 *
 * @apiResponse 200 OK - Array of products (empty if none match)
 */
const getAllProductsHandler = (req, res) => {
  const filters = {
    category: req.query.category,
    status: req.query.status,
    minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
    maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
    inStock: req.query.inStock === 'true' ? true : req.query.inStock === 'false' ? false : undefined,
    search: req.query.search
  };

  const products = productStore.findAll(filters);
  res.json(createResponse(true, products.map(sanitizeProduct)));
};

/**
 * GET /products/:id - Get a single product by UUID.
 * @param {import('express').Request} req - Express request object.
 * @param {Object} req.params - Route parameters.
 * @param {string} req.params.id - Product UUID.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 * @returns {Promise<void>} Sends JSON response.
 * @throws {Error} Passed to error handler via catchAsync wrapper.
 *
 * @apiSuccess {boolean} success true
 * @apiSuccess {Object} data Product object (archivedAt stripped)
 *
 * @apiResponse 200 OK - Product found
 * @apiResponse 404 Not Found - Product not found or archived
 */
const getProductByIdHandler = (req, res) => {
  const { id } = req.params;
  const product = productStore.findById(id);

  if (!product) {
    return res.status(404).json(createResponse(false, null, { message: 'Product not found', code: 'NOT_FOUND' }));
  }

  res.json(createResponse(true, sanitizeProduct(product)));
};

/**
 * POST /products - Create a new product.
 * @param {import('express').Request} req - Express request object.
 * @param {Object} req.body - Product data (validated by validateCreate middleware).
 * @param {string} req.body.name - Product name (required).
 * @param {string} req.body.sku - Unique SKU (required).
 * @param {string} [req.body.description] - Optional description.
 * @param {string} [req.body.category='other'] - Category.
 * @param {number} req.body.price - Positive price, max 2 decimals (required).
 * @param {number} [req.body.stock=0] - Non-negative integer.
 * @param {string} [req.body.status='active'] - Status.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 * @returns {Promise<void>} Sends JSON response.
 * @throws {Error} Validation errors (400) or duplicate SKU (409) passed to error handler.
 *
 * @apiSuccess {boolean} success true
 * @apiSuccess {Object} data Created product with id, createdAt (archivedAt stripped)
 *
 * @apiResponse 201 Created - Product created successfully
 * @apiResponse 422 Unprocessable Entity - Validation failed (missing/invalid fields)
 * @apiResponse 409 Conflict - SKU already exists
 * @apiResponse 429 Too Many Requests - Rate limited (30 req/min)
 */
const createProductHandler = async (req, res) => {
  try {
    const product = productStore.create(req.body);
    res.status(201).json(createResponse(true, sanitizeProduct(product)));
  } catch (err) {
    if (err.statusCode === 409) {
      // Generic conflict error - don't leak which SKU exists
      return res.status(409).json(createResponse(false, null, {
        message: 'Validation failed',
        code: 'CONFLICT'
      }));
    }
    throw err;
  }
};

/**
 * PATCH /products/:id - Partially update a product.
 * @param {import('express').Request} req - Express request object.
 * @param {Object} req.params - Route parameters.
 * @param {string} req.params.id - Product UUID.
 * @param {Object} req.body - Fields to update (all optional, validated by validateUpdate).
 * @param {string} [req.body.name] - New name.
 * @param {string} [req.body.sku] - New SKU (must be unique if changed).
 * @param {string} [req.body.description] - New description (null to clear).
 * @param {string} [req.body.category] - New category.
 * @param {number} [req.body.price] - New price.
 * @param {number} [req.body.stock] - New stock.
 * @param {string} [req.body.status] - New status.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 * @returns {Promise<void>} Sends JSON response.
 * @throws {Error} Validation errors (400) or duplicate SKU (409) passed to error handler.
 *
 * @apiSuccess {boolean} success true
 * @apiSuccess {Object} data Updated product (archivedAt stripped)
 *
 * @apiResponse 200 OK - Product updated
 * @apiResponse 404 Not Found - Product not found or archived
 * @apiResponse 422 Unprocessable Entity - Validation failed
 * @apiResponse 409 Conflict - New SKU already exists
 * @apiResponse 429 Too Many Requests - Rate limited (30 req/min)
 */
const updateProductHandler = async (req, res) => {
  const { id } = req.params;
  try {
    const product = productStore.update(id, req.body);

    if (!product) {
      return res.status(404).json(createResponse(false, null, { message: 'Product not found', code: 'NOT_FOUND' }));
    }

    res.json(createResponse(true, sanitizeProduct(product)));
  } catch (err) {
    if (err.statusCode === 409) {
      return res.status(409).json(createResponse(false, null, {
        message: 'Validation failed',
        code: 'CONFLICT'
      }));
    }
    throw err;
  }
};

/**
 * DELETE /products/:id - Soft-archive a product (sets archivedAt).
 * Product is hidden from listings but SKU remains reserved.
 * @param {import('express').Request} req - Express request object.
 * @param {Object} req.params - Route parameters.
 * @param {string} req.params.id - Product UUID.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 * @returns {Promise<void>} Sends JSON response.
 * @throws {Error} Passed to error handler via catchAsync wrapper.
 *
 * @apiSuccess {boolean} success true
 * @apiSuccess {Object} data { message: 'Product archived successfully' }
 *
 * @apiResponse 200 OK - Product archived
 * @apiResponse 404 Not Found - Product not found or already archived
 * @apiResponse 429 Too Many Requests - Rate limited (30 req/min)
 */
const deleteProductHandler = (req, res) => {
  const { id } = req.params;
  const deleted = productStore.delete(id);

  if (!deleted) {
    return res.status(404).json(createResponse(false, null, { message: 'Product not found', code: 'NOT_FOUND' }));
  }

  res.json(createResponse(true, { message: 'Product archived successfully' }));
};

/**
 * DELETE /products/:id/restore - Restore a soft-archived product.
 * Clears archivedAt, product reappears in listings.
 * @param {import('express').Request} req - Express request object.
 * @param {Object} req.params - Route parameters.
 * @param {string} req.params.id - Product UUID.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 * @returns {Promise<void>} Sends JSON response.
 * @throws {Error} Passed to error handler via catchAsync wrapper.
 *
 * @apiSuccess {boolean} success true
 * @apiSuccess {Object} data { message: 'Product restored successfully' }
 *
 * @apiResponse 200 OK - Product restored
 * @apiResponse 404 Not Found - Product not found or not archived
 * @apiResponse 429 Too Many Requests - Rate limited (30 req/min)
 */
const restoreProductHandler = (req, res) => {
  const { id } = req.params;
  const restored = productStore.restore(id);

  if (!restored) {
    return res.status(404).json(createResponse(false, null, { message: 'Product not found', code: 'NOT_FOUND' }));
  }

  res.json(createResponse(true, { message: 'Product restored successfully' }));
};

/**
 * Express handler for GET /products.
 * Wrapped with catchAsync for automatic error forwarding.
 * @type {import('express').RequestHandler}
 */
export const getAllProducts = catchAsync(getAllProductsHandler);

/**
 * Express handler for GET /products/:id.
 * Wrapped with catchAsync for automatic error forwarding.
 * @type {import('express').RequestHandler}
 */
export const getProductById = catchAsync(getProductByIdHandler);

/**
 * Express handler for POST /products.
 * Wrapped with catchAsync for automatic error forwarding.
 * @type {import('express').RequestHandler}
 */
export const createProduct = catchAsync(createProductHandler);

/**
 * Express handler for PATCH /products/:id.
 * Wrapped with catchAsync for automatic error forwarding.
 * @type {import('express').RequestHandler}
 */
export const updateProduct = catchAsync(updateProductHandler);

/**
 * Express handler for DELETE /products/:id.
 * Wrapped with catchAsync for automatic error forwarding.
 * @type {import('express').RequestHandler}
 */
export const deleteProduct = catchAsync(deleteProductHandler);

/**
 * Express handler for DELETE /products/:id/restore.
 * Wrapped with catchAsync for automatic error forwarding.
 * @type {import('express').RequestHandler}
 */
export const restoreProduct = catchAsync(restoreProductHandler);