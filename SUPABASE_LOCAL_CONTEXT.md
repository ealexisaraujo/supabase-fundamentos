# Supabase Local Development Context

## 1. System Architecture & Project Structure
This project operates with a **decoupled structure**, separating the Next.js frontend from the Supabase backend configuration.

*   **Frontend Root:** `/Users/alexis.araujo/Documents/cursos/supabase-fundamentos`
    *   Contains the Next.js application (`app/`, `package.json`, etc.).
    *   Connects to Supabase via `NEXT_PUBLIC_SUPABASE_URL` in `.env`.
*   **Backend Root:** `/Users/alexis.araujo/Documents/cursos/supabase_curso`
    *   Contains the Supabase CLI configuration and local Docker definitions.
    *   **This is where you must run all `supabase` CLI commands.**

## 2. Prerequisites
*   **Docker:** Must be running (Desktop or Daemon).
*   **Supabase CLI:** Installed and authenticated.

## 3. Managing the Local Backend
**Important:** Always run these commands from the backend root:
`cd /Users/alexis.araujo/Documents/cursos/supabase_curso`

### Starting the Service
Due to local certificate issues with the Edge Runtime, start Supabase with this specific flag:
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
The frontend connects to this local instance. Ensure your frontend `.env` file matches the running Supabase instance.

**Frontend File:** `/Users/alexis.araujo/Documents/cursos/supabase-fundamentos/.env`

```ini
# MUST be http, not https for local development
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1Ni... (Get this from `supabase status`)
```

**Note:** If you restart Supabase, the Anon Key usually persists, but if you reset the project, you must update this key in the frontend and restart the Next.js server.

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
    docker exec -it supabase_db_supabase_curso psql -U postgres
    ```

### Key Tables
*   **`posts_new`**: The main table used by the application.
    *   Columns: `id`, `created_at`, `image_url`, `caption`, `likes`, `user` (JSONB), `user_id`.

## 6. Common Troubleshooting

### "Failed to fetch" or Connection Refused
1.  Ensure Docker is running.
2.  Check if Supabase is running (`supabase status` in the backend folder).
3.  Verify the `.env` URL is `http://` and NOT `https://`.

### "Edge Runtime" / Certificate Errors
If you see errors about "invalid peer certificate" or "worker boot error", make sure you start the project with `--exclude edge-runtime`.

### 404 Errors on Images
If images fail to load:
1.  Check the `image_url` in the database.
2.  If using external domains (like `example.com`), add them to `next.config.ts`.
3.  For local testing, use reliable placeholders like `picsum.photos`.
