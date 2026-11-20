# Product Management API

A RESTful API for managing product catalogues with full CRUD operations, soft-archive (recoverable delete), filtering, search, and SKU uniqueness enforcement. Built with Express.js (ESM), featuring dual-index in-memory storage for O(1) lookups by ID and SKU.

---

## Prerequisites

- **Node.js** v20 or later
- **npm** v10 or later

---

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd product-management-api

# Install dependencies
npm install
```

---

## Running the Server

```bash
# Development (auto-reload on changes)
npm run dev

# Production
npm start
```

Server starts at **http://localhost:3000** (configurable via `PORT` env var).

---

## Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:coverage
```

> Requires Node.js 18+ for built-in test runner (`node:test`).

---

## API Endpoints

All responses follow the standard envelope: `{ "success": boolean, "data": any, "error": any }`.

| Method | Path | Description | Status Codes | Example curl |
|--------|------|-------------|--------------|--------------|
| GET | `/products` | List all products with optional filters | 200 | `curl "http://localhost:3000/products"` |
| GET | `/products/:id` | Get a single product by UUID | 200, 404 | `curl "http://localhost:3000/products/550e8400-e29b-41d4-a716-446655440000"` |
| POST | `/products` | Create a new product (rate limited: 30 req/min) | 201, 409, 422, 429 | `curl -X POST -H "Content-Type: application/json" -d '{"name":"Wireless Mouse","sku":"WM-001","description":"Ergonomic wireless mouse","category":"electronics","price":29.99,"stock":50,"status":"active"}' http://localhost:3000/products` |
| PATCH | `/products/:id` | Partially update a product (rate limited: 30 req/min) | 200, 404, 409, 422, 429 | `curl -X PATCH -H "Content-Type: application/json" -d '{"price":24.99,"stock":45}' http://localhost:3000/products/550e8400-e29b-41d4-a716-446655440000` |
| DELETE | `/products/:id` | Soft-archive a product (rate limited: 30 req/min) | 200, 404, 429 | `curl -X DELETE http://localhost:3000/products/550e8400-e29b-41d4-a716-446655440000` |
| DELETE | `/products/:id/restore` | Restore a soft-archived product (rate limited: 30 req/min) | 200, 404, 429 | `curl -X DELETE http://localhost:3000/products/550e8400-e29b-41d4-a716-446655440000/restore` |

---

## Query Parameters (GET /products)

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `category` | string | Filter by exact category match (`electronics`, `clothing`, `food`, `books`, `other`) | `?category=electronics` |
| `status` | string | Filter by exact status match (`active`, `inactive`, `discontinued`) | `?status=active` |
| `minPrice` | number | Minimum price (inclusive) | `?minPrice=10` |
| `maxPrice` | number | Maximum price (inclusive) | `?maxPrice=100` |
| `inStock` | string | `true` = stock > 0, `false` = stock = 0 (passed as string) | `?inStock=true` |
| `search` | string | Case-insensitive substring match on name, SKU, or description (max 100 chars) | `?search=wireless` |

**Combine multiple filters:** `?category=electronics&inStock=true&minPrice=50`

---

## Product Schema

### Request Fields (POST /products)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Product name (1–255 chars) |
| `sku` | string | Yes | Stock Keeping Unit (unique, 1–100 chars) |
| `description` | string | No | Optional description |
| `category` | string | No (default: `other`) | One of: `electronics`, `clothing`, `food`, `books`, `other` |
| `price` | number | Yes | Positive number, max 2 decimal places |
| `stock` | integer | No (default: `0`) | Non-negative integer |
| `status` | string | No (default: `active`) | One of: `active`, `inactive`, `discontinued` |

### Response Fields (all endpoints)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Unique identifier (v4 UUID) |
| `name` | string | Product name |
| `sku` | string | Stock Keeping Unit (unique) |
| `description` | string / null | Optional description |
| `category` | string | Product category |
| `price` | number | Price (positive, max 2 decimal places) |
| `stock` | integer | Available quantity |
| `status` | string | Product status |
| `createdAt` | string (ISO 8601) | Timestamp of creation |
| `archivedAt` | string (ISO 8601) / null | **Internal only** — set on soft-delete; **excluded from API responses** |

**Example API response (envelope format):**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Wireless Mouse",
    "sku": "WM-001",
    "description": "Ergonomic wireless mouse with USB receiver",
    "category": "electronics",
    "price": 29.99,
    "stock": 50,
    "status": "active",
    "createdAt": "2024-01-15T10:30:00.000Z"
  },
  "error": null
}
```

**Error response example:**
```json
{
  "success": false,
  "data": null,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "details": ["name is required", "price must be a positive number"]
  }
}
```

---

## Project Structure

```
product-management-api/
├── src/
│   ├── index.js                 # Entry point (starts server)
│   ├── app.js                   # Express app factory
│   ├── controllers/
│   │   └── productController.js # Request handlers
│   ├── middleware/
│   │   ├── catchAsync.js        # Async error wrapper
│   │   └── errorHandler.js      # Centralized error handling
│   ├── models/
│   │   └── product.js           # In-memory store (dual Map index)
│   ├── routes/
│   │   └── products.js          # Route definitions + rate limiting
│   └── validators/
│       └── productValidator.js  # express-validator schemas
├── tests/
│   ├── product.model.test.js    # Unit tests (node:test)
│   └── products.api.test.js     # Integration tests (supertest)
├── package.json
└── README.md
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | Runtime environment (`development`, `production`, `test`) |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for new functionality
4. Ensure all tests pass (`npm test`)
5. Commit with clear messages
6. Open a Pull Request

---

## License

MIT License — see [LICENSE](LICENSE) for details.