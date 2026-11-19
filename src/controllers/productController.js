import { productStore } from '../models/product.js';
import { catchAsync } from '../middleware/catchAsync.js';

const createResponse = (success, data = null, error = null) => ({
  success,
  data,
  error
});

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
  res.json(createResponse(true, products));
};

const getProductByIdHandler = (req, res) => {
  const { id } = req.params;
  const product = productStore.findById(id);

  if (!product) {
    return res.status(404).json(createResponse(false, null, { message: 'Product not found', code: 'NOT_FOUND' }));
  }

  res.json(createResponse(true, product));
};

const createProductHandler = (req, res) => {
  const product = productStore.create(req.body);
  res.status(201).json(createResponse(true, product));
};

const updateProductHandler = (req, res) => {
  const { id } = req.params;
  const product = productStore.update(id, req.body);

  if (!product) {
    return res.status(404).json(createResponse(false, null, { message: 'Product not found', code: 'NOT_FOUND' }));
  }

  res.json(createResponse(true, product));
};

const deleteProductHandler = (req, res) => {
  const { id } = req.params;
  const deleted = productStore.delete(id);

  if (!deleted) {
    return res.status(404).json(createResponse(false, null, { message: 'Product not found', code: 'NOT_FOUND' }));
  }

  res.json(createResponse(true, { message: 'Product archived successfully' }));
};

const restoreProductHandler = (req, res) => {
  const { id } = req.params;
  const restored = productStore.restore(id);

  if (!restored) {
    return res.status(404).json(createResponse(false, null, { message: 'Product not found', code: 'NOT_FOUND' }));
  }

  res.json(createResponse(true, { message: 'Product restored successfully' }));
};

export const getAllProducts = catchAsync(getAllProductsHandler);
export const getProductById = catchAsync(getProductByIdHandler);
export const createProduct = catchAsync(createProductHandler);
export const updateProduct = catchAsync(updateProductHandler);
export const deleteProduct = catchAsync(deleteProductHandler);
export const restoreProduct = catchAsync(restoreProductHandler);