# DBDash (Open Source)

A simple, modern, universal SQL database browser with an Excel-style interface. Browse and edit data from PostgreSQL, MySQL, and SQL Server databases all in one place.

## Features

- **Multi-Database Support**: PostgreSQL, MySQL, MariaDB, and SQL Server
- **Excel-Style Grid**: Edit data directly in the browser with ag-grid
- **Dark Mode UI**: Modern dark theme interface
- **Password Authentication**: Secure login system with JWT tokens
- **Easy Configuration**: Simple `.env` file setup
- **Real-time Editing**: Edit, insert, and delete rows directly from the interface
- **Schema Introspection**: Automatically discovers tables and columns

## Prerequisites

- Node.js 18+ (or Docker)
- pnpm 10+ (package manager)
- Access to your database servers
- Ports configurable via `.env` (default: 8888 frontend, 8889 backend)

## Quick Start

1) Get the code and configure
```bash
# Clone or download
git clone <your-repo-url>
cd dbdash

# Install pnpm if you don't have it (optional - Node.js 18+ includes corepack)
corepack enable
# Or install globally: npm install -g pnpm

# Create your env file
cp .env.example .env

# Set a strong password and JWT secret
# Choose one of the following to generate a secret:
openssl rand -hex 32
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
python3 - <<'PY'
import os, binascii; print(binascii.hexlify(os.urandom(32)).decode())
PY

# Edit .env and set PASSWORD and JWT_SECRET, then add your database connections
# See Configuration section below for format
```

2) Install dependencies and run
```bash
# Install all dependencies (workspace setup with pnpm)
pnpm install

# Backend (in one terminal)
pnpm dev:backend

# Frontend (in another terminal)
pnpm dev:frontend
```

3) Open the dashboard
```
http://localhost:8888
```
Log in with the password you set in `.env`.

### Docker Setup

```bash
# Build and run
docker compose build --no-cache
docker compose up -d

# View logs
docker compose logs -f
```

Access at `http://localhost:${FRONTEND_PORT:-8888}`

**Note:** Docker uses `network_mode: host` to access databases on the host machine. If your databases are on `localhost`, they will be accessible from the container.

## Configuration

`.env` options:

**Authentication:**
- `PASSWORD`: Login password for the dashboard
- `JWT_SECRET`: Random secret string for auth tokens (generate with `openssl rand -hex 32`)

**Ports:**
- `FRONTEND_PORT` (optional, default `8888`): Frontend web server port
- `PORT` (optional, default `8889`): Backend API port

**Database Configuration:**

For each database, use the following pattern:

```env
DB_X_TYPE=<type>          # postgres, mysql, mssql
DB_X_ID=<unique_id>       # Unique identifier
DB_X_NAME=<display_name>  # Display name in UI
DB_X_HOST=<host>          # Database host
DB_X_PORT=<port>          # Database port
DB_X_USER=<user>          # Database user
DB_X_PASSWORD=<password>  # Database password
DB_X_DATABASE=<database>  # Database name
```

**Supported Database Types:**
- `postgres` / `postgresql` - PostgreSQL
- `mysql` / `mariadb` - MySQL / MariaDB
- `mssql` / `sqlserver` - Microsoft SQL Server

**Example Configuration:**
```env
# PostgreSQL Database
DB_1_TYPE=postgres
DB_1_ID=my_db
DB_1_NAME=My Database
DB_1_HOST=localhost
DB_1_PORT=5432
DB_1_USER=postgres
DB_1_PASSWORD=password
DB_1_DATABASE=mydb

# MySQL Database
DB_2_TYPE=mysql
DB_2_ID=my_mysql_db
DB_2_NAME=My MySQL Database
DB_2_HOST=localhost
DB_2_PORT=3306
DB_2_USER=root
DB_2_PASSWORD=password
DB_2_DATABASE=mydb
```


## Usage Notes

- Select a database from the sidebar to view its tables
- Click on a table to load and edit its data
- The grid supports inline editing - changes are saved automatically
- Large tables (>1000 rows) load with a limit; pagination coming soon
- Schema changes require a manual refresh (re-select the table)
- **Dynamic Database Reload**: Click the "🔄 Reload" button in the header to reload databases from `.env` without restarting the server. This allows you to add new databases by editing `.env` and clicking reload.
- **Logout**: Click the "🚪 Logout" button in the header to securely log out and clear your session

## REST API

**Authentication:**
- `POST /api/auth/login` → `{ token }` - Login with password
- `GET /api/auth/verify` - Verify token validity

**Database Endpoints (require authentication):**
- `GET /api/databases` - List all configured databases
- `POST /api/databases/reload` - Reload databases from `.env` file (no restart needed)
- `GET /api/databases/:dbId/tables` - Get tables for a database
- `GET /api/databases/:dbId/tables/:tableName/schema` - Get table schema
- `GET /api/databases/:dbId/tables/:tableName/data` - Get table data (with limit/offset)
- `PUT /api/databases/:dbId/tables/:tableName/row` - Update a row
- `POST /api/databases/:dbId/tables/:tableName/row` - Insert a row
- `DELETE /api/databases/:dbId/tables/:tableName/row` - Delete a row

All endpoints return JSON. Auth header: `Authorization: Bearer <token>`

## Troubleshooting

- **Can't connect to databases**: Check `.env` configuration and ensure database servers are running
- **Empty database list**: Verify your `.env` file has `DB_1_TYPE`, `DB_1_HOST`, etc. configured
- **Connection errors**: Check database credentials, ports, and network connectivity
- **Grid not loading**: Check browser console for errors; verify backend is running on port 8889
- **Port conflicts**: Change `FRONTEND_PORT` or `PORT` in `.env` to use different ports
- **Docker database connections**: Ensure databases are accessible from the container. Docker uses `network_mode: host` to access host databases on `localhost`

## Development

- **Frontend**: React with Vite in `frontend/src/`
- **Backend**: Express.js in `backend/src/`
- **Main Components**: 
  - `frontend/src/components/DatabaseBrowser.jsx` - Main UI component
  - `backend/src/dbManager.js` - Database connection manager
  - `backend/src/routes/databases.js` - API routes

**Local Development:**
```bash
# Backend (watch mode)
pnpm dev:backend

# Frontend (Vite dev server)
pnpm dev:frontend
```

**Clean Rebuild:**
```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

## Security

This app connects directly to your databases using credentials from `.env`. The dashboard includes password authentication with JWT tokens. The application binds to `localhost` only for security. Docker uses `network_mode: host` to access databases on the host machine. 

**Important Security Notes:**
- Set a strong `PASSWORD` in `.env` before deploying
- Generate a secure `JWT_SECRET` (use `openssl rand -hex 32`)
- Keep your `.env` file private and never commit it to version control
- If exposing to the internet, use a reverse proxy (Nginx) with HTTPS
- Tokens expire after 7 days; users will need to log in again

## Known Limitations

- Large tables (>1000 rows) may have performance issues (pagination coming soon)
- Schema changes require manual refresh
- Transaction support for multi-row edits coming soon
- Export/Import features planned

## Roadmap

- [ ] Pagination for large tables
- [ ] SQL query editor
- [ ] Export to CSV/Excel
- [ ] Import from CSV
- [ ] Transaction support
- [ ] Database connection testing UI
- [ ] Query history
- [ ] Table relationships visualization

## Tech Stack

- **Frontend**: React 18, Vite, AG Grid
- **Backend**: Node.js, Express.js
- **Package Manager**: pnpm (workspace setup)
- **Database Drivers**: pg (PostgreSQL), mysql2 (MySQL), mssql (SQL Server)
- **Authentication**: JWT tokens

## License

This project is licensed under the GNU General Public License v2.0. See the [LICENSE](LICENSE) file for details.
