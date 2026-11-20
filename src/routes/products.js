import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  restoreProduct
} from '../controllers/productController.js';
import { validateCreate, validateUpdate, validateFilters } from '../validators/productValidator.js';

const router = Router();

// Rate limiter for write endpoints (30 req/min per IP)
const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many requests', code: 'RATE_LIMITED' }}
});

router.get('/', validateFilters, getAllProducts);
router.get('/:id', getProductById);
router.post('/', writeLimiter, validateCreate, createProduct);
router.patch('/:id', writeLimiter, validateUpdate, updateProduct);
router.delete('/:id', writeLimiter, deleteProduct);
router.delete('/:id/restore', writeLimiter, restoreProduct);

export default router;