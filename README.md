# DBDash (Open Source)

DBDash is a lightweight web UI for browsing and editing SQL databases from one place.

I built it for the "I have Postgres over here, MySQL over there, and SQL Server in another box" workflow where jumping between tools gets old fast.

<img width="2512" height="1328" alt="DBDash screenshot" src="https://github.com/user-attachments/assets/6354e591-6dcb-43a8-8408-a5508356f40a" />

## What You Get

- PostgreSQL, MySQL/MariaDB, and SQL Server support
- Single login-protected dashboard
- Table list + schema introspection
- Grid-based row browsing/editing
- Live database reload from `.env` (`POST /api/databases/reload`)

## Stack

- Frontend: React + Vite + AG Grid
- Backend: Express
- Drivers: `pg`, `mysql2`, `mssql`

## Quick Start (Local)

```bash
cd dbdash
cp .env.example .env
# set PASSWORD + JWT_SECRET and DB_* entries
pnpm install
pnpm dev:backend
pnpm dev:frontend
```

Open:

- Frontend: `http://localhost:8888`
- Backend: `http://localhost:8889`

## Quick Start (Docker)

```bash
docker compose build --no-cache
docker compose up -d
docker compose logs -f
```

Open `http://localhost:${FRONTEND_PORT:-8888}`.

## Configuration

### Auth

- `PASSWORD`: Dashboard login password
- `JWT_SECRET`: Secret used to sign auth tokens

### Ports

- `FRONTEND_PORT` (default `8888`)
- `PORT` backend API port (default `8889`)

### Database Entries

Use one block per database:

```env
DB_1_TYPE=postgres
DB_1_ID=main_pg
DB_1_NAME=Main Postgres
DB_1_HOST=localhost
DB_1_PORT=5432
DB_1_USER=postgres
DB_1_PASSWORD=...
DB_1_DATABASE=app
```

Supported `TYPE` values:

- `postgres`, `postgresql`
- `mysql`, `mariadb`
- `mssql`, `sqlserver`

## API

### Public

- `POST /api/auth/login`
- `GET /api/auth/verify`

### Authenticated

- `GET /api/databases`
- `POST /api/databases/reload`
- `GET /api/databases/:dbId/tables`
- `GET /api/databases/:dbId/tables/:tableName/schema`
- `GET /api/databases/:dbId/tables/:tableName/data`
- `PUT /api/databases/:dbId/tables/:tableName/row`
- `POST /api/databases/:dbId/tables/:tableName/row`
- `DELETE /api/databases/:dbId/tables/:tableName/row`

Auth header: `Authorization: Bearer <token>`

## Security Notes

- SQL object identifiers are validated before query assembly.
- Row values are parameterized per driver.
- Login attempts are rate-limited.
- Keep `.env` private.
- Put HTTPS/reverse proxy in front if internet-facing.

## Known Limits

- Very large tables still need pagination/virtualization improvements.
- No migration/schema-edit tooling (this focuses on data browsing/editing).

## Dev Layout

- `frontend/src/components/DatabaseBrowser.jsx`
- `backend/src/dbManager.js`
- `backend/src/routes/databases.js`

## License

GPL-2.0-only
