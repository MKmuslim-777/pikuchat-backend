# Real-Time Messaging Web Application — Full Project Specification & Report

---

## Part 1: Lightweight Landing Page Content

This section provides the minimal, sleek text content for the public-facing landing page of the application.

### Hero Section
* **Headline:** Connect Simply, Instantly, and Securely.
* **Sub-headline:** A fast, clutter-free private messaging app built for real-time connection. Search users, chat seamlessly, and share images with total privacy.
* **Call to Action (CTA):** `[ Continue with Google ]`

---

### Core Highlights (Feature Grid)

#### 1. Instant Google Sign-In
No complex passwords to remember. Get started with a single click using your Google Account.

#### 2. Direct 1-on-1 Chat
Find anyone instantly by searching their unique **Username**. Clean, private, and distraction-free messaging.

#### 3. Image Sharing Made Easy
Share moments, pictures, and screenshots directly inside your chats with auto-optimized image delivery.

#### 4. Smart Retention Policy
To keep things fast and safe, general chats are automatically cleaned up after **30 days**. Protected and elite conversations stay forever.

#### 5. Safety & Moderation Built-In
Integrated administrative control ensures a safe environment with automated keyword scanning and account protections.

---

### Footer Section
* **Links:** Terms of Service | Privacy Policy | Help & Support
* **Tagline:** Minimalist Messaging for the Modern Web.

---

## Part 2: Comprehensive Technical Architecture & Report

### 1. Executive Summary
This document outlines the full specifications for a lightweight, modern, real-time 1-on-1 messaging platform. The platform uses Next.js and Node.js with Socket.io for real-time communication, MongoDB for data management, and Cloudinary for media handling. It incorporates an automated 30-day message cleanup policy while keeping protected/elite account chats intact, alongside a manual, on-demand safety audit for Super Admins.

---

### 2. Tech Stack & Technologies
* **Frontend:** Next.js (React Framework) with Tailwind CSS & DaisyUI
* **Backend:** Node.js with Express.js
* **Real-time Server:** Socket.io (WebSocket Protocol)
* **Database:** MongoDB Atlas (Mongoose ODM)
* **Authentication:** NextAuth.js (**Google Sign-In Only**)
* **Media Storage:** Cloudinary (**All file formats**, max 15MB, with compression)
* **Scheduler:** `node-cron` for automated data retention
* **Scalability:** Socket.io Redis Adapter (`@socket.io/redis-adapter`) for multi-instance support
* **Validation:** Zod for request body & input validation
* **Security:** Helmet.js, CORS, input sanitization
* **Logging:** Winston for structured logging
* **Testing:** Jest + Supertest

---

### 3. User Roles & Permission Hierarchy

| Role | Permissions & Capabilities | Data Retention Policy |
| :--- | :--- | :--- |
| **Regular User** (`user`) | Login via Google, search by Username, send text & images, view online/typing status. | Messages auto-deleted after **30 days**. |
| **Elite User** (`elite_user`) | All Regular User features + special protection flag (`isProtectedFromDeletion: true`). | Messages **never** auto-deleted. |
| **Super Admin** (`super_admin`) | Full admin dashboard, view all chats/media, block/mute/delete users, manage banned keywords, run safety audit scans. | Messages **never** auto-deleted. |

---

### 4. Color Palette & UI Design System

* **Light Mode:**
  * Background: `#F8FAFC` (Off-white / Slate 50)
  * Primary Accent: `#3B82F6` (Royal Blue)
  * Incoming Bubble: `#E2E8F0` (Slate 200)
  * Outgoing Bubble: `#3B82F6` (White text)
  * Text Color: `#1E293B` (Slate 800)

* **Dark Mode:**
  * Background: `#0F172A` (Slate 900 / Deep Charcoal)
  * Card / Sidebar: `#1E293B` (Slate 800 with Glassmorphism)
  * Primary Accent: `#6366F1` (Vibrant Indigo)
  * Incoming Bubble: `#334155` (Slate 700)
  * Outgoing Bubble: `#4F46E5` (Indigo 600)
  * Text Color: `#F8FAFC` (Slate 50)

* **Admin Accent:** `#EF4444` / `#DC2626` (Red for alerts, blocks, and audits)

---

### 5. MongoDB Database Schemas

#### 5.1 User Collection (`users`)
```javascript
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true, lowercase: true },
  photoURL: { type: String },
  role: { 
    type: String, 
    enum: ['user', 'elite_user', 'super_admin'], 
    default: 'user' 
  },
  isProtectedFromDeletion: { type: Boolean, default: false },
  status: {
    isBlocked: { type: Boolean, default: false },
    blockReason: { type: String, default: '' },
    isMuted: { type: Boolean, default: false },
    mutedUntil: { type: Date, default: null }
  },
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now }
}, { timestamps: true });
```

#### 5.2 Chat Collection (`chats`)
```javascript
const chatSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lastMessage: {
    text: String,
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date, default: Date.now }
  }
}, { timestamps: true });
```

#### 5.3 Message Collection (`messages`)
```javascript
const messageSchema = new mongoose.Schema({
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, default: '' },
  fileUrl: { type: String, default: null },
  fileType: { type: String, default: null, enum: [null, 'image', 'video', 'audio', 'document', 'other'] },
  isEdited: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  isSeen: { type: Boolean, default: false }
}, { timestamps: true });
```

#### 5.4 Banned Keyword Collection (`banned_keywords`)
```javascript
const bannedKeywordSchema = new mongoose.Schema({
  word: { type: String, required: true, unique: true, lowercase: true, trim: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
```

---

### 6. Automated Data Retention & Safety Audit Logic

#### 6.1 Data Retention Cron Job (30-Day Auto Cleanup)
Executes daily at 02:00 AM UTC. It checks message age and deletes old data unless sent/received by protected accounts (e.g., `super_admin` or `mkRafu` / `elite_user`).

```javascript
const cron = require('node-cron');
const Message = require('./models/Message');
const User = require('./models/User');

cron.schedule('0 2 * * *', async () => {
  try {
    const oneMonthAgo = new Date();
    oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);

    const protectedUsers = await User.find({
      $or: [
        { role: 'super_admin' },
        { role: 'elite_user' },
        { isProtectedFromDeletion: true }
      ]
    }).select('_id');

    const protectedIds = protectedUsers.map(u => u._id);

    const result = await Message.deleteMany({
      createdAt: { $lt: oneMonthAgo },
      senderId: { $nin: protectedIds },
      receiverId: { $nin: protectedIds }
    });

    console.log(`[Cron Cleanup] Deleted ${result.deletedCount} messages older than 30 days.`);
  } catch (error) {
    console.error('[Cron Cleanup Error]:', error);
  }
});
```

#### 6.2 On-Demand Keyword Safety Audit
To keep messaging zero-latency, real-time message text isn't parsed on every socket event. Instead:
1. Super Admin dynamically manages words in `banned_keywords`.
2. Admin clicks **"Run Safety Audit Scan"** in the dashboard.
3. Backend scans messages and generates an interactive report listing sender, receiver, matched keyword, and direct action buttons (`Mute`, `Block`, `Delete`).

---

### 7. Socket.io Event Lifecycle

* `connection` — Client connects with auth token.
* `user_online` — Broadcasts real-time online status.
* `send_message` — Emits text/image payload to server.
* `receive_message` — Server forwards message instantly to receiver.
* `typing_start` / `typing_stop` — Toggles "Typing..." UI prompt.
* `account_status_changed` — Server forces socket disconnect if Super Admin blocks/mutes a user.
* `message_delivered` — Receiver's client acknowledges message receipt.
* `message_read` — Receiver reads message, updates `isSeen` status.
* `message_deleted` — User deletes their own message, server notifies both parties.
* `message_edited` — User edits their own message, server broadcasts update.

---

## 8. REST API Endpoints

### 8.1 Authentication
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/auth/google` | Google OAuth login redirect |
| `GET` | `/api/auth/google/callback` | Google OAuth callback |
| `POST` | `/api/auth/logout` | Logout & destroy session |
| `GET` | `/api/auth/me` | Get current authenticated user |

### 8.2 Users
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/users/search?query=` | Search users by username |
| `GET` | `/api/users/:id` | Get user profile |
| `PATCH` | `/api/users/profile` | Update own profile (name, username, photoURL) |

### 8.3 Chats
| Method | Endpoint | Description |
| :--- | :--- |
| `GET` | `/api/chats` | Get all chats for current user |
| `POST` | `/api/chats` | Create or get existing 1-on-1 chat |
| `GET` | `/api/chats/:chatId/messages?cursor=` | Get paginated messages (cursor-based, 50 per page) |

### 8.4 Messages
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/messages` | Send text message (REST fallback) |
| `PATCH` | `/api/messages/:id` | Edit own message |
| `DELETE` | `/api/messages/:id` | Delete own message |

### 8.5 Upload
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/upload` | Upload file to Cloudinary (all formats, max 15MB) |

### 8.6 Admin
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/admin/users` | List all users with filters |
| `PATCH` | `/api/admin/users/:id/block` | Block user |
| `PATCH` | `/api/admin/users/:id/unblock` | Unblock user |
| `PATCH` | `/api/admin/users/:id/mute` | Mute user |
| `GET` | `/api/admin/chats` | View all chats |
| `POST` | `/api/admin/keywords` | Add banned keyword |
| `DELETE` | `/api/admin/keywords/:id` | Remove banned keyword |
| `GET` | `/api/admin/keywords` | List all banned keywords |
| `POST` | `/api/admin/audit` | Run safety audit scan |

---

## 9. Authentication & Session Flow

### 9.1 NextAuth.js with Google Provider
* Frontend uses `next-auth` with Google OAuth provider
* On successful Google login, backend upserts user in MongoDB Atlas
* JWT token is returned to the client via httpOnly cookie
* Socket.io connections validate JWT via middleware on `connection`

### 9.2 Socket.io Authentication Middleware
```javascript
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = payload.userId;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});
```

---

## 10. Message Status & Delivery Flow

* **sent** — Server received the message and stored it in MongoDB
* **delivered** — Receiver's client received the socket event
* **read** — Receiver opened the chat or message came into viewport

Socket events for status:
* `message_delivered` — Receiver client emits this on `receive_message`
* `message_read` — Receiver emits this when chat is opened or message is visible

---

## 11. Offline Message Handling

* Messages are always stored in MongoDB regardless of receiver online status
* When user comes online, client fetches missed messages via REST API (`GET /api/chats/:chatId/messages?cursor=`)
* Socket emits `user_online` which triggers a sync of unseen messages count
* Unread badge count is calculated from `isSeen: false` messages

---

## 12. File Upload Flow

1. Client selects file (any format — images, PDFs, documents, etc.)
2. Client validates file size (max 15MB) before upload
3. Client sends `multipart/form-data` to `POST /api/upload`
4. Backend uploads to Cloudinary with auto-compression for images
5. Cloudinary returns optimized URL
6. Backend sends URL back to client
7. Client sends message with `fileUrl` via Socket.io or REST
8. Message schema `imageUrl` field renamed to `fileUrl` for all formats

---

## 13. Pagination Strategy

* **Messages:** Cursor-based pagination using `createdAt` + `_id` as compound cursor
  * `GET /api/chats/:chatId/messages?cursor=2024-01-15T10:30:00.000Z_64a2b1c3d4e5f6`
  * Returns 50 messages per page with `nextCursor` for next batch
  * Client implements infinite scroll loading older messages on scroll-up
* **Chat List:** Offset-based pagination (20 per page)
* **Admin User List:** Offset-based pagination with filters (role, status, search)

---

## 14. Database Indexes

```javascript
// users
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ role: 1 });

// chats
chatSchema.index({ participants: 1 });
chatSchema.index({ 'lastMessage.updatedAt': -1 });

// messages
messageSchema.index({ chatId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1 });
messageSchema.index({ receiverId: 1, isSeen: 1 });

// banned_keywords
bannedKeywordSchema.index({ word: 1 }, { unique: true });
```

---

## 15. Error Handling & Response Format

### Standard Success Response
```json
{ "success": true, "data": { ... } }
```

### Standard Error Response
```json
{ "success": false, "error": { "code": "INVALID_TOKEN", "message": "..." } }
```

### Error Codes
| Code | Description |
| :--- | :--- |
| `INVALID_TOKEN` | JWT missing or invalid |
| `USER_NOT_FOUND` | User does not exist |
| `USER_BLOCKED` | Account is blocked by admin |
| `USER_MUTED` | Account is muted by admin |
| `CHAT_NOT_FOUND` | Chat does not exist |
| `FILE_TOO_LARGE` | File exceeds 15MB limit |
| `UPLOAD_FAILED` | Cloudinary upload error |
| `VALIDATION_ERROR` | Zod validation failed |
| `UNAUTHORIZED` | Insufficient permissions |
| `SERVER_ERROR` | Unexpected server error |

---

## 16. Environment Variables

```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb+srv://...

# NextAuth / Google OAuth
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
JWT_SECRET=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Redis (for Socket.io adapter)
REDIS_URL=

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
```

---

## 17. Project Folder Structure

### Backend (`piku-backend/`)
```
piku-backend/
├── src/
│   ├── config/
│   │   ├── db.js              # MongoDB Atlas connection
│   │   ├── cloudinary.js      # Cloudinary config
│   │   ├── redis.js           # Redis client for Socket adapter
│   │   └── socket.js          # Socket.io server + Redis adapter
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── userController.js
│   │   ├── chatController.js
│   │   ├── messageController.js
│   │   ├── uploadController.js
│   │   └── adminController.js
│   ├── middleware/
│   │   ├── auth.js            # JWT verification
│   │   ├── admin.js           # Admin role check
│   │   ├── errorHandler.js    # Global error handler
│   │   └── validate.js        # Zod validation middleware
│   ├── models/
│   │   ├── User.js
│   │   ├── Chat.js
│   │   ├── Message.js
│   │   └── BannedKeyword.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── chats.js
│   │   ├── messages.js
│   │   ├── upload.js
│   │   └── admin.js
│   ├── sockets/
│   │   ├── handler.js         # Main socket event handler
│   │   └── authMiddleware.js  # Socket JWT middleware
│   ├── utils/
│   │   ├── logger.js          # Winston logger
│   │   ├── cron.js            # node-cron retention job
│   │   └── helpers.js
│   ├── validators/
│   │   ├── userValidator.js
│   │   ├── chatValidator.js
│   │   └── messageValidator.js
│   └── server.js              # Express + Socket.io entry
├── tests/
├── .env
├── .gitignore
└── package.json
```

### Frontend (`piku-frontend/`)
```
piku-frontend/
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── (main)/
│   │   │   ├── chat/
│   │   │   │   └── [chatId]/
│   │   │   ├── profile/
│   │   │   └── layout.tsx
│   │   ├── (admin)/
│   │   │   ├── dashboard/
│   │   │   ├── users/
│   │   │   ├── chats/
│   │   │   ├── keywords/
│   │   │   └── audit/
│   │   ├── layout.tsx
│   │   └── page.tsx            # Landing page
│   ├── components/
│   │   ├── ui/                 # Reusable UI (Button, Input, Modal, Avatar)
│   │   ├── chat/               # ChatBubble, ChatInput, MessageList
│   │   ├── sidebar/            # ChatList, UserSearch, ProfileCard
│   │   ├── admin/              # AdminTable, KeywordManager, AuditReport
│   │   └── shared/             # ThemeToggle, Loader, EmptyState
│   ├── hooks/
│   │   ├── useSocket.ts
│   │   ├── useAuth.ts
│   │   ├── useChat.ts
│   │   └── useTheme.ts
│   ├── lib/
│   │   ├── api.ts              # Axios instance
│   │   ├── socket.ts           # Socket.io client
│   │   └── utils.ts
│   ├── store/
│   │   ├── authStore.ts        # Zustand auth state
│   │   ├── chatStore.ts        # Zustand chat state
│   │   └── themeStore.ts       # Zustand theme state
│   ├── types/
│   │   └── index.ts           # TypeScript interfaces
│   └── middleware.ts          # NextAuth + route protection
├── public/
├── .env.local
├── .gitignore
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 18. Admin Dashboard Features

* **User Management:** All users list with filters (role, status, search). Block/unblock, mute users.
* **Chat Viewer:** Click any chat to view full message history between participants.
* **Banned Keywords:** Add/remove keywords, bulk import via textarea.
* **Safety Audit:** On-demand scan generating report with sender, receiver, matched keyword, and action buttons (Mute, Block, Delete).
* **Dashboard Stats:** Total users, active chats, total messages, blocked users count.
* **User Activity:** Last seen, online status, message count per user.

---

## 19. User Profile Management

* Users can edit their display name, username, and profile photo
* Username rules: 3-20 characters, lowercase alphanumeric + underscore
* Profile photo uploaded via Cloudinary with auto-crop to square
* Username change is rate-limited to once per 7 days

---

## 20. Message Edit & Delete

* Users can edit their own text messages within 24 hours of sending
* Edited messages show a small "edited" label
* Users can delete their own messages anytime
* Deleted messages show "This message was deleted" placeholder
* Both edit/delete emit socket events to update both chat windows in real-time

---

## 21. Logging & Monitoring

* **Winston logger** for structured JSON logs (info, warn, error levels)
* **Request logging** via morgan for HTTP requests
* **Socket connection logs** for connect/disconnect events
* **Cron job execution logs** with deleted count and timestamp
* **Error tracking** with stack traces in development mode

---

## 22. Testing Strategy

* **Unit Tests (Jest):** Models, validators, utils, middleware
* **Integration Tests (Supertest):** API endpoints, auth flow, admin actions
* **Socket Tests:** Connection, message delivery, typing events
* **E2E Tests (optional):** Critical user flows via Playwright

---

## 23. Scalability

* **Socket.io Redis Adapter** (`@socket.io/redis-adapter`) for horizontal scaling
* Multiple Node.js instances behind a load balancer with sticky sessions
* MongoDB Atlas connection pooling (maxPoolSize: 10)
* Cloudinary handles media scaling natively