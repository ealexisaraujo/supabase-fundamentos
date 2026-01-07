# Supabase Edge Functions

## Overview

Supabase Edge Functions are server-side TypeScript functions that run on Deno at the edge (close to users). They are useful for:

- Webhooks and integrations
- Custom API endpoints
- Server-side logic with secrets
- Background processing
- Third-party API calls

## Architecture

```
supabase/
├── functions/
│   ├── deno.json              # Shared Deno configuration
│   ├── _shared/               # Shared code between functions
│   │   └── cors.ts
│   ├── hello/
│   │   └── index.ts           # Function entry point
│   └── another-function/
│       └── index.ts
└── config.toml                # Supabase configuration
```

## Function Structure

Each function lives in its own directory under `supabase/functions/` with an `index.ts` entry point:

```typescript
// supabase/functions/hello/index.ts

// Import Supabase Edge Runtime types
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// CORS headers for browser requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Main handler using Deno.serve
Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Your logic here
    const data = { message: "Hello!" };

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
```

## Local Development

### Start Supabase

```bash
supabase start
```

### Serve Functions

```bash
# Serve all functions
supabase functions serve

# Serve specific function
supabase functions serve hello

# Serve without JWT verification (for testing)
supabase functions serve hello --no-verify-jwt

# Serve with environment file
supabase functions serve --env-file .env.local
```

### Test Functions

```bash
# POST request with JSON body
curl -X POST http://127.0.0.1:54321/functions/v1/hello \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"name": "World"}'

# GET request
curl http://127.0.0.1:54321/functions/v1/hello \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

### Local Anon Key

For local development, use this test anon key:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
```

## Deno Configuration

### deno.json

```json
{
  "compilerOptions": {
    "strict": true,
    "lib": ["deno.window"]
  },
  "imports": {
    "@supabase/supabase-js": "jsr:@supabase/supabase-js@2"
  }
}
```

### Import Maps

Deno uses URL imports. Common patterns:

```typescript
// Supabase client
import { createClient } from "jsr:@supabase/supabase-js@2";

// Edge runtime types
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Standard library (use specific versions in production)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
```

## Environment Variables

### Access in Code

```typescript
// Access environment variables
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
const customSecret = Deno.env.get("MY_SECRET");
```

### Set in config.toml

```toml
[edge_runtime.secrets]
MY_SECRET = "env(MY_SECRET)"
```

### Set via .env file

```bash
# .env.local
MY_SECRET=your-secret-value
```

```bash
supabase functions serve --env-file .env.local
```

## Using Supabase Client

```typescript
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  // Create Supabase client with service role for admin operations
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Or use the anon key and pass user's JWT for RLS
  const authHeader = req.headers.get("Authorization");
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: {
        headers: { Authorization: authHeader ?? "" },
      },
    }
  );

  // Query database
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .limit(10);

  return new Response(JSON.stringify({ data, error }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

## CORS Handling

### Shared CORS Helper

```typescript
// supabase/functions/_shared/cors.ts
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}
```

### Usage

```typescript
import { corsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Your logic here
  return new Response(JSON.stringify({ data: "ok" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

## Request Handling Patterns

### Parse JSON Body

```typescript
interface RequestBody {
  name: string;
  email?: string;
}

const body: RequestBody = await req.json();
```

### Parse URL Parameters

```typescript
const url = new URL(req.url);
const id = url.searchParams.get("id");
const page = parseInt(url.searchParams.get("page") ?? "1");
```

### Parse Path Parameters

```typescript
// URL: /functions/v1/users/123
const url = new URL(req.url);
const pathParts = url.pathname.split("/");
const userId = pathParts[pathParts.length - 1];
```

### Handle Different Methods

```typescript
Deno.serve(async (req: Request) => {
  const { method } = req;

  switch (method) {
    case "GET":
      return handleGet(req);
    case "POST":
      return handlePost(req);
    case "PUT":
      return handlePut(req);
    case "DELETE":
      return handleDelete(req);
    default:
      return new Response("Method not allowed", { status: 405 });
  }
});
```

## Error Handling

### Standard Error Response

```typescript
function errorResponse(message: string, status: number = 500): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

// Usage
if (!userId) {
  return errorResponse("User ID is required", 400);
}
```

### Try-Catch Pattern

```typescript
try {
  const { data, error } = await supabase.from("users").select();

  if (error) {
    console.error("Database error:", error);
    return errorResponse(error.message, 400);
  }

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
} catch (error: unknown) {
  console.error("Unexpected error:", error);
  const message = error instanceof Error ? error.message : "Unknown error";
  return errorResponse(message, 500);
}
```

## Deployment

### Deploy All Functions

```bash
supabase functions deploy
```

### Deploy Specific Function

```bash
supabase functions deploy hello
```

### Deploy with Secrets

```bash
# Set secrets first
supabase secrets set MY_SECRET=value

# Then deploy
supabase functions deploy hello
```

### List Deployed Functions

```bash
supabase functions list
```

## Calling from Frontend

### Using Supabase Client

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Invoke function
const { data, error } = await supabase.functions.invoke("hello", {
  body: { name: "World" },
});
```

### Using Fetch

```typescript
const response = await fetch(
  `${SUPABASE_URL}/functions/v1/hello`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ name: "World" }),
  }
);

const data = await response.json();
```

## Common Patterns

### Webhook Handler

```typescript
Deno.serve(async (req: Request) => {
  // Verify webhook signature
  const signature = req.headers.get("x-webhook-signature");
  const body = await req.text();

  if (!verifySignature(body, signature)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(body);

  // Process webhook
  await processWebhook(payload);

  return new Response("ok", { status: 200 });
});
```

### Scheduled Function (via pg_cron)

```sql
-- In Supabase SQL Editor
select cron.schedule(
  'daily-cleanup',
  '0 0 * * *', -- Every day at midnight
  $$
  select net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/cleanup',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  )
  $$
);
```

### Background Task

```typescript
// Use EdgeRuntime.waitUntil for background tasks
Deno.serve(async (req: Request) => {
  // Respond immediately
  const response = new Response("Processing started", { status: 202 });

  // Process in background (doesn't block response)
  EdgeRuntime.waitUntil(
    processInBackground(await req.json())
  );

  return response;
});
```

## Debugging

### Console Logs

```typescript
console.log("Debug info:", { userId, action });
console.error("Error occurred:", error);
```

### View Logs Locally

```bash
# Logs appear in the terminal running supabase functions serve
```

### View Logs in Production

```bash
supabase functions logs hello
```

## Configuration Reference

### config.toml Settings

```toml
[edge_runtime]
enabled = true
# per_worker = hot reload enabled (default)
# oneshot = no hot reload (use if issues with large repos)
policy = "per_worker"
inspector_port = 8083
deno_version = 2

[edge_runtime.secrets]
MY_SECRET = "env(MY_SECRET)"
```

## Troubleshooting

### Function Not Found

- Ensure function directory exists: `supabase/functions/hello/index.ts`
- Restart: `supabase functions serve hello`

### Import Errors

- Use specific versions: `https://deno.land/std@0.168.0/http/server.ts`
- Check network connectivity to deno.land

### CORS Errors

- Add CORS headers to all responses
- Handle OPTIONS preflight requests

### JWT Errors

- Use `--no-verify-jwt` for local testing
- Pass valid Authorization header in production

## Files in This Project

```
supabase/functions/
├── deno.json                    # Deno configuration
├── combined_ca_bundle.pem       # Corporate proxy certificates
└── hello/
    └── index.ts                 # Hello world function
```

## Related Documentation

- [Supabase Edge Functions Guide](https://supabase.com/docs/guides/functions)
- [Deno Manual](https://deno.land/manual)
- [Corporate Proxy SSL Fix](./CORPORATE_PROXY_SSL_FIX.md)

---

*Last updated: 2026-01-07*
