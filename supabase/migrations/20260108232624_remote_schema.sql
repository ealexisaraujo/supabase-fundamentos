drop extension if exists "pg_net";

drop policy "Users can insert their own profile." on "public"."profiles";

drop policy "Users can update own profile." on "public"."profiles";


  create table "public"."post" (
    "id" uuid not null default gen_random_uuid(),
    "create_at" timestamp without time zone default now(),
    "user" text,
    "img_id" text,
    "label" text
      );


CREATE UNIQUE INDEX post_pkey ON public.post USING btree (id);

alter table "public"."post" add constraint "post_pkey" PRIMARY KEY using index "post_pkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$function$
;

grant delete on table "public"."post" to "anon";

grant insert on table "public"."post" to "anon";

grant references on table "public"."post" to "anon";

grant select on table "public"."post" to "anon";

grant trigger on table "public"."post" to "anon";

grant truncate on table "public"."post" to "anon";

grant update on table "public"."post" to "anon";

grant delete on table "public"."post" to "authenticated";

grant insert on table "public"."post" to "authenticated";

grant references on table "public"."post" to "authenticated";

grant select on table "public"."post" to "authenticated";

grant trigger on table "public"."post" to "authenticated";

grant truncate on table "public"."post" to "authenticated";

grant update on table "public"."post" to "authenticated";

grant delete on table "public"."post" to "service_role";

grant insert on table "public"."post" to "service_role";

grant references on table "public"."post" to "service_role";

grant select on table "public"."post" to "service_role";

grant trigger on table "public"."post" to "service_role";

grant truncate on table "public"."post" to "service_role";

grant update on table "public"."post" to "service_role";


  create policy "Users can insert their own profile."
  on "public"."profiles"
  as permissive
  for insert
  to public
with check ((( SELECT auth.uid() AS uid) = id));



  create policy "Users can update own profile."
  on "public"."profiles"
  as permissive
  for update
  to public
using ((( SELECT auth.uid() AS uid) = id));


CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


  create policy "Anyone can upload an avatar."
  on "storage"."objects"
  as permissive
  for insert
  to public
with check ((bucket_id = 'avatars'::text));



  create policy "Avatar images are publicly accessible."
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'avatars'::text));



