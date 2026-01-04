# Supabase Local Development Context

## 1. System Architecture & Project Structure
This project operates with a **unified structure**, where the Next.js frontend and Supabase backend configuration coexist in the same repository.

*   **Project Root:** `/Users/alexis.araujo/Documents/cursos/supabase-fundamentos`
    *   **Frontend:** `app/`, `package.json`, etc.
    *   **Backend:** `supabase/` (contains CLI config, migrations, and seed data).
    *   **Environment:** `.env.local` connects the frontend to the local Supabase instance.

## 2. Prerequisites
*   **Docker:** Must be running (Desktop or Daemon).
*   **Supabase CLI:** Installed and authenticated.

## 3. Managing the Local Backend
**Important:** Run these commands from the **project root** (`/Users/alexis.araujo/Documents/cursos/supabase-fundamentos`).

### Starting the Service
Due to local certificate issues with the Edge Runtime, start Supabase with this specific flag:
```bash
npx supabase start --exclude edge-runtime
```
*Or if you have the CLI installed globally:*
```bash
supabase start --exclude edge-runtime
```

### Stopping the Service
```bash
supabase stop
```

### Checking Status & Credentials
To view API URLs, Anon Keys, and Database connection strings:
```bash
supabase status
```

## 4. Environment Configuration
The frontend connects to this local instance. Ensure your frontend `.env` or `.env.local` file matches the running Supabase instance.

**Frontend File:** `.env.local`

```ini
# MUST be http, not https for local development
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1Ni... (Get this from `supabase status`)
```

**Note:** A persistent `jwt_secret` has been configured in `supabase/config.toml`, so your Anon Key should remain constant even after resets.

## 5. Database Management

### Accessing the Data
*   **Dashboard (Studio):** [http://127.0.0.1:54323](http://127.0.0.1:54323)
    *   Visual editor for tables, SQL runner, and storage management.
*   **CLI SQL Query:**
    ```bash
    supabase db query "SELECT * FROM posts_new LIMIT 5"
    ```
*   **Direct Postgres Access (via Docker):**
    ```bash
    # Check container name first with `docker ps`
    docker exec -it supabase-fundamentos_db_... psql -U postgres
    ```

### Key Tables
*   **`posts_new`**: The main table used by the application.
    *   Columns: `id`, `created_at`, `image_url`, `caption`, `likes`, `user` (JSONB), `user_id`.

## 6. Common Troubleshooting

### "Failed to fetch" or Connection Refused
1.  Ensure Docker is running.
2.  Check if Supabase is running (`supabase status`).
3.  Verify the `.env` URL is `http://` and NOT `https://`.

### "Edge Runtime" / Certificate Errors
If you see errors about "invalid peer certificate" or "worker boot error", make sure you start the project with `--exclude edge-runtime`.

### 404 Errors on Images
If images fail to load:
1.  Check the `image_url` in the database.
2.  If using external domains (like `example.com`), add them to `next.config.ts`.
3.  For local testing, use reliable placeholders like `picsum.photos`.

## 7. Database Replication (Backup & Restore)

To move your database schemas and data, use the `scripts/manage_db.sh` automation script.

### 1. Create a Backup
Run this command from the project root:
```bash
./scripts/manage_db.sh backup
```
This generates `supabase_local_backup.sql` containing the full schema and data.

### 2. Restore the Database
```bash
./scripts/manage_db.sh restore
```

### 3. Verification
1.  Check the Supabase Dashboard: [http://127.0.0.1:54323](http://127.0.0.1:54323)

