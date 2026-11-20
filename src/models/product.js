import { v4 as uuidv4 } from 'uuid';

const VALID_CATEGORIES = ['electronics', 'clothing', 'food', 'books', 'other'];
const VALID_STATUSES = ['active', 'inactive', 'discontinued'];

class ProductStore {
  constructor() {
    // Primary index: id -> product
    this.byId = new Map();
    // Secondary index: sku -> product (for O(1) SKU lookups)
    this.bySku = new Map();
  }

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
      // Skip archived
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

  findById(id) {
    // O(1) direct Map lookup
    const product = this.byId.get(id);
    if (!product || product.archivedAt !== null) {
      return null;
    }
    return product;
  }

  findBySku(sku) {
    // O(1) direct Map lookup
    const normalizedSku = sku != null && typeof sku.trim === 'function' ? sku.trim() : sku;
    const product = this.bySku.get(normalizedSku);
    if (!product || product.archivedAt !== null) {
      return null;
    }
    return product;
  }

  create(data) {
    const errors = this.validateProduct(data);
    if (errors.length > 0) {
      const error = new Error('Validation failed');
      error.errors = errors;
      error.statusCode = 400;
      throw error;
    }

    const sku = data.sku.trim();
    // O(1) SKU uniqueness check
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
    // If SKU changed, update secondary index
    if (updatedProduct.sku !== product.sku) {
      this.bySku.delete(product.sku);
      this.bySku.set(updatedProduct.sku, updatedProduct);
    }

    return updatedProduct;
  }

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

  // Utility: get total count (including archived) for admin/debug
  size() {
    return this.byId.size;
  }

  // Utility: get active count for health checks
  activeCount() {
    let count = 0;
    for (const p of this.byId.values()) {
      if (p.archivedAt === null) count++;
    }
    return count;
  }
}

export const productStore = new ProductStore();