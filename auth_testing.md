# Auth Testing Playbook — Factory CMMS Enterprise

## Environment
- Backend: FastAPI @ 0.0.0.0:8001 (route prefix `/api`)
- Frontend: React @ port 3000, uses `REACT_APP_BACKEND_URL` for API + WS
- DB: MongoDB via `MONGO_URL`
- Auth: JWT (HS256) via httpOnly cookies (`access_token`, `refresh_token`); also accepted as `Authorization: Bearer <token>` for WebSocket handshake

## Seeded accounts (see /app/memory/test_credentials.md)
- admin@factory.local / Admin@123 (role: admin)
- tech@factory.local / Tech@123 (role: technician)
- op@factory.local / Op@123 (role: operator)

## Endpoints under test
- POST /api/auth/login  {email, password}
- POST /api/auth/logout
- GET  /api/auth/me
- POST /api/auth/refresh
- POST /api/auth/register (admin only)

## Curl checks
```
API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)
curl -s -c /tmp/c.txt -X POST "$API_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@factory.local","password":"Admin@123"}'
curl -s -b /tmp/c.txt "$API_URL/api/auth/me"
```
Expected: login returns `{ok:true, data:{user:{...}, access_token:"..."}}`, `/me` returns the admin user.

## Role enforcement
- operator token calling `POST /api/plants` → 403
- technician token calling `POST /api/users` → 403
- admin token calling any of the above → 200

## Brute force
- 5 wrong passwords for same email/IP → 6th attempt returns 429 with `AUTH_LOCKED`

## WebSocket handshake
- `wss://<host>/api/ws?token=<access_token>` connects then `{op:"subscribe", channels:["line:<id>"]}`
- Missing/invalid token → closed with code 4401
