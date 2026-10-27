# CampusConnect 🎓

A full-stack campus event discovery and registration portal built with React, Vite, Node.js, and MongoDB.

## Features
- Discover upcoming campus events with search and category filters
- View event details and register with name/email
- Save events in the browser for quick access
- Admin panel to create, edit, and delete events
- Responsive layout for desktop and mobile
- REST API with input validation and basic admin-key protection

## Requirements
- Node.js 18+
- MongoDB Community Server running locally, or a MongoDB Atlas connection string

## 1. Start the backend
Open a terminal in `server`:

```bash
npm install
```

Copy `.env.example` to `.env` and configure the values. For local MongoDB, the default URI is suitable:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/campusconnect
PORT=5000
ADMIN_KEY=change-this-admin-key
```

Then run:

```bash
npm start
```

The API runs at `http://localhost:5000`. Health check: `http://localhost:5000/api/health`.

## 2. Start the frontend
Open another terminal in `client`:

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## 3. Admin panel
Open **Admin** in the website and enter the value of `ADMIN_KEY` from `server/.env`. Change the example key before using the app beyond local development.

## API overview
- `GET /api/events` — list events; supports `q`, `category`, and `upcoming=true`
- `GET /api/events/:id` — event details
- `POST /api/events/:id/register` — register using `{ "name": "...", "email": "..." }`
- `GET /api/events/:id/registrations` — registration count (no personal details exposed)
- `POST /api/events` — create event (admin key required)
- `PUT /api/events/:id` — update event (admin key required)
- `DELETE /api/events/:id` — delete event (admin key required)

## Notes
- Saved events are stored in the current browser using local storage. They are not synced across devices.
- This starter project does not include student accounts or email verification. Do not treat the basic admin-key setup as production-grade authentication.
- `.env` and `node_modules` should not be committed to GitHub. Only `.env.example` should be uploaded.
