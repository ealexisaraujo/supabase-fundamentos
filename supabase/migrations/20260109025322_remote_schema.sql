create extension if not exists "pg_cron" with schema "pg_catalog";

create extension if not exists "pg_net" with schema "extensions";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.invoke_process_like_events()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_service_key TEXT;
BEGIN
  -- Get the service role key from vault if available
  -- For now, we'll use a placeholder - in production, use vault
  v_service_key := current_setting('app.settings.service_role_key', true);
  
  -- If no service key in settings, try to get from environment
  IF v_service_key IS NULL THEN
    -- Use the anon key for now (Edge Function will need verify_jwt: false for this)
    -- Or you can store the service key in vault
    RAISE NOTICE 'Service role key not configured. Skipping Edge Function invocation.';
    RETURN;
  END IF;
  
  -- Invoke the Edge Function
  PERFORM extensions.http_post(
    url := 'https://lszvsnpptqscsuorhmec.supabase.co/functions/v1/process-like-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := '{}'::jsonb
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pgmq_archive(queue_name text, msg_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN pgmq.archive(queue_name, msg_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pgmq_delete(queue_name text, msg_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, msg_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pgmq_list_queues()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN (
    SELECT jsonb_agg(row_to_json(q))
    FROM pgmq.list_queues() q
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pgmq_metrics(queue_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN (
    SELECT row_to_json(m)::jsonb
    FROM pgmq.metrics(queue_name) m
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pgmq_read(queue_name text, vt integer DEFAULT 30, qty integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN (
    SELECT jsonb_agg(row_to_json(r))
    FROM pgmq.read(queue_name, vt, qty) r
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pgmq_send(queue_name text, message jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, message);
END;
$function$
;


