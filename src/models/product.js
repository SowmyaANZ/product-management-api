import { v4 as uuidv4 } from 'uuid';

const VALID_CATEGORIES = ['electronics', 'clothing', 'food', 'books', 'other'];
const VALID_STATUSES = ['active', 'inactive', 'discontinued'];

/**
 * In-memory product store with dual-index lookup (by ID and by SKU).
 * Implements soft-archive: deleted products are marked with archivedAt timestamp
 * and excluded from queries, but their SKUs remain reserved.
 */
class ProductStore {
  constructor() {
    // Primary index: id -> product (O(1) lookup by UUID)
    this.byId = new Map();
    // Secondary index: sku -> product (O(1) lookup by SKU, enforces uniqueness)
    this.bySku = new Map();
  }

  /**
   * Validates product data against business rules.
   * @param {Object} data - Product data to validate.
   * @param {string} [data.name] - Product name (required on create, 1-255 chars).
   * @param {string} [data.sku] - Stock Keeping Unit (required on create, unique).
   * @param {string} [data.description] - Optional description.
   * @param {string} [data.category] - Must be one of: electronics, clothing, food, books, other.
   * @param {number} [data.price] - Positive number, max 2 decimal places.
   * @param {number} [data.stock] - Non-negative integer.
   * @param {string} [data.status] - Must be one of: active, inactive, discontinued.
   * @param {boolean} [isUpdate=false] - If true, only validates provided fields (allows partial updates).
   * @returns {string[]} Array of error messages (empty if valid).
   * @throws Never throws; returns errors array.
   */
  validateProduct(data, isUpdate = false) {
    const errors = [];

    if (!isUpdate) {
      if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
        errors.push('name is required and must be a non-empty string');
      }
      if (!data.sku || typeof data.sku !== 'string' || data.sku.trim() === '') {
        errors.push('sku is required and must be a non-empty string');
      }
    } else {
      if (data.name !== undefined && (typeof data.name !== 'string' || data.name.trim() === '')) {
        errors.push('name must be a non-empty string');
      }
      if (data.sku !== undefined && (typeof data.sku !== 'string' || data.sku.trim() === '')) {
        errors.push('sku must be a non-empty string');
      }
    }

    if (data.description !== undefined && data.description !== null && typeof data.description !== 'string') {
      errors.push('description must be a string');
    }

    if (data.category !== undefined) {
      if (!VALID_CATEGORIES.includes(data.category)) {
        errors.push(`category must be one of: ${VALID_CATEGORIES.join(', ')}`);
      }
    }

    if (data.price !== undefined) {
      if (typeof data.price !== 'number' || data.price <= 0 || !Number.isFinite(data.price)) {
        errors.push('price must be a positive number');
      } else if (Math.round(data.price * 100) !== data.price * 100) {
        errors.push('price must have up to 2 decimal places');
      }
    }

    if (data.stock !== undefined) {
      if (!Number.isInteger(data.stock) || data.stock < 0) {
        errors.push('stock must be a non-negative integer');
      }
    }

    if (data.status !== undefined) {
      if (!VALID_STATUSES.includes(data.status)) {
        errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);
      }
    }

    return errors;
  }

  /**
   * Returns all non-archived products with optional filtering.
   * Uses single-pass iteration with early-continue for efficiency.
   * Results sorted by createdAt descending (newest first).
   * @param {Object} [filters={}] - Query filters.
   * @param {string} [filters.category] - Filter by category (exact match).
   * @param {string} [filters.status] - Filter by status (exact match).
   * @param {number} [filters.minPrice] - Minimum price (inclusive).
   * @param {number} [filters.maxPrice] - Maximum price (inclusive).
   * @param {boolean} [filters.inStock] - If true: stock > 0; if false: stock === 0.
   * @param {string} [filters.search] - Case-insensitive substring match on name, SKU, or description.
   * @returns {Object[]} Array of product objects (archivedAt stripped by controller).
   * @throws Never throws; returns empty array if no matches.
   */
  findAll(filters = {}) {
    // Early exit: if no filters, return all non-archived directly
    const hasFilters = Object.keys(filters).some(
      k => filters[k] !== undefined && filters[k] !== ''
    );

    // Iterate values once, apply all filters in single pass
    const results = [];
    const { category, status, minPrice, maxPrice, inStock, search } = filters;
    const searchLower = search != null ? search.toLowerCase() : undefined;

    for (const product of this.byId.values()) {
      // Skip archived (soft-delete)
      if (product.archivedAt !== null) continue;

      // Category filter
      if (category && product.category !== category) continue;

      // Status filter
      if (status && product.status !== status) continue;

      // Price range filters
      if (minPrice !== undefined && product.price < minPrice) continue;
      if (maxPrice !== undefined && product.price > maxPrice) continue;

      // Stock filter
      if (inStock === true && product.stock <= 0) continue;
      if (inStock === false && product.stock > 0) continue;

      // Search filter (case-insensitive substring match)
      if (searchLower) {
        const haystack = `${product.name} ${product.sku} ${product.description || ''}`.toLowerCase();
        if (!haystack.includes(searchLower)) continue;
      }

      results.push(product);
    }

    // Sort by createdAt descending (newest first)
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return results;
  }

  /**
   * Finds a product by UUID.
   * @param {string} id - Product UUID.
   * @returns {Object|null} Product object if found and not archived; null otherwise.
   * @throws Never throws.
   */
  findById(id) {
    // O(1) direct Map lookup
    const product = this.byId.get(id);
    if (!product || product.archivedAt !== null) {
      return null;
    }
    return product;
  }

  /**
   * Finds a product by SKU.
   * @param {string} sku - Product SKU (trimmed).
   * @returns {Object|null} Product object if found and not archived; null otherwise.
   * @throws Never throws.
   */
  findBySku(sku) {
    // O(1) direct Map lookup
    const normalizedSku = sku != null && typeof sku.trim === 'function' ? sku.trim() : sku;
    const product = this.bySku.get(normalizedSku);
    if (!product || product.archivedAt !== null) {
      return null;
    }
    return product;
  }

  /**
   * Creates a new product with validation.
   * Enforces SKU uniqueness via secondary index.
   * Auto-generates UUID, createdAt, and sets archivedAt=null.
   * @param {Object} data - Product data.
   * @param {string} data.name - Product name (required, non-empty).
   * @param {string} data.sku - Unique SKU (required, non-empty).
   * @param {string} [data.description] - Optional description.
   * @param {string} [data.category='other'] - Category (defaults to 'other').
   * @param {number} data.price - Positive price, max 2 decimal places (required).
   * @param {number} [data.stock=0] - Non-negative integer (defaults to 0).
   * @param {string} [data.status='active'] - Status (defaults to 'active').
   * @returns {Object} Created product with id, createdAt, archivedAt=null.
   * @throws {Error} Validation failed (statusCode=400, errors array) if data invalid.
   * @throws {Error} SKU already exists (statusCode=409) if SKU not unique.
   */
  create(data) {
    const errors = this.validateProduct(data);
    if (errors.length > 0) {
      const error = new Error('Validation failed');
      error.errors = errors;
      error.statusCode = 400;
      throw error;
    }

    const sku = data.sku.trim();
    // O(1) SKU uniqueness check via secondary index
    if (this.bySku.has(sku)) {
      const error = new Error('SKU already exists');
      error.statusCode = 409;
      throw error;
    }

    const product = {
      id: uuidv4(),
      name: data.name.trim(),
      sku,
      description: data.description ? data.description.trim() : null,
      category: data.category || 'other',
      price: Number(data.price.toFixed(2)),
      stock: data.stock || 0,
      status: data.status || 'active',
      createdAt: new Date(),
      archivedAt: null
    };

    // Maintain both indexes
    this.byId.set(product.id, product);
    this.bySku.set(product.sku, product);

    return product;
  }

  /**
   * Updates an existing product with partial data.
   * Preserves id, createdAt, and archivedAt (cannot be modified).
   * If SKU changes, updates secondary index atomically.
   * @param {string} id - Product UUID.
   * @param {Object} patch - Fields to update (all optional).
   * @param {string} [patch.name] - New name.
   * @param {string} [patch.sku] - New SKU (must be unique if changed).
   * @param {string} [patch.description] - New description (null to clear).
   * @param {string} [patch.category] - New category.
   * @param {number} [patch.price] - New price.
   * @param {number} [patch.stock] - New stock.
   * @param {string} [patch.status] - New status.
   * @returns {Object|null} Updated product, or null if not found/archived.
   * @throws {Error} Validation failed (statusCode=400, errors array) if patch invalid.
   * @throws {Error} SKU already exists (statusCode=409) if new SKU conflicts.
   */
  update(id, patch) {
    // O(1) lookup
    const product = this.byId.get(id);
    if (!product || product.archivedAt !== null) {
      return null;
    }

    const errors = this.validateProduct(patch, true);
    if (errors.length > 0) {
      const error = new Error('Validation failed');
      error.errors = errors;
      error.statusCode = 400;
      throw error;
    }

    // Handle SKU change: update secondary index
    const newSku = patch.sku != null && typeof patch.sku.trim === 'function' ? patch.sku.trim() : undefined;
    if (newSku && newSku !== product.sku) {
      if (this.bySku.has(newSku)) {
        const error = new Error('SKU already exists');
        error.statusCode = 409;
        throw error;
      }
    }

    const updatedProduct = {
      ...product,
      name: patch.name !== undefined ? patch.name.trim() : product.name,
      sku: newSku !== undefined ? newSku : product.sku,
      description: patch.description !== undefined
        ? (patch.description ? patch.description.trim() : null)
        : product.description,
      category: patch.category !== undefined ? patch.category : product.category,
      price: patch.price !== undefined ? Number(patch.price.toFixed(2)) : product.price,
      stock: patch.stock !== undefined ? patch.stock : product.stock,
      status: patch.status !== undefined ? patch.status : product.status
    };

    // Maintain both indexes
    this.byId.set(id, updatedProduct);
    // If SKU changed, update secondary index atomically
    if (updatedProduct.sku !== product.sku) {
      this.bySku.delete(product.sku);
      this.bySku.set(updatedProduct.sku, updatedProduct);
    }

    return updatedProduct;
  }

  /**
   * Soft-archives a product (sets archivedAt timestamp).
   * Product is excluded from findAll/findById/findBySku but remains in storage.
   * SKU remains reserved in bySku index to prevent reuse.
   * @param {string} id - Product UUID.
   * @returns {boolean} True if archived; false if not found or already archived.
   * @throws Never throws.
   */
  delete(id) {
    // O(1) lookup
    const product = this.byId.get(id);
    if (!product || product.archivedAt !== null) {
      return false;
    }

    product.archivedAt = new Date();
    this.byId.set(id, product);
    // Keep in bySku for SKU uniqueness enforcement on restore/create
    // (archived products still reserve their SKU)

    return true;
  }

  /**
   * Restores a soft-archived product (clears archivedAt).
   * Product reappears in findAll/findById/findBySku.
   * @param {string} id - Product UUID.
   * @returns {boolean} True if restored; false if not found or not archived.
   * @throws Never throws.
   */
  restore(id) {
    // O(1) lookup
    const product = this.byId.get(id);
    if (!product || product.archivedAt === null) {
      return false;
    }

    product.archivedAt = null;
    this.byId.set(id, product);
    return true;
  }

  /**
   * Returns total product count including archived.
   * Useful for admin/debugging.
   * @returns {number} Total products in store.
   * @throws Never throws.
   */
  size() {
    return this.byId.size;
  }

  /**
   * Returns count of non-archived (active) products.
   * Useful for health checks and pagination.
   * @returns {number} Active product count.
   * @throws Never throws.
   */
  activeCount() {
    let count = 0;
    for (const p of this.byId.values()) {
      if (p.archivedAt === null) count++;
    }
    return count;
  }

  /**
   * Clears all products from both indexes.
   * Intended for test cleanup only.
   * @returns {void}
   * @throws Never throws.
   */
  clearAll() {
    this.byId.clear();
    this.bySku.clear();
  }
}

/**
 * Singleton product store instance.
 * @type {ProductStore}
 */
export const productStore = new ProductStore();