import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import createApp from '../src/app.js';

let app;
let request;
let seededProducts = [];

describe('Products API Integration Tests', () => {
  beforeEach(async () => {
    // Create fresh app instance for each test group
    app = createApp();
    request = supertest(app);

    // Reset the store by creating a new instance
    // Since productStore is a singleton, we need to clear it
    const { productStore } = await import('../src/models/product.js');
    productStore.byId.clear();
    productStore.bySku.clear();

    // Seed at least two products with different categories, prices, and stock levels
    const p1 = productStore.create({
      name: 'Wireless Headphones',
      sku: 'WH-001',
      description: 'Premium wireless headphones with noise cancellation',
      category: 'electronics',
      price: 299.99,
      stock: 15,
      status: 'active'
    });

    const p2 = productStore.create({
      name: 'Cotton T-Shirt',
      sku: 'CT-002',
      description: 'Comfortable cotton t-shirt in various colors',
      category: 'clothing',
      price: 19.99,
      stock: 100,
      status: 'active'
    });

    const p3 = productStore.create({
      name: 'Programming Book',
      sku: 'PB-003',
      description: 'Learn JavaScript from scratch',
      category: 'books',
      price: 39.99,
      stock: 0, // out of stock
      status: 'active'
    });

    seededProducts = [p1, p2, p3];
  });

  describe('GET /products', () => {
    test('returns 200 and an array', async () => {
      const res = await request.get('/products').expect(200);

      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.equal(res.body.data.length, 3);
    });

    test('returns only non-archived products', async () => {
      // Archive one product
      const { productStore } = await import('../src/models/product.js');
      productStore.delete(seededProducts[0].id);

      const res = await request.get('/products').expect(200);

      assert.equal(res.body.data.length, 2);
      assert.ok(res.body.data.every(p => p.archivedAt === undefined));
    });

    test('?category=electronics returns only matching products', async () => {
      const res = await request.get('/products?category=electronics').expect(200);

      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].category, 'electronics');
      assert.equal(res.body.data[0].sku, 'WH-001');
    });

    test('?minPrice and ?maxPrice filter correctly', async () => {
      // Test minPrice
      const resMin = await request.get('/products?minPrice=100').expect(200);
      assert.equal(resMin.body.data.length, 1);
      assert.ok(resMin.body.data.every(p => p.price >= 100));

      // Test maxPrice
      const resMax = await request.get('/products?maxPrice=50').expect(200);
      assert.equal(resMax.body.data.length, 2);
      assert.ok(resMax.body.data.every(p => p.price <= 50));

      // Test range
      const resRange = await request.get('/products?minPrice=20&maxPrice=300').expect(200);
      assert.equal(resRange.body.data.length, 2); // electronics $299.99 and books $39.99
      assert.ok(resRange.body.data.every(p => p.price >= 20 && p.price <= 300));
    });

    test('?inStock=true returns products with stock > 0', async () => {
      const res = await request.get('/products?inStock=true').expect(200);

      assert.equal(res.body.data.length, 2);
      assert.ok(res.body.data.every(p => p.stock > 0));
      assert.ok(res.body.data.some(p => p.sku === 'WH-001'));
      assert.ok(res.body.data.some(p => p.sku === 'CT-002'));
    });

    test('?inStock=false returns products with stock = 0', async () => {
      const res = await request.get('/products?inStock=false').expect(200);

      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].stock, 0);
      assert.equal(res.body.data[0].sku, 'PB-003');
    });

    test('?search=<term> matches on name and description', async () => {
      // Search by name
      const resName = await request.get('/products?search=headphones').expect(200);
      assert.equal(resName.body.data.length, 1);
      assert.equal(resName.body.data[0].sku, 'WH-001');

      // Search by description
      const resDesc = await request.get('/products?search=cotton').expect(200);
      assert.equal(resDesc.body.data.length, 1);
      assert.equal(resDesc.body.data[0].sku, 'CT-002');

      // Search partial match
      const resPartial = await request.get('/products?search=wireless').expect(200);
      assert.equal(resPartial.body.data.length, 1);
      assert.equal(resPartial.body.data[0].sku, 'WH-001');
    });

    test('returns empty array when no products match', async () => {
      const res = await request.get('/products?category=food').expect(200);
      assert.equal(res.body.data.length, 0);
    });

    test('combines multiple filters', async () => {
      const res = await request
        .get('/products?category=electronics&inStock=true&minPrice=200')
        .expect(200);

      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].sku, 'WH-001');
    });

    test('returns 422 for non-numeric minPrice', async () => {
      const res = await request
        .get('/products?minPrice=abc')
        .expect(422);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    test('returns 422 for unknown category (not in enum)', async () => {
      const res = await request
        .get('/products?category=unknown')
        .expect(422);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });
  });

  describe('GET /products/:id', () => {
    test('returns 200 with the correct product', async () => {
      const res = await request
        .get(`/products/${seededProducts[0].id}`)
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.id, seededProducts[0].id);
      assert.equal(res.body.data.sku, 'WH-001');
      assert.equal(res.body.data.name, 'Wireless Headphones');
      assert.ok(res.body.data.createdAt);
      assert.equal(res.body.data.archivedAt, undefined); // stripped by sanitizeProduct
    });

    test('returns 404 for an unknown id', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request.get(`/products/${fakeId}`).expect(404);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    test('returns 404 for an archived product id', async () => {
      const { productStore } = await import('../src/models/product.js');
      productStore.delete(seededProducts[1].id);

      const res = await request.get(`/products/${seededProducts[1].id}`).expect(404);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });
  });

  describe('POST /products', () => {
    test('returns 201 with the created product including id and createdAt', async () => {
      const newProduct = {
        name: 'New Gadget',
        sku: 'NG-004',
        description: 'A brand new gadget',
        category: 'electronics',
        price: 149.99,
        stock: 25
      };

      const res = await request
        .post('/products')
        .send(newProduct)
        .expect(201);

      assert.equal(res.body.success, true);
      assert.ok(res.body.data.id);
      assert.ok(res.body.data.createdAt);
      assert.equal(res.body.data.name, 'New Gadget');
      assert.equal(res.body.data.sku, 'NG-004');
      assert.equal(res.body.data.price, 149.99);
      assert.equal(res.body.data.status, 'active'); // default
      assert.equal(res.body.data.archivedAt, undefined); // stripped
    });

    test('returns 422 when name is missing', async () => {
      const res = await request
        .post('/products')
        .send({ sku: 'TEST-001', price: 10 })
        .expect(422);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.ok(res.body.error.details.some(d => d.includes('name')));
    });

    test('returns 422 when sku format is invalid', async () => {
      const res = await request
        .post('/products')
        .send({ name: 'Test', sku: '', price: 10 })
        .expect(422);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    test('returns 422 when price is negative', async () => {
      const res = await request
        .post('/products')
        .send({ name: 'Test', sku: 'TEST-001', price: -5 })
        .expect(422);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.ok(res.body.error.details.some(d => d.includes('price')));
    });

    test('returns 422 when price is zero', async () => {
      const res = await request
        .post('/products')
        .send({ name: 'Test', sku: 'TEST-001', price: 0 })
        .expect(422);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    test('returns 409 when sku already exists', async () => {
      // Try to create with existing SKU
      const res = await request
        .post('/products')
        .send({ name: 'Duplicate', sku: 'WH-001', price: 10 })
        .expect(409);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'CONFLICT');
    });

    test('returns 422 when category is invalid', async () => {
      const res = await request
        .post('/products')
        .send({ name: 'Test', sku: 'TEST-001', price: 10, category: 'invalid' })
        .expect(422);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    test('returns 422 when stock is negative', async () => {
      const res = await request
        .post('/products')
        .send({ name: 'Test', sku: 'TEST-001', price: 10, stock: -1 })
        .expect(422);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    test('accepts stock = 0 on POST (out of stock is valid)', async () => {
      const res = await request
        .post('/products')
        .send({ name: 'Out of Stock Item', sku: 'OOS-001', price: 10, stock: 0 })
        .expect(201);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.stock, 0);
    });

    test('rejects price = 0 on POST (must be positive)', async () => {
      const res = await request
        .post('/products')
        .send({ name: 'Test', sku: 'TEST-001', price: 0, stock: 10 })
        .expect(422);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    test('handles concurrent POSTs with same SKU - only one succeeds', async () => {
      const productData = { name: 'Concurrent Test', sku: 'CONCURRENT-001', price: 10, stock: 5 };

      // Fire two concurrent requests
      const [res1, res2] = await Promise.all([
        request.post('/products').send(productData),
        request.post('/products').send(productData)
      ]);

      // One should succeed (201), one should fail (409)
      const statuses = [res1.status, res2.status].sort();
      assert.deepEqual(statuses, [201, 409]);

      // Verify only one product exists with that SKU
      const listRes = await request.get('/products?search=CONCURRENT-001').expect(200);
      assert.equal(listRes.body.data.length, 1);
    });
  });

  describe('PATCH /products/:id', () => {
    test('returns 200 with only the patched fields changed', async () => {
      const res = await request
        .patch(`/products/${seededProducts[0].id}`)
        .send({ name: 'Updated Headphones', price: 249.99 })
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.name, 'Updated Headphones');
      assert.equal(res.body.data.price, 249.99);
      // Unchanged fields preserved
      assert.equal(res.body.data.sku, 'WH-001');
      assert.equal(res.body.data.category, 'electronics');
      assert.equal(res.body.data.stock, 15);
      assert.equal(res.body.data.id, seededProducts[0].id);
      assert.equal(res.body.data.createdAt, seededProducts[0].createdAt.toISOString());
    });

    test('returns 404 for an unknown id', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request
        .patch(`/products/${fakeId}`)
        .send({ name: 'Updated' })
        .expect(404);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    test('returns 404 for an archived product id', async () => {
      const { productStore } = await import('../src/models/product.js');
      productStore.delete(seededProducts[0].id);

      const res = await request
        .patch(`/products/${seededProducts[0].id}`)
        .send({ name: 'Updated' })
        .expect(404);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    test('returns 422 when body is empty', async () => {
      const res = await request
        .patch(`/products/${seededProducts[0].id}`)
        .send({})
        .expect(200); // Empty body is valid (no changes)

      // Empty body should return the product unchanged
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.name, 'Wireless Headphones');
    });

    test('does not allow updating id', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request
        .patch(`/products/${seededProducts[0].id}`)
        .send({ id: fakeId })
        .expect(200);

      // ID should remain unchanged
      assert.equal(res.body.data.id, seededProducts[0].id);
      assert.notEqual(res.body.data.id, fakeId);
    });

    test('does not allow updating createdAt', async () => {
      const newDate = '2020-01-01T00:00:00.000Z';
      const res = await request
        .patch(`/products/${seededProducts[0].id}`)
        .send({ createdAt: newDate })
        .expect(200);

      // createdAt should remain unchanged
      assert.equal(res.body.data.createdAt, seededProducts[0].createdAt.toISOString());
      assert.notEqual(res.body.data.createdAt, newDate);
    });

    test('allows updating sku to a new unique value', async () => {
      const res = await request
        .patch(`/products/${seededProducts[0].id}`)
        .send({ sku: 'WH-001-NEW' })
        .expect(200);

      assert.equal(res.body.data.sku, 'WH-001-NEW');
    });

    test('returns 409 when updating sku to existing value', async () => {
      const res = await request
        .patch(`/products/${seededProducts[0].id}`)
        .send({ sku: 'CT-002' }) // Existing SKU
        .expect(409);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'CONFLICT');
    });

    test('returns 422 when updating with invalid price', async () => {
      const res = await request
        .patch(`/products/${seededProducts[0].id}`)
        .send({ price: -10 })
        .expect(422);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    test('strips unknown fields from PATCH body', async () => {
      const res = await request
        .patch(`/products/${seededProducts[0].id}`)
        .send({ name: 'Updated', unknownField: 'should be ignored', anotherUnknown: 123 })
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.name, 'Updated');
      assert.equal(res.body.data.unknownField, undefined);
      assert.equal(res.body.data.anotherUnknown, undefined);
    });

    test('returns 404 when PATCH on an archived product', async () => {
      const { productStore } = await import('../src/models/product.js');
      productStore.delete(seededProducts[0].id);

      const res = await request
        .patch(`/products/${seededProducts[0].id}`)
        .send({ name: 'Updated' })
        .expect(404);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });
  });

  describe('DELETE /products/:id', () => {
    test('returns 200 (archive)', async () => {
      const res = await request
        .delete(`/products/${seededProducts[0].id}`)
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.message, 'Product archived successfully');
    });

    test('subsequent GET /products/:id returns 404', async () => {
      await request.delete(`/products/${seededProducts[0].id}`).expect(200);

      const res = await request.get(`/products/${seededProducts[0].id}`).expect(404);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    test('archived product excluded from GET /products', async () => {
      await request.delete(`/products/${seededProducts[0].id}`).expect(200);

      const res = await request.get('/products').expect(200);
      assert.equal(res.body.data.length, 2);
      assert.ok(!res.body.data.some(p => p.id === seededProducts[0].id));
    });

    test('returns 404 for unknown id', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request.delete(`/products/${fakeId}`).expect(404);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    test('returns 404 for already archived product', async () => {
      await request.delete(`/products/${seededProducts[0].id}`).expect(200);

      const res = await request.delete(`/products/${seededProducts[0].id}`).expect(404);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });
  });

  describe('DELETE /products/:id/restore', () => {
    test('returns 200 and product reappears in GET /products', async () => {
      // First archive
      await request.delete(`/products/${seededProducts[0].id}`).expect(200);

      // Then restore
      const res = await request
        .delete(`/products/${seededProducts[0].id}/restore`)
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.message, 'Product restored successfully');

      // Verify it reappears in GET /products
      const listRes = await request.get('/products').expect(200);
      assert.equal(listRes.body.data.length, 3);
      assert.ok(listRes.body.data.some(p => p.id === seededProducts[0].id));
    });

    test('restored product accessible via GET /products/:id', async () => {
      await request.delete(`/products/${seededProducts[0].id}`).expect(200);
      await request.delete(`/products/${seededProducts[0].id}/restore`).expect(200);

      const res = await request.get(`/products/${seededProducts[0].id}`).expect(200);
      assert.equal(res.body.data.id, seededProducts[0].id);
    });

    test('returns 404 for unknown id', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request.delete(`/products/${fakeId}/restore`).expect(404);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    test('returns 404 for non-archived product', async () => {
      const res = await request
        .delete(`/products/${seededProducts[0].id}/restore`)
        .expect(404);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    test('returns 404 when restoring a product that was never archived', async () => {
      // Create a new product that was never archived
      const { productStore } = await import('../src/models/product.js');
      const newProduct = productStore.create({
        name: 'Never Archived',
        sku: 'NA-001',
        price: 10,
        stock: 5
      });

      const res = await request
        .delete(`/products/${newProduct.id}/restore`)
        .expect(404);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });
  });
});