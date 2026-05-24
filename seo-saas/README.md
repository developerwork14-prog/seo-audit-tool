# SEO Audit SaaS - Multi-user SEO Analysis Platform

A production-ready SaaS version of the local SEO audit tool. It supports user registration, JWT login, protected Lighthouse audits, MongoDB persistence, and private user-specific audit history.

## Tech Stack

- Backend: Node.js, Express.js, MongoDB, Mongoose, JWT, bcryptjs, Lighthouse, chrome-launcher, axios, cheerio
- Frontend: React, Vite, React Router DOM, Axios

## Project Structure

```text
seo-saas/
├── backend/
│   ├── server.js
│   ├── config/db.js
│   ├── models/User.js
│   ├── models/Audit.js
│   ├── routes/auth.js
│   ├── routes/audit.js
│   ├── middleware/auth.js
│   ├── controllers/authController.js
│   ├── controllers/auditController.js
│   ├── utils/lighthouse.js
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/Login.jsx
│   │   ├── pages/Register.jsx
│   │   ├── pages/Dashboard.jsx
│   │   ├── components/Navbar.jsx
│   │   ├── services/api.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── .env.example
└── README.md
```

## Local Setup

### 1. Backend

```bash
cd seo-saas/backend
npm install
cp .env.example .env
node server.js
```

Set these values in `backend/.env`:

```env
PORT=5000
MONGO_URI=your_mongodb_connection
JWT_SECRET=your_secret_key
FRONTEND_URL=http://localhost:5173
```

### 2. Frontend

```bash
cd seo-saas/frontend
npm install
cp .env.example .env
npm run dev
```

Set this value in `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

## API Endpoints

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Audits

All audit routes require:

```http
Authorization: Bearer your_jwt_token
```

- `POST /api/audit/run`
- `GET /api/audit/history`
- `GET /api/audit/:id`

Audit request:

```json
{
  "url": "https://example.com"
}
```

Audit response includes:

- `performanceScore`
- `seoScore`
- `accessibilityScore`
- `bestPracticesScore`
- full Lighthouse JSON report stored in MongoDB

## Render Deployment

Deploy as two services.

### Backend Web Service

- Root directory: `seo-saas/backend`
- Build command: `npm install`
- Start command: `npm start`
- Environment variables:

```env
PORT=5000
MONGO_URI=your_mongodb_connection
JWT_SECRET=your_secret_key
FRONTEND_URL=https://your-frontend-url.onrender.com
```

The backend listens with:

```js
app.listen(process.env.PORT || 5000)
```

### Frontend Static Site

- Root directory: `seo-saas/frontend`
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Environment variables:

```env
VITE_API_URL=https://your-backend-url.onrender.com/api
```

## Notes

- JWT secrets stay backend-only.
- Audit history is filtered by `userId`, so users only see their own audits.
- No Docker, Redis, paid services, or experimental libraries are required.
- Lighthouse uses `chrome-launcher` with headless and no-sandbox flags for Render compatibility.
