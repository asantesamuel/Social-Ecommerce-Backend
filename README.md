# E-Commerce Backend API

REST API for a multi-role e-commerce platform built with Node.js, Express,
TypeScript, TypeORM, and PostgreSQL.

## Main Features

- customer registration, authentication, catalog, cart, checkout, and orders
- vendor onboarding, verification documents, and product management
- admin moderation, inventory monitoring, orders, users, and analytics
- Paystack payments and refunds
- direct-to-S3 file uploads
- friendship and shared-cart features

## Requirements

- Node.js 20 or newer
- PostgreSQL installed locally
- pgAdmin 4
- Paystack and AWS credentials for payment/upload features
- Redis is optional for local development and tests; production requires a Redis-compatible service

pgAdmin is a graphical client for PostgreSQL. The PostgreSQL server must also
be installed and running; opening pgAdmin alone does not start the database.

## Local PostgreSQL Setup With pgAdmin 4

### 1. Connect to the local PostgreSQL server

In pgAdmin 4, register or open a server using the values selected during your
PostgreSQL installation:

```text
Host name/address: localhost
Port: 5432
Maintenance database: postgres
Username: postgres
Password: your local PostgreSQL password
```

If pgAdmin cannot connect, confirm that the PostgreSQL Windows service is
running and that `postgresql.conf` uses port `5432` and listens on localhost.

### 2. Create the databases

In pgAdmin, right-click **Databases**, select **Create > Database**, and create:

```text
ecommerce_db
ecommerce_test
```

`ecommerce_db` stores local development data. `ecommerce_test` is isolated
because the Jest setup truncates its tables when tests run.

You can also create them with the pgAdmin Query Tool while connected to the
`postgres` maintenance database:

```sql
CREATE DATABASE ecommerce_db;
CREATE DATABASE ecommerce_test;
```

### 3. Configure environment variables

Copy `.env.example` to `.env` and replace the password placeholders:

```env
NODE_ENV=development
DATABASE_URL=postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/ecommerce_db
DATABASE_URL_TEST=postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/ecommerce_test
```

The URL format is:

```text
postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE
```

URL-encode special characters in the username or password. For example, `@`
becomes `%40` and `#` becomes `%23`.

### 4. Verify the connection

```powershell
npm run db:check
```

This checks both configured databases and prints the connected database and
user without printing the password.

### 5. Install dependencies and generate API routes

```powershell
npm install
npm run build:routes
```

In local development, TypeORM synchronizes the registered entities with the
database when the API starts. Production environments must use migrations and
must not enable schema synchronization.

### 6. Start the API

```powershell
npm run dev
```

The API runs at `http://localhost:3000` and Swagger UI is available at
`http://localhost:3000/docs`.

Redis is not required for this local workflow when `REDIS_URL` is omitted.
Rate limiting and failed-login tracking use in-memory stores in development and
tests. Set `REDIS_URL` in `.env` if you want to use Redis locally.

## How Database Access Works

1. `src/server.ts` calls `AppDataSource.initialize()` before starting Express.
2. `src/config/database.ts` reads the PostgreSQL URL from `.env`.
3. TypeORM maps the classes in `src/entities` to PostgreSQL tables.
4. Service classes use TypeORM repositories, query builders, and transactions.
5. Startup stops immediately if PostgreSQL cannot be reached.

Development uses `DATABASE_URL`. Tests use `DATABASE_URL_TEST`. Both local
development modes synchronize entity metadata automatically; production uses
migrations.

## Useful Commands

```powershell
npm run dev
npm run build
npm run build:routes
npm run db:check
npm test
npm run test:coverage
npm run lint

# Seed customer, vendor, and admin accounts
$env:SEED_USER_PASSWORD='YourStrongSeedPassword123!'
npm run seed:users
```

The role seed command is idempotent for `customer@gmail.com`,
`vendor@gmail.com`, and `admin@gmail.com`. It updates those accounts to the
requested roles and creates the vendor profile when it is missing. Keep the
seed password in the shell or environment, not in source control.

Migration commands still exist for production migration work, but the current
local development database was originally created by TypeORM synchronization
and has not been baselined in the migrations table. Do not run the initial
migrations against that populated database without first creating a migration
baseline or using a fresh database.

## Important Environment Variables

- `DATABASE_URL`
- `DATABASE_URL_TEST` (tests/local development only)
- `REDIS_URL` (optional in development and tests; required in production)
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `PAYSTACK_SECRET_KEY`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `S3_BUCKET_PRODUCTS`
- `S3_BUCKET_DOCUMENTS`
- `CLOUDFRONT_DOMAIN`
- `FRONTEND_URLS` (comma-separated allowed frontend origins)
- `VENDOR_ONBOARDING_FEE`
- `TAX_RATE`

## Render Deployment

Render should use the following commands:

```text
Build Command: npm ci && npm run build
Start Command: npm start
```

The TypeScript build generates `dist/server.js`, `dist/app.js`, and copies the
generated `src/public/swagger.json` to `dist/public/swagger.json`, so Swagger
remains available at `/docs` after deployment.

Configure these values in Render without committing them to the repository:

```text
NODE_ENV=production
FRONTEND_URLS=https://frontend-one.vercel.app,https://frontend-two.vercel.app,https://frontend-three.vercel.app
DATABASE_URL=<Neon pooled PostgreSQL URL>
JWT_ACCESS_SECRET=<secret>
JWT_REFRESH_SECRET=<secret>
PAYSTACK_SECRET_KEY=<secret>
AWS_REGION=<region>
AWS_ACCESS_KEY_ID=<secret>
AWS_SECRET_ACCESS_KEY=<secret>
S3_BUCKET_PRODUCTS=<bucket>
S3_BUCKET_DOCUMENTS=<bucket>
CLOUDFRONT_DOMAIN=<CloudFront URL>
VENDOR_ONBOARDING_FEE=5000
TAX_RATE=0.15
REDIS_URL=<Render Redis or Key Value internal URL>
```

Render supplies `PORT`; it does not need to be configured manually.
`DATABASE_URL_TEST` is not normally required in production. The backend does
not require Neon/Vercel `PG*` or `POSTGRES_*` aliases, Stripe variables, or a
separate Paystack webhook secret. Paystack webhook signatures are verified with
`PAYSTACK_SECRET_KEY`.

## Troubleshooting

### `ECONNREFUSED 127.0.0.1:5432`

PostgreSQL is not listening on port `5432`. Start/restart the PostgreSQL
service and confirm its configured port.

### `password authentication failed`

The username/password in `DATABASE_URL` does not match the local PostgreSQL
role. Test the same credentials in pgAdmin and update `.env`.

### `database ecommerce_db does not exist`

Create `ecommerce_db` in pgAdmin, then run the migrations.

### `getaddrinfo ENOTFOUND`

Use `localhost` as the host for a locally installed PostgreSQL server.

### Redis connection errors

In development and tests, omit `REDIS_URL` to use the in-memory stores. In
production, configure the actual Redis-compatible service URL; the application
fails fast if `NODE_ENV=production` does not include `REDIS_URL`.

### PostgreSQL SSL warning

Neon may report a `pg-connection-string` warning about the future meaning of
`sslmode=require`. The existing connection succeeds and currently treats the
connection as fully verified. Do not weaken SSL verification or rewrite the
Neon URL solely because of this warning; revisit it alongside a deliberate
PostgreSQL driver upgrade.

### Tests connect to the wrong database

Ensure `DATABASE_URL_TEST` points to `ecommerce_test`, not `ecommerce_db`.
Tests intentionally clear their database tables.
