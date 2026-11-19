import { body, query, param, validationResult } from 'express-validator';

const VALID_CATEGORIES = ['electronics', 'clothing', 'food', 'books', 'other'];
const VALID_STATUSES = ['active', 'inactive', 'discontinued'];

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array().map(e => e.msg)
      }
    });
  }
  next();
};

export const validateCreate = [
  body('name')
    .exists().withMessage('name is required')
    .isString().withMessage('name must be a string')
    .trim()
    .notEmpty().withMessage('name cannot be empty'),
  body('sku')
    .exists().withMessage('sku is required')
    .isString().withMessage('sku must be a string')
    .trim()
    .notEmpty().withMessage('sku cannot be empty'),
  body('description')
    .optional()
    .isString().withMessage('description must be a string'),
  body('category')
    .optional()
    .isIn(VALID_CATEGORIES).withMessage(`category must be one of: ${VALID_CATEGORIES.join(', ')}`),
  body('price')
    .exists().withMessage('price is required')
    .isFloat({ gt: 0 }).withMessage('price must be a positive number')
    .custom(value => {
      if (Math.round(value * 100) !== value * 100) {
        throw new Error('price must have up to 2 decimal places');
      }
      return true;
    }),
  body('stock')
    .optional()
    .isInt({ min: 0 }).withMessage('stock must be a non-negative integer'),
  body('status')
    .optional()
    .isIn(VALID_STATUSES).withMessage(`status must be one of: ${VALID_STATUSES.join(', ')}`),
  handleValidationErrors
];

export const validateUpdate = [
  param('id')
    .isUUID().withMessage('id must be a valid UUID'),
  body('name')
    .optional()
    .isString().withMessage('name must be a string')
    .trim()
    .notEmpty().withMessage('name cannot be empty'),
  body('sku')
    .optional()
    .isString().withMessage('sku must be a string')
    .trim()
    .notEmpty().withMessage('sku cannot be empty'),
  body('description')
    .optional()
    .isString().withMessage('description must be a string'),
  body('category')
    .optional()
    .isIn(VALID_CATEGORIES).withMessage(`category must be one of: ${VALID_CATEGORIES.join(', ')}`),
  body('price')
    .optional()
    .isFloat({ gt: 0 }).withMessage('price must be a positive number')
    .custom(value => {
      if (Math.round(value * 100) !== value * 100) {
        throw new Error('price must have up to 2 decimal places');
      }
      return true;
    }),
  body('stock')
    .optional()
    .isInt({ min: 0 }).withMessage('stock must be a non-negative integer'),
  body('status')
    .optional()
    .isIn(VALID_STATUSES).withMessage(`status must be one of: ${VALID_STATUSES.join(', ')}`),
  handleValidationErrors
];

export const validateFilters = [
  query('category')
    .optional()
    .isIn(VALID_CATEGORIES).withMessage(`category must be one of: ${VALID_CATEGORIES.join(', ')}`),
  query('status')
    .optional()
    .isIn(VALID_STATUSES).withMessage(`status must be one of: ${VALID_STATUSES.join(', ')}`),
  query('minPrice')
    .optional()
    .isFloat({ min: 0 }).withMessage('minPrice must be a non-negative number'),
  query('maxPrice')
    .optional()
    .isFloat({ min: 0 }).withMessage('maxPrice must be a non-negative number'),
  query('inStock')
    .optional()
    .isIn(['true', 'false']).withMessage('inStock must be true or false'),
  query('search')
    .optional()
    .isString().withMessage('search must be a string'),
  handleValidationErrors
];