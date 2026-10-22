# Piku Chat Backend

Real-time messaging backend built with Node.js, Express, Socket.io, and MongoDB Atlas.

## Tech Stack

- **Node.js** + **Express.js**
- **Socket.io** (WebSocket) with optional Redis adapter
- **MongoDB Atlas** (Mongoose ODM)
- **Passport.js** (Google OAuth)
- **JWT** for authentication
- **Cloudinary** for file uploads (all formats, max 15MB)
- **node-cron** for 30-day message retention
- **Winston** for logging
- **Zod** for validation
- **Helmet.js** + **CORS** for security

## Features

- Google OAuth sign-in with JWT
- Real-time 1-on-1 messaging via Socket.io
- File sharing (all formats, 15MB max)
- Message edit/delete (within 24h)
- Read receipts & typing indicators
- 30-day auto message cleanup (protected users exempt)
- Admin dashboard: user management, chat viewer, banned keywords, safety audit
- Cursor-based message pagination

## Getting Started

```bash
npm install
npm run dev
```

Server runs on `http://localhost:5000`

## Environment Variables

Create `.env` file:

```
PORT=5000
MONGODB_URI=mongodb+srv://...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
CLIENT_URL=http://localhost:3000
JWT_SECRET=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
REDIS_URL=
```

## API Routes

- `GET /api/health` — Health check
- `GET /api/auth/google` — Google OAuth
- `GET /api/auth/me` — Current user
- `GET /api/users/search?query=` — Search users
- `PATCH /api/users/profile` — Update profile
- `GET /api/chats` — User's chats
- `POST /api/chats` — Create chat
- `GET /api/chats/:chatId/messages` — Paginated messages
- `POST /api/messages` — Send message
- `PATCH /api/messages/:id` — Edit message
- `DELETE /api/messages/:id` — Delete message
- `POST /api/upload` — Upload file
- `GET /api/admin/*` — Admin endpoints
