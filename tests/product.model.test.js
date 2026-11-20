import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as productModel from '../src/models/product.js';

const { productStore } = productModel;

beforeEach(() => {
  // Reset store before each test
  productStore.byId.clear();
  productStore.bySku.clear();
});

describe('ProductStore', () => {
  describe('create', () => {
    test('creates a product with all fields', () => {
      const product = productStore.create({
        name: 'Test Product',
        sku: 'TEST-001',
        description: 'A test product',
        category: 'electronics',
        price: 99.99,
        stock: 10,
        status: 'active'
      });

      assert.equal(product.name, 'Test Product');
      assert.equal(product.sku, 'TEST-001');
      assert.equal(product.category, 'electronics');
      assert.equal(product.price, 99.99);
      assert.equal(product.stock, 10);
      assert.equal(product.status, 'active');
      assert.ok(product.id);
      assert.ok(product.createdAt);
      assert.equal(product.archivedAt, null);
    });

    test('creates product with defaults (category, status, stock)', () => {
      const product = productStore.create({
        name: 'Minimal Product',
        sku: 'MIN-001',
        price: 50
      });

      assert.equal(product.category, 'other');
      assert.equal(product.status, 'active');
      assert.equal(product.stock, 0);
      assert.equal(product.description, null);
    });

    test('throws on missing required fields', () => {
      assert.throws(
        () => productStore.create({ sku: 'TEST-001' }),
        { name: 'Error', message: 'Validation failed' }
      );
    });

    test('throws on empty name', () => {
      assert.throws(
        () => productStore.create({ name: '', sku: 'TEST-001', price: 10 }),
        { name: 'Error', message: 'Validation failed' }
      );
    });

    test('throws on invalid category', () => {
      assert.throws(
        () => productStore.create({ name: 'Test', sku: 'TEST-001', price: 10, category: 'invalid' }),
        { name: 'Error', message: 'Validation failed' }
      );
    });

    test('throws on invalid status', () => {
      assert.throws(
        () => productStore.create({ name: 'Test', sku: 'TEST-001', price: 10, status: 'invalid' }),
        { name: 'Error', message: 'Validation failed' }
      );
    });

    test('throws on non-positive price', () => {
      assert.throws(
        () => productStore.create({ name: 'Test', sku: 'TEST-001', price: 0 }),
        { name: 'Error', message: 'Validation failed' }
      );
      assert.throws(
        () => productStore.create({ name: 'Test', sku: 'TEST-001', price: -5 }),
        { name: 'Error', message: 'Validation failed' }
      );
    });

    test('accepts stock = 0 on create (out of stock is valid)', () => {
      const product = productStore.create({ name: 'Out of Stock', sku: 'OOS-001', price: 10, stock: 0 });
      assert.equal(product.stock, 0);
    });

    test('throws on price with more than 2 decimal places', () => {
      assert.throws(
        () => productStore.create({ name: 'Test', sku: 'TEST-001', price: 10.123 }),
        { name: 'Error', message: 'Validation failed' }
      );
    });

    test('throws on negative stock', () => {
      assert.throws(
        () => productStore.create({ name: 'Test', sku: 'TEST-001', price: 10, stock: -1 }),
        { name: 'Error', message: 'Validation failed' }
      );
    });

    test('throws on non-integer stock', () => {
      assert.throws(
        () => productStore.create({ name: 'Test', sku: 'TEST-001', price: 10, stock: 5.5 }),
        { name: 'Error', message: 'Validation failed' }
      );
    });

    test('throws on duplicate SKU', () => {
      productStore.create({ name: 'Product 1', sku: 'DUPLICATE', price: 10, stock: 5 });
      assert.throws(
        () => productStore.create({ name: 'Product 2', sku: 'DUPLICATE', price: 20, stock: 3 }),
        { name: 'Error', message: 'SKU already exists', statusCode: 409 }
      );
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      productStore.create({ name: 'Electronics 1', sku: 'ELEC-1', category: 'electronics', price: 100, stock: 5 });
      productStore.create({ name: 'Electronics 2', sku: 'ELEC-2', category: 'electronics', price: 200, stock: 0 });
      productStore.create({ name: 'Clothing 1', sku: 'CLOTH-1', category: 'clothing', price: 50, stock: 10 });
      productStore.create({ name: 'Book 1', sku: 'BOOK-1', category: 'books', price: 15, stock: 3 });
    });

    test('returns all non-archived products', () => {
      const products = productStore.findAll();
      assert.equal(products.length, 4);
    });

    test('filters by category', () => {
      const products = productStore.findAll({ category: 'electronics' });
      assert.equal(products.length, 2);
      assert.ok(products.every(p => p.category === 'electronics'));
    });

    test('filters by minPrice', () => {
      const products = productStore.findAll({ minPrice: 100 });
      assert.equal(products.length, 2);
      assert.ok(products.every(p => p.price >= 100));
    });

    test('filters by maxPrice', () => {
      const products = productStore.findAll({ maxPrice: 50 });
      assert.equal(products.length, 2);
      assert.ok(products.every(p => p.price <= 50));
    });

    test('filters by price range', () => {
      const products = productStore.findAll({ minPrice: 50, maxPrice: 150 });
      assert.equal(products.length, 2); // Electronics 1 ($100) and Clothing 1 ($50)
      assert.ok(products.every(p => p.price >= 50 && p.price <= 150));
    });

    test('filters by inStock=true', () => {
      const products = productStore.findAll({ inStock: true });
      assert.equal(products.length, 3);
      assert.ok(products.every(p => p.stock > 0));
    });

    test('filters by inStock=false', () => {
      const products = productStore.findAll({ inStock: false });
      assert.equal(products.length, 1);
      assert.ok(products.every(p => p.stock === 0));
    });

    test('filters by search term', () => {
      const products = productStore.findAll({ search: 'electronics' });
      assert.equal(products.length, 2);
    });

    test('filters by search term in description', () => {
      // Need a product with description
      productStore.create({ name: 'Test', sku: 'DESC-1', price: 10, description: 'special gadget' });
      const products = productStore.findAll({ search: 'gadget' });
      assert.equal(products.length, 1);
      assert.equal(products[0].sku, 'DESC-1');
    });

    test('filters by status', () => {
      productStore.create({ name: 'Active', sku: 'ACT-1', price: 10, status: 'active' });
      productStore.create({ name: 'Inactive', sku: 'INA-1', price: 10, status: 'inactive' });
      productStore.create({ name: 'Discontinued', sku: 'DIS-1', price: 10, status: 'discontinued' });

      const active = productStore.findAll({ status: 'active' });
      assert.equal(active.length, 5); // 4 from beforeEach + 1 new
      assert.ok(active.every(p => p.status === 'active'));

      const inactive = productStore.findAll({ status: 'inactive' });
      assert.equal(inactive.length, 1);
      assert.equal(inactive[0].sku, 'INA-1');
    });

    test('excludes archived products by default', () => {
      const product = productStore.findAll()[0];
      productStore.delete(product.id);
      const products = productStore.findAll();
      assert.equal(products.length, 3);
    });

    test('combines multiple filters', () => {
      const products = productStore.findAll({
        category: 'electronics',
        inStock: true,
        minPrice: 50
      });
      assert.equal(products.length, 1); // Electronics 1 ($100, stock 5)
      assert.equal(products[0].sku, 'ELEC-1');
    });

    test('gracefully ignores invalid filter values (model level - validation is at API layer)', () => {
      // Model doesn't validate - unknown category returns empty (no match)
      const products = productStore.findAll({ category: 'unknown' });
      assert.equal(products.length, 0);

      // Non-numeric minPrice is ignored (treated as undefined)
      const products2 = productStore.findAll({ minPrice: 'abc' });
      assert.equal(products2.length, 4); // all products returned

      // Non-numeric maxPrice is ignored
      const products3 = productStore.findAll({ maxPrice: 'xyz' });
      assert.equal(products3.length, 4); // all products returned
    });
  });

  describe('findById', () => {
    test('returns product by id', () => {
      const created = productStore.create({ name: 'Test', sku: 'TEST-1', price: 10, stock: 5 });
      const found = productStore.findById(created.id);
      assert.ok(found);
      assert.equal(found.id, created.id);
    });

    test('returns null for non-existent id', () => {
      const found = productStore.findById('non-existent-id');
      assert.equal(found, null);
    });

    test('returns null for archived product', () => {
      const created = productStore.create({ name: 'Test', sku: 'TEST-1', price: 10, stock: 5 });
      productStore.delete(created.id);
      const found = productStore.findById(created.id);
      assert.equal(found, null);
    });
  });

  describe('findBySku', () => {
    test('returns product by sku', () => {
      productStore.create({ name: 'Test', sku: 'SKU-123', price: 10, stock: 5 });
      const found = productStore.findBySku('SKU-123');
      assert.ok(found);
      assert.equal(found.sku, 'SKU-123');
    });

    test('returns null for archived product', () => {
      const created = productStore.create({ name: 'Test', sku: 'SKU-123', price: 10, stock: 5 });
      productStore.delete(created.id);
      const found = productStore.findBySku('SKU-123');
      assert.equal(found, null);
    });
  });

  describe('update', () => {
    test('updates product fields', () => {
      const created = productStore.create({ name: 'Original', sku: 'SKU-1', price: 10, stock: 5 });
      const updated = productStore.update(created.id, { name: 'Updated', price: 20 });
      assert.equal(updated.name, 'Updated');
      assert.equal(updated.price, 20);
      assert.equal(updated.sku, 'SKU-1'); // unchanged
    });

    test('updates SKU and maintains both indexes', () => {
      const created = productStore.create({ name: 'Original', sku: 'OLD-SKU', price: 10, stock: 5 });
      const updated = productStore.update(created.id, { sku: 'NEW-SKU' });

      assert.equal(updated.sku, 'NEW-SKU');
      assert.equal(productStore.findBySku('NEW-SKU'), updated);
      assert.equal(productStore.findBySku('OLD-SKU'), null);
      assert.equal(productStore.byId.get(created.id).sku, 'NEW-SKU');
    });

    test('returns null for non-existent id', () => {
      const updated = productStore.update('non-existent', { name: 'New' });
      assert.equal(updated, null);
    });

    test('returns null for archived product', () => {
      const created = productStore.create({ name: 'Test', sku: 'SKU-1', price: 10, stock: 5 });
      productStore.delete(created.id);
      const updated = productStore.update(created.id, { name: 'Updated' });
      assert.equal(updated, null);
    });

    test('throws on duplicate sku', () => {
      productStore.create({ name: 'Product 1', sku: 'SKU-1', price: 10, stock: 5 });
      const product2 = productStore.create({ name: 'Product 2', sku: 'SKU-2', price: 20, stock: 3 });
      assert.throws(
        () => productStore.update(product2.id, { sku: 'SKU-1' }),
        { name: 'Error', message: 'SKU already exists', statusCode: 409 }
      );
    });

    test('throws on invalid category', () => {
      const created = productStore.create({ name: 'Test', sku: 'SKU-1', price: 10 });
      assert.throws(
        () => productStore.update(created.id, { category: 'invalid' }),
        { name: 'Error', message: 'Validation failed' }
      );
    });

    test('throws on invalid status', () => {
      const created = productStore.create({ name: 'Test', sku: 'SKU-1', price: 10 });
      assert.throws(
        () => productStore.update(created.id, { status: 'invalid' }),
        { name: 'Error', message: 'Validation failed' }
      );
    });

    test('throws on non-positive price', () => {
      const created = productStore.create({ name: 'Test', sku: 'SKU-1', price: 10 });
      assert.throws(
        () => productStore.update(created.id, { price: 0 }),
        { name: 'Error', message: 'Validation failed' }
      );
    });

    test('throws on price with more than 2 decimal places', () => {
      const created = productStore.create({ name: 'Test', sku: 'SKU-1', price: 10 });
      assert.throws(
        () => productStore.update(created.id, { price: 10.123 }),
        { name: 'Error', message: 'Validation failed' }
      );
    });

    test('throws on negative stock', () => {
      const created = productStore.create({ name: 'Test', sku: 'SKU-1', price: 10 });
      assert.throws(
        () => productStore.update(created.id, { stock: -1 }),
        { name: 'Error', message: 'Validation failed' }
      );
    });

    test('throws on non-integer stock', () => {
      const created = productStore.create({ name: 'Test', sku: 'SKU-1', price: 10 });
      assert.throws(
        () => productStore.update(created.id, { stock: 5.5 }),
        { name: 'Error', message: 'Validation failed' }
      );
    });

    test('partial update preserves unchanged fields', () => {
      const created = productStore.create({
        name: 'Original',
        sku: 'SKU-1',
        price: 10,
        stock: 5,
        category: 'electronics',
        status: 'active',
        description: 'Original desc'
      });
      const updated = productStore.update(created.id, { name: 'Updated' });

      assert.equal(updated.name, 'Updated');
      assert.equal(updated.sku, 'SKU-1');
      assert.equal(updated.price, 10);
      assert.equal(updated.stock, 5);
      assert.equal(updated.category, 'electronics');
      assert.equal(updated.status, 'active');
      assert.equal(updated.description, 'Original desc');
    });

    test('ignores unknown fields in update patch', () => {
      const created = productStore.create({ name: 'Original', sku: 'SKU-1', price: 10, stock: 5 });
      const updated = productStore.update(created.id, { name: 'Updated', unknownField: 'ignored', anotherUnknown: 123 });

      assert.equal(updated.name, 'Updated');
      assert.equal(updated.unknownField, undefined);
      assert.equal(updated.anotherUnknown, undefined);
    });

    test('returns null when updating an archived product', () => {
      const created = productStore.create({ name: 'Test', sku: 'SKU-1', price: 10, stock: 5 });
      productStore.delete(created.id);
      const updated = productStore.update(created.id, { name: 'Updated' });
      assert.equal(updated, null);
    });
  });

  describe('delete (soft archive)', () => {
    test('archives product and sets archivedAt (soft delete)', () => {
      const created = productStore.create({ name: 'Test', sku: 'SKU-1', price: 10, stock: 5 });
      const deleted = productStore.delete(created.id);
      assert.equal(deleted, true);

      const product = productStore.byId.get(created.id);
      assert.ok(product.archivedAt instanceof Date);

      // Archive refactor: findAll excludes archived products
      const all = productStore.findAll();
      assert.equal(all.length, 0);
    });

    test('returns false for non-existent id', () => {
      const deleted = productStore.delete('non-existent');
      assert.equal(deleted, false);
    });

    test('returns false for already archived product', () => {
      const created = productStore.create({ name: 'Test', sku: 'SKU-1', price: 10, stock: 5 });
      productStore.delete(created.id);
      const deleted = productStore.delete(created.id);
      assert.equal(deleted, false);
    });

    test('excludes archived products from findAll', () => {
      const created = productStore.create({ name: 'Test', sku: 'SKU-1', price: 10, stock: 5 });
      productStore.delete(created.id);
      const products = productStore.findAll();
      assert.equal(products.length, 0);
    });
  });

  describe('restore', () => {
    test('restores archived product', () => {
      const created = productStore.create({ name: 'Test', sku: 'SKU-1', price: 10, stock: 5 });
      productStore.delete(created.id);
      const restored = productStore.restore(created.id);
      assert.equal(restored, true);

      const product = productStore.byId.get(created.id);
      assert.equal(product.archivedAt, null);
    });

    test('returns false for non-existent id', () => {
      const restored = productStore.restore('non-existent');
      assert.equal(restored, false);
    });

    test('returns false for non-archived product', () => {
      const created = productStore.create({ name: 'Test', sku: 'SKU-1', price: 10, stock: 5 });
      const restored = productStore.restore(created.id);
      assert.equal(restored, false);
    });

    test('includes restored product in findAll', () => {
      const created = productStore.create({ name: 'Test', sku: 'SKU-1', price: 10, stock: 5 });
      productStore.delete(created.id);
      productStore.restore(created.id);
      const products = productStore.findAll();
      assert.equal(products.length, 1);
    });

    test('restore on never-archived product returns false', () => {
      const created = productStore.create({ name: 'Test', sku: 'SKU-1', price: 10, stock: 5 });
      // Never delete it
      const restored = productStore.restore(created.id);
      assert.equal(restored, false);
    });
  });

  describe('utility methods', () => {
    test('size() returns total count including archived', () => {
      productStore.create({ name: 'P1', sku: 'SKU-1', price: 10 });
      productStore.create({ name: 'P2', sku: 'SKU-2', price: 20 });
      assert.equal(productStore.size(), 2);

      const p3 = productStore.create({ name: 'P3', sku: 'SKU-3', price: 30 });
      productStore.delete(p3.id);
      assert.equal(productStore.size(), 3); // includes archived
    });

    test('activeCount() returns only non-archived count', () => {
      productStore.create({ name: 'P1', sku: 'SKU-1', price: 10 });
      productStore.create({ name: 'P2', sku: 'SKU-2', price: 20 });
      assert.equal(productStore.activeCount(), 2);

      const p3 = productStore.create({ name: 'P3', sku: 'SKU-3', price: 30 });
      productStore.delete(p3.id);
      assert.equal(productStore.activeCount(), 2); // excludes archived

      productStore.restore(p3.id);
      assert.equal(productStore.activeCount(), 3);
    });

    test('size() and activeCount() are zero for empty store', () => {
      assert.equal(productStore.size(), 0);
      assert.equal(productStore.activeCount(), 0);
    });
  });
});