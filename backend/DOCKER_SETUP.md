# Running the backend locally with Docker

This spins up the whole backend — Postgres + the API — with one command. You don't need Python, a virtualenv, or anything else installed except Docker.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running (Mac, Windows, or Linux)
- Git

## 1. Clone the repo

```bash
git clone https://github.com/anayat-global/pharma-backend.git
cd pharma-backend
```

## 2. Set up your `.env` file

```bash
cp .env.example .env
```

Open `.env` and set `JWT_SECRET` to any random string at least 32 characters long. This is only for your local machine — it doesn't need to match anyone else's. Example:

```bash
JWT_SECRET=local-dev-only-change-this-to-something-random-32chars-plus
```

Everything else in `.env` already has a working default for local development — you don't need to touch it.

## 3. Start everything

```bash
docker compose up -d --build
```

This builds the API image, starts Postgres, waits for it to be healthy, runs database migrations automatically, then starts the API. First run takes a minute or two (downloading the Postgres image, installing Python dependencies). After that, `docker compose up -d` is fast.

## 4. Confirm it's running

```bash
curl http://localhost:8000/api/health
```

You should see `{"status":"ok"}`. You can also open [http://localhost:8000/docs](http://localhost:8000/docs) in a browser for the interactive API docs (Swagger UI) — every endpoint, request/response shape, and you can try requests directly from there.

## 5. Point the frontend app at it

If you're running the `pharma-app` Expo app against this backend, create a `.env` file in the `pharma-app` repo with:

```bash
EXPO_PUBLIC_BACKEND_URL=http://localhost:8000
```

If you're testing on a physical phone (not a simulator/emulator, and not Expo web), `localhost` won't work — the phone needs your computer's LAN IP instead. Find it with:

```bash
# Mac
ipconfig getifaddr en0

# Windows
ipconfig    # look for IPv4 Address
```

Then use `http://<that-ip>:8000` instead of `localhost`, and make sure your phone is on the same WiFi network as your computer.

## Creating your first account

There's no pre-seeded login — the backend deliberately ships with zero default credentials. Create your own owner account by hitting the register endpoint (or do this from the app's signup screen, if it has one):

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "you@example.com",
    "password": "YourPassword123!",
    "name": "Your Name",
    "shop_name": "Your Test Pharmacy"
  }'
```

This returns an `access_token` you can use immediately, and creates you as the `owner` of a new shop.

## Common commands

```bash
# View logs (both services)
docker compose logs -f

# View just the API logs
docker compose logs -f api

# Stop everything (keeps your data)
docker compose down

# Stop everything and wipe the database (start fresh)
docker compose down -v

# Rebuild after pulling new code
docker compose up -d --build

# Run a shell inside the API container (for debugging)
docker compose exec api sh
```

## Troubleshooting

**Port 5432 or 8000 already in use** — something else on your machine (maybe a local Postgres install, or another project) is using that port. Either stop that other thing, or edit the `ports:` section in `docker-compose.yml` to map to a different host port, e.g. `"8001:8000"`.

**`docker compose up` fails immediately on the `api` service** — check `docker compose logs api`. The most common cause is `JWT_SECRET` being unset or too short (must be 32+ characters) — check step 2.

**Changes to backend code aren't showing up** — this setup is not a hot-reload dev server; it runs the code as it was when you last built the image. After pulling new code or making changes, run `docker compose up -d --build` again.

**Need to reset the database completely** — `docker compose down -v` removes the Postgres data volume. Next `docker compose up -d --build` starts from a completely empty, freshly-migrated database.
