# Authentication API with OTP, JWT, Email Queue and Rate Limiting

![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat&logo=nestjs&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat&logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?style=flat&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-black?style=flat&logo=JSON%20web%20tokens)
![License](https://img.shields.io/badge/license-MIT-green)

## Overview

This project is a backend API built with **NestJS** that implements a complete authentication system, including user registration with email verification, login with JWT, and a full password reset flow protected by OTP validation and rate limiting.

The goal of the project is to practice real-world backend concepts: authentication, authorization, asynchronous processing, email delivery, and protection against abuse.

---

## Features

### Authentication

- User registration with hashed passwords (bcrypt)
- Email verification via OTP (6-digit code)
- User login with email and password
- JWT token generation
- Protected routes using Guards

### Password Reset Flow

- Password reset request via email
- OTP generation and expiration control
- OTP verification
- Temporary JWT token for authorizing the password update
- Password update with hashing
- Confirmation email after a successful reset

### Email Processing

- Email verification OTP
- Password reset OTP
- Password reset confirmation email
- Asynchronous email delivery using BullMQ + Redis (emails are queued, not sent synchronously inside the request)

### Security

- JWT authentication with Passport
- Custom `ResetPasswordGuard` for the password reset step
- Password hashing with bcrypt
- OTP expiration control (10 minutes)
- OTP invalidated after use
- Rate limiting with `@nestjs/throttler` on login and password reset routes
- Soft delete pattern (`deletedAt`) instead of permanent deletion

---

## Architecture

```text
Client
 │
 ▼
Controller
 │
 ▼
Guard
 │
 ▼
Service
 │
 ▼
Prisma ORM
 │
 ▼
PostgreSQL
```

### Email flow (asynchronous)

```text
Service
 │
 ▼
BullMQ Queue (Producer)
 │
 ▼
Redis
 │
 ▼
Queue Processor (Worker)
 │
 ▼
Mail Service (Nodemailer)
 │
 ▼
SMTP Provider (Mailtrap)
 │
 ▼
User Email
```

---

## Project Structure

```text
src/
├── auth/              # Login, JWT strategy, guards, password reset flow
├── user/              # User registration, OTP verification, /me route
├── category/          # CRUD example with soft delete and self-relation
├── mail/              # Nodemailer service (SMTP integration)
├── mail-queue/        # BullMQ producer + processor for async emails
├── database/          # PrismaService (PostgreSQL connection)
└── main.ts            # Application entry point

prisma/
├── schema.prisma       # Data models, enums and relations
└── migrations/         # Database migration history
```

---

## Technologies Used

| Technology | Purpose |
|---|---|
| **NestJS** | Main backend framework — Controllers, Services, Guards, Modules, Dependency Injection |
| **Prisma ORM** | Database communication (create, read, update, delete) using TypeScript objects instead of raw SQL |
| **PostgreSQL** | Relational database |
| **JWT** | Stateless authentication and identity validation |
| **Passport / Passport-JWT** | Authentication middleware — extracts and validates the JWT from the `Authorization` header |
| **bcrypt** | Password hashing — never stores plain text passwords |
| **Nodemailer** | Sends OTP and confirmation emails via SMTP |
| **BullMQ** | Queue management — moves email sending to background jobs |
| **Redis** | In-memory store used by BullMQ to hold queues and pending jobs |
| **@nestjs/throttler** | Rate limiting — prevents brute force and spam |

---

## Guards

| Guard | Responsibility |
|---|---|
| `JwtAuthGuard` | Protects authenticated routes (e.g. `/user/me`) |
| `ResetPasswordGuard` | Validates the temporary JWT issued after OTP verification, authorizing the password update step |

---

## Password Reset Flow (step by step)

### Step 1 — Request reset

```
POST /auth/forgot-password
```

- Generates a 6-digit OTP
- Stores the OTP and its expiration date on the user
- Sends the OTP by email (via queue)

### Step 2 — Verify OTP

```
POST /auth/verify-reset-password-otp
```

- Validates the OTP against the stored value
- Validates that it has not expired
- Issues a short-lived JWT authorizing the next step

### Step 3 — Reset password

```
POST /auth/reset-password
```

- Validates the temporary JWT using `ResetPasswordGuard`
- Hashes the new password
- Updates the user record
- Clears the OTP fields
- Sends a confirmation email (via queue)

---

## Other Main Routes

| Method | Route | Description | Auth |
|---|---|---|---|
| POST | `/user/signup` | Register user, send verification OTP | No |
| POST | `/user/verify-otp` | Verify email with OTP | No |
| POST | `/auth/login` | Login, returns JWT | No |
| GET | `/user/me` | Returns logged-in user data | Yes (JWT) |
| GET / POST / PUT / DELETE | `/category` | Category CRUD with soft delete and self-relation (parent/children) | Yes (JWT) |

---

## How to Run

### Requirements

- Node.js 18+
- Docker (for PostgreSQL and Redis)

### Install dependencies

```bash
npm install
```

### Environment variables

Create a `.env` file at the project root:

```env
DATABASE_URL="postgresql://usuario:senha@localhost:5432/meubanco"
JWT_SECRET="your_secret_key"
MAIL_HOST="sandbox.smtp.mailtrap.io"
MAIL_PORT=2525
MAIL_USER="your_mailtrap_user"
MAIL_PASS="your_mailtrap_pass"
MAIL_FROM="no-reply@yourapp.com"
```

### Start PostgreSQL and Redis

```bash
docker run --name postgres -e POSTGRES_PASSWORD=senha -e POSTGRES_USER=usuario -e POSTGRES_DB=meubanco -p 5432:5432 -d postgres
docker run --name redis -p 6379:6379 -d redis
```

### Run migrations

```bash
npx prisma migrate dev
```

### Start the application

```bash
npm run start:dev
```

---

## Author

**Ariel Soares**

- GitHub: [@SoaresAriel088](https://github.com/SoaresAriel088)
- LinkedIn: [Ariel Soares](https://www.linkedin.com/in/ariel-soares)

Built as a backend study project during a Fullstack Development internship, applying real-world authentication, security, and asynchronous processing patterns with NestJS.
