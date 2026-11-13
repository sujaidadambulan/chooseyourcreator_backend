# Dr. Collab — Backend API

Standalone Express + Prisma + PostgreSQL backend service for the Dr. Collab influencer marketplace platform.

## Features & Tech Stack
- **Node.js + Express** with TypeScript
- **Prisma ORM** with PostgreSQL (Embedded Postgres for zero-config local development; supports Neon, Supabase, AWS RDS, Railway, Render Postgres in production)
- **Authentication**: JWT cookies (`httpOnly`, `sameSite: "none"`, `secure: true` in production) + `Authorization: Bearer <token>` fallback for cross-origin deployments
- **Payments**: Razorpay order creation, signature verification, and automated payouts/escrow
- **File Storage**: Local uploads (`/uploads`) + production cloud storage readiness
- **Agreements & Invoicing**: PDFKit agreement generation and digital signature workflows
- **OAuth**: Google, Instagram, YouTube, TikTok integration

## Environment Variables

Copy `.env.example` to `.env`:

```env
PORT=4000
NODE_ENV=development
API_ORIGIN=http://localhost:4000
CLIENT_ORIGIN=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173,https://your-frontend.vercel.app

DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/drcollab
JWT_SECRET=super-secret-jwt-key-min-32-chars
UPLOAD_DIR=./uploads

# Payment Gateway
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_ACCOUNT_NUMBER=

# Social OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
INSTAGRAM_CLIENT_ID=
INSTAGRAM_CLIENT_SECRET=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
```

## Running Locally

```bash
# Install dependencies
npm install

# Push database schema & generate client
npm run db:push

# Seed initial test data (Creators, Brands, Campaigns)
npm run db:seed

# Start development server (auto-reloads)
npm run dev

# Run tests
npm run test
```

## Production Deployment

### Recommended Platforms
- **Render** / **Railway** / **Fly.io** / **AWS ECS** / **DigitalOcean App Platform**

### Build & Start Commands
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Database Push**: `npm run db:push` (or run during build)
