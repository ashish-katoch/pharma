# Pharma Counter — PRD (v0.1)

## Vision
A counter-first mobile pharmacy POS + inventory system for Indian medical stores. Bill a sale in <15s, track batch/expiry accurately, never silently deduct the wrong medicine.

## Stack (built)
- Frontend: Expo (React Native) 54, expo-router, TypeScript
- Backend: FastAPI + Motor (async MongoDB)
- Auth: JWT (bcrypt), OAuth2 password flow, roles = owner | staff
- PDF: expo-print + expo-sharing (device-native)

## V1 scope shipped
- Owner/staff login (JWT, seeded default users)
- Home dashboard: today's sales, bill count, low-stock & expiring counters
- Billing: fast search, FEFO batch auto-pick, quantity stepper, per-line & bill discount, MRP-inclusive GST split (CGST/SGST)
- Bill history + bill detail (share as PDF, cancel with stock reversal)
- Inventory list + filter chips (All / Low / OTC / Schedule H)
- Medicine detail with batches + color-coded expiry (red<30d, amber<90d, green>90d)
- Stock-In: pick medicine or add new + batch (batch no, expiry, qty, MRP, purchase price)
- Reports: expiring 30/60/90, low-stock
- Settings: shop profile (owner-editable), staff CRUD (owner), sign out
- Audit trail: every mutation logged in `audit_events`

## Deferred (not in V1)
- Bluetooth thermal printing (requires native build)
- Barcode scan UI (dependency installed; UI not wired)
- Voice add / OCR pack text
- CSV import UI (backend `POST /api/medicines/bulk` supports it)
- Offline sync queue (backend is source of truth in V1)

## Default seed data
- Shop: MediPlus Pharmacy (GSTIN + DL seeded)
- Owner: owner@pharma.com / Owner@123
- Staff: staff@pharma.com / Staff@123
- 20 starter Indian medicines with 2 batches each (one near-expiry, one far)

## Backend endpoints
- Auth: POST /api/auth/login, GET /api/auth/me, GET/POST/DELETE /api/auth/staff
- Shop: GET/PUT /api/shop
- Medicines: GET/POST /api/medicines, GET/PUT/DELETE /api/medicines/{id}, POST /api/medicines/bulk
- Batches: GET/POST /api/batches
- Bills: GET/POST /api/bills, GET /api/bills/{id}, POST /api/bills/{id}/cancel
- Reports: GET /api/reports/low-stock, GET /api/reports/expiring
- Stats: GET /api/stats/today
- Audit: GET /api/audit (owner only)
