


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgmq";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_post_like"("p_post_id" "uuid", "p_session_id" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_existing_rating_id UUID;
  v_is_liked BOOLEAN;
  v_new_likes NUMERIC;
BEGIN
  -- Check if rating exists
  SELECT id INTO v_existing_rating_id
  FROM post_ratings
  WHERE post_id = p_post_id AND session_id = p_session_id;

  IF v_existing_rating_id IS NOT NULL THEN
    -- Unlike: Delete rating and decrement
    DELETE FROM post_ratings WHERE id = v_existing_rating_id;

    UPDATE posts_new
    SET likes = GREATEST(0, likes - 1), updated_at = now()
    WHERE id = p_post_id
    RETURNING likes INTO v_new_likes;

    v_is_liked := FALSE;
  ELSE
    -- Like: Insert rating and increment
    INSERT INTO post_ratings (post_id, session_id)
    VALUES (p_post_id, p_session_id);

    UPDATE posts_new
    SET likes = likes + 1, updated_at = now()
    WHERE id = p_post_id
    RETURNING likes INTO v_new_likes;

    v_is_liked := TRUE;
  END IF;

  RETURN json_build_object(
    'success', TRUE,
    'isLiked', v_is_liked,
    'newLikeCount', v_new_likes
  );
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object(
    'success', FALSE,
    'isLiked', TRUE,
    'newLikeCount', 0,
    'error', 'Already liked this post'
  );
END;
$$;


ALTER FUNCTION "public"."toggle_post_like"("p_post_id" "uuid", "p_session_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_comments_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_comments_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "content" "text" NOT NULL,
    "user" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "profile_id" "uuid"
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


COMMENT ON TABLE "public"."comments" IS 'Stores user comments on posts/photos';



COMMENT ON COLUMN "public"."comments"."id" IS 'Unique identifier for the comment (UUID)';



COMMENT ON COLUMN "public"."comments"."post_id" IS 'Reference to the parent post';



COMMENT ON COLUMN "public"."comments"."user_id" IS 'Reference to the commenting user (nullable for anonymous)';



COMMENT ON COLUMN "public"."comments"."content" IS 'The comment text content';



COMMENT ON COLUMN "public"."comments"."user" IS 'JSONB with user display info (username, avatar)';



COMMENT ON COLUMN "public"."comments"."created_at" IS 'Timestamp when comment was created';



COMMENT ON COLUMN "public"."comments"."updated_at" IS 'Timestamp when comment was last updated';



CREATE TABLE IF NOT EXISTS "public"."post" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "create_at" timestamp without time zone DEFAULT "now"(),
    "user" "text",
    "img_id" "text",
    "label" "text"
);


ALTER TABLE "public"."post" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "session_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."post_ratings" REPLICA IDENTITY FULL;


ALTER TABLE "public"."post_ratings" OWNER TO "postgres";


COMMENT ON TABLE "public"."post_ratings" IS 'Rating tracking table with realtime enabled for session sync across tabs';



COMMENT ON COLUMN "public"."post_ratings"."session_id" IS 'Anonymous session identifier stored in browser localStorage';



CREATE TABLE IF NOT EXISTS "public"."posts_new" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "image_url" "text",
    "caption" "text",
    "likes" numeric DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user" "jsonb",
    "profile_id" "uuid"
);


ALTER TABLE "public"."posts_new" OWNER TO "postgres";


COMMENT ON TABLE "public"."posts_new" IS 'Posts table with realtime enabled for live like count updates';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text",
    "full_name" "text",
    "avatar_url" "text",
    "website" "text",
    "bio" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone,
    CONSTRAINT "username_length" CHECK (("char_length"("username") >= 3))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post"
    ADD CONSTRAINT "post_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_ratings"
    ADD CONSTRAINT "post_ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."posts_new"
    ADD CONSTRAINT "posts_new_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."post_ratings"
    ADD CONSTRAINT "unique_session_post_rating" UNIQUE ("post_id", "session_id");



CREATE INDEX "comments_created_at_idx" ON "public"."comments" USING "btree" ("created_at");



CREATE INDEX "comments_post_id_idx" ON "public"."comments" USING "btree" ("post_id");



CREATE INDEX "comments_user_id_idx" ON "public"."comments" USING "btree" ("user_id");



CREATE INDEX "idx_comments_profile_id" ON "public"."comments" USING "btree" ("profile_id");



CREATE INDEX "idx_post_ratings_post_id" ON "public"."post_ratings" USING "btree" ("post_id");



CREATE INDEX "idx_post_ratings_session_id" ON "public"."post_ratings" USING "btree" ("session_id");



CREATE INDEX "idx_posts_new_profile_id" ON "public"."posts_new" USING "btree" ("profile_id");



CREATE OR REPLACE TRIGGER "on_profiles_updated" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "update_comments_updated_at_trigger" BEFORE UPDATE ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_comments_updated_at"();



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts_new"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."post_ratings"
    ADD CONSTRAINT "post_ratings_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts_new"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."posts_new"
    ADD CONSTRAINT "posts_new_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Allow all public" ON "public"."posts_new" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all public operations on post_ratings" ON "public"."post_ratings" USING (true) WITH CHECK (true);



CREATE POLICY "Allow delete own comments" ON "public"."comments" FOR DELETE USING ((("user_id" IS NOT NULL) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Allow public read" ON "public"."comments" FOR SELECT USING (true);



CREATE POLICY "Allow update own comments" ON "public"."comments" FOR UPDATE USING ((("user_id" IS NOT NULL) AND ("user_id" = "auth"."uid"()))) WITH CHECK ((("user_id" IS NOT NULL) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Only authenticated users can comment" ON "public"."comments" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("profile_id" IS NOT NULL) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Public profiles are viewable by everyone." ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Users can insert their own profile." ON "public"."profiles" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can update own profile." ON "public"."profiles" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_ratings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."posts_new" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."post_ratings";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."posts_new";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";












































































































































































































































































































GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."toggle_post_like"("p_post_id" "uuid", "p_session_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_post_like"("p_post_id" "uuid", "p_session_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_post_like"("p_post_id" "uuid", "p_session_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_comments_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_comments_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_comments_updated_at"() TO "service_role";



























GRANT ALL ON TABLE "public"."comments" TO "anon";
GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON TABLE "public"."post" TO "anon";
GRANT ALL ON TABLE "public"."post" TO "authenticated";
GRANT ALL ON TABLE "public"."post" TO "service_role";



GRANT ALL ON TABLE "public"."post_ratings" TO "anon";
GRANT ALL ON TABLE "public"."post_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."post_ratings" TO "service_role";



GRANT ALL ON TABLE "public"."posts_new" TO "anon";
GRANT ALL ON TABLE "public"."posts_new" TO "authenticated";
GRANT ALL ON TABLE "public"."posts_new" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict MrW5aue2XBp4ncQXUuCIcKlB9haUicrd5q0UsGEWSaEyTsXLolCpK2LspvdgTf6

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."audit_log_entries" ("instance_id", "id", "payload", "created_at", "ip_address") VALUES
	('00000000-0000-0000-0000-000000000000', '1b66e7bc-bbc9-4953-afcb-4c4da302298a', '{"action":"login","actor_id":"e5555555-5555-5555-5555-555555555555","actor_name":"Lucia Fernandez","actor_username":"lucia@example.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-01-09 03:10:59.248253+00', '');


--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous") VALUES
	('00000000-0000-0000-0000-000000000000', 'a1111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'maria@example.com', '$2a$10$S7ztLySShNS9oamUIaiON.nh2iiKwazuBDghTSNFLDkfgGTgtjwyC', '2026-01-09 03:10:51.333212+00', NULL, '', NULL, '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"full_name": "Maria Garcia"}', NULL, '2025-12-10 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', 'b2222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'carlos@example.com', '$2a$10$S7ztLySShNS9oamUIaiON.nh2iiKwazuBDghTSNFLDkfgGTgtjwyC', '2026-01-09 03:10:51.333212+00', NULL, '', NULL, '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"full_name": "Carlos Rodriguez"}', NULL, '2025-12-15 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', 'c3333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'ana@example.com', '$2a$10$S7ztLySShNS9oamUIaiON.nh2iiKwazuBDghTSNFLDkfgGTgtjwyC', '2026-01-09 03:10:51.333212+00', NULL, '', NULL, '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"full_name": "Ana Martinez"}', NULL, '2025-12-20 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', 'd4444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'pedro@example.com', '$2a$10$S7ztLySShNS9oamUIaiON.nh2iiKwazuBDghTSNFLDkfgGTgtjwyC', '2026-01-09 03:10:51.333212+00', NULL, '', NULL, '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"full_name": "Pedro Sanchez"}', NULL, '2025-12-25 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', 'e5555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'lucia@example.com', '$2a$10$S7ztLySShNS9oamUIaiON.nh2iiKwazuBDghTSNFLDkfgGTgtjwyC', '2026-01-09 03:10:51.333212+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-01-09 03:10:59.252158+00', '{"provider": "email", "providers": ["email"]}', '{"full_name": "Lucia Fernandez"}', NULL, '2025-12-30 03:10:51.333212+00', '2026-01-09 03:10:59.261718+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."identities" ("provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at", "updated_at", "id") VALUES
	('a1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', '{"sub": "a1111111-1111-1111-1111-111111111111", "email": "maria@example.com"}', 'email', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', 'a1111111-1111-1111-1111-111111111111'),
	('b2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', '{"sub": "b2222222-2222-2222-2222-222222222222", "email": "carlos@example.com"}', 'email', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', 'b2222222-2222-2222-2222-222222222222'),
	('c3333333-3333-3333-3333-333333333333', 'c3333333-3333-3333-3333-333333333333', '{"sub": "c3333333-3333-3333-3333-333333333333", "email": "ana@example.com"}', 'email', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', 'c3333333-3333-3333-3333-333333333333'),
	('d4444444-4444-4444-4444-444444444444', 'd4444444-4444-4444-4444-444444444444', '{"sub": "d4444444-4444-4444-4444-444444444444", "email": "pedro@example.com"}', 'email', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', 'd4444444-4444-4444-4444-444444444444'),
	('e5555555-5555-5555-5555-555555555555', 'e5555555-5555-5555-5555-555555555555', '{"sub": "e5555555-5555-5555-5555-555555555555", "email": "lucia@example.com"}', 'email', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', 'e5555555-5555-5555-5555-555555555555');


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."sessions" ("id", "user_id", "created_at", "updated_at", "factor_id", "aal", "not_after", "refreshed_at", "user_agent", "ip", "tag", "oauth_client_id", "refresh_token_hmac_key", "refresh_token_counter", "scopes") VALUES
	('2bae6e26-788f-4f9d-9701-b9a83764e18d', 'e5555555-5555-5555-5555-555555555555', '2026-01-09 03:10:59.252206+00', '2026-01-09 03:10:59.252206+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36', '172.21.0.1', NULL, NULL, NULL, NULL, NULL);


--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."mfa_amr_claims" ("session_id", "created_at", "updated_at", "authentication_method", "id") VALUES
	('2bae6e26-788f-4f9d-9701-b9a83764e18d', '2026-01-09 03:10:59.262389+00', '2026-01-09 03:10:59.262389+00', 'password', '32836b76-d344-48d1-a43a-650b564802d4');


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_client_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."refresh_tokens" ("instance_id", "id", "token", "user_id", "revoked", "created_at", "updated_at", "parent", "session_id") VALUES
	('00000000-0000-0000-0000-000000000000', 1, 'nskggakaaf7p', 'e5555555-5555-5555-5555-555555555555', false, '2026-01-09 03:10:59.25839+00', '2026-01-09 03:10:59.25839+00', NULL, '2bae6e26-788f-4f9d-9701-b9a83764e18d');


--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."profiles" ("id", "username", "full_name", "avatar_url", "website", "bio", "created_at", "updated_at") VALUES
	('a1111111-1111-1111-1111-111111111111', 'maria_garcia', 'Maria Garcia', 'https://i.pravatar.cc/150?u=maria_garcia', 'https://mariagarciatravel.com', 'Travel blogger exploring the world one photo at a time', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00'),
	('b2222222-2222-2222-2222-222222222222', 'carlos_adventure', 'Carlos Rodriguez', 'https://i.pravatar.cc/150?u=carlos_adventure', 'https://carlosadventure.com', 'Outdoor photographer and mountain enthusiast', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00'),
	('c3333333-3333-3333-3333-333333333333', 'ana_foodie', 'Ana Martinez', 'https://i.pravatar.cc/150?u=ana_foodie', NULL, 'Food photographer | Restaurant reviewer | Coffee addict', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00'),
	('d4444444-4444-4444-4444-444444444444', 'pedro_urban', 'Pedro Sanchez', 'https://i.pravatar.cc/150?u=pedro_urban', 'https://pedrourban.photo', 'Urban explorer capturing city life', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00'),
	('e5555555-5555-5555-5555-555555555555', 'lucia_nature', 'Lucia Fernandez', 'https://i.pravatar.cc/150?u=lucia_nature', NULL, 'Nature lover | Wildlife photographer', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00');


--
-- Data for Name: posts_new; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."posts_new" ("id", "user_id", "image_url", "caption", "likes", "created_at", "updated_at", "user", "profile_id") VALUES
	('10010001-aaaa-bbbb-cccc-ddddeeee0001', 'a1111111-1111-1111-1111-111111111111', 'https://picsum.photos/seed/maria1/600/600', 'Atardecer magico en Santorini. Los colores del cielo griego son increibles', 127, '2026-01-02 03:10:51.333212+00', '2026-01-02 03:10:51.333212+00', '{"avatar": "https://i.pravatar.cc/150?u=maria_garcia", "username": "maria_garcia"}', 'a1111111-1111-1111-1111-111111111111'),
	('10010002-aaaa-bbbb-cccc-ddddeeee0002', 'a1111111-1111-1111-1111-111111111111', 'https://picsum.photos/seed/maria2/600/600', 'Explorando las calles de Tokyo. La fusion de lo antiguo y moderno me fascina', 89, '2026-01-04 03:10:51.333212+00', '2026-01-04 03:10:51.333212+00', '{"avatar": "https://i.pravatar.cc/150?u=maria_garcia", "username": "maria_garcia"}', 'a1111111-1111-1111-1111-111111111111'),
	('10010003-aaaa-bbbb-cccc-ddddeeee0003', 'a1111111-1111-1111-1111-111111111111', 'https://picsum.photos/seed/maria3/600/600', 'Machu Picchu al amanecer. Un sueno hecho realidad', 234, '2026-01-06 03:10:51.333212+00', '2026-01-06 03:10:51.333212+00', '{"avatar": "https://i.pravatar.cc/150?u=maria_garcia", "username": "maria_garcia"}', 'a1111111-1111-1111-1111-111111111111'),
	('10010004-aaaa-bbbb-cccc-ddddeeee0004', 'a1111111-1111-1111-1111-111111111111', 'https://picsum.photos/seed/maria4/600/600', 'Perdida en las calles de Marrakech', 56, '2026-01-08 03:10:51.333212+00', '2026-01-08 03:10:51.333212+00', '{"avatar": "https://i.pravatar.cc/150?u=maria_garcia", "username": "maria_garcia"}', 'a1111111-1111-1111-1111-111111111111'),
	('20020001-aaaa-bbbb-cccc-ddddeeee0001', 'b2222222-2222-2222-2222-222222222222', 'https://picsum.photos/seed/carlos1/600/600', 'Cumbre del Aconcagua. 6962 metros de pura adrenalina', 312, '2025-12-30 03:10:51.333212+00', '2025-12-30 03:10:51.333212+00', '{"avatar": "https://i.pravatar.cc/150?u=carlos_adventure", "username": "carlos_adventure"}', 'b2222222-2222-2222-2222-222222222222'),
	('20020002-aaaa-bbbb-cccc-ddddeeee0002', 'b2222222-2222-2222-2222-222222222222', 'https://picsum.photos/seed/carlos2/600/600', 'Kayak en los fiordos noruegos. Agua cristalina y montanas imponentes', 178, '2026-01-03 03:10:51.333212+00', '2026-01-03 03:10:51.333212+00', '{"avatar": "https://i.pravatar.cc/150?u=carlos_adventure", "username": "carlos_adventure"}', 'b2222222-2222-2222-2222-222222222222'),
	('20020003-aaaa-bbbb-cccc-ddddeeee0003', 'b2222222-2222-2222-2222-222222222222', 'https://picsum.photos/seed/carlos3/600/600', 'Camping bajo las estrellas en Patagonia', 145, '2026-01-07 03:10:51.333212+00', '2026-01-07 03:10:51.333212+00', '{"avatar": "https://i.pravatar.cc/150?u=carlos_adventure", "username": "carlos_adventure"}', 'b2222222-2222-2222-2222-222222222222'),
	('30030001-aaaa-bbbb-cccc-ddddeeee0001', 'c3333333-3333-3333-3333-333333333333', 'https://picsum.photos/seed/ana1/600/600', 'Ramen perfecto en un callejon de Osaka. Caldo de 12 horas', 98, '2026-01-01 03:10:51.333212+00', '2026-01-01 03:10:51.333212+00', '{"avatar": "https://i.pravatar.cc/150?u=ana_foodie", "username": "ana_foodie"}', 'c3333333-3333-3333-3333-333333333333'),
	('30030002-aaaa-bbbb-cccc-ddddeeee0002', 'c3333333-3333-3333-3333-333333333333', 'https://picsum.photos/seed/ana2/600/600', 'Tacos al pastor en Mexico DF. Sabor autentico', 156, '2026-01-05 03:10:51.333212+00', '2026-01-05 03:10:51.333212+00', '{"avatar": "https://i.pravatar.cc/150?u=ana_foodie", "username": "ana_foodie"}', 'c3333333-3333-3333-3333-333333333333'),
	('40040001-aaaa-bbbb-cccc-ddddeeee0001', 'd4444444-4444-4444-4444-444444444444', 'https://picsum.photos/seed/pedro1/600/600', 'Skyline de Hong Kong desde Victoria Peak', 267, '2025-12-31 03:10:51.333212+00', '2025-12-31 03:10:51.333212+00', '{"avatar": "https://i.pravatar.cc/150?u=pedro_urban", "username": "pedro_urban"}', 'd4444444-4444-4444-4444-444444444444'),
	('40040002-aaaa-bbbb-cccc-ddddeeee0002', 'd4444444-4444-4444-4444-444444444444', 'https://picsum.photos/seed/pedro2/600/600', 'Graffiti en las calles de Berlin. Arte urbano en su maxima expresion', 134, '2026-01-06 03:10:51.333212+00', '2026-01-06 03:10:51.333212+00', '{"avatar": "https://i.pravatar.cc/150?u=pedro_urban", "username": "pedro_urban"}', 'd4444444-4444-4444-4444-444444444444'),
	('50050001-aaaa-bbbb-cccc-ddddeeee0001', 'e5555555-5555-5555-5555-555555555555', 'https://picsum.photos/seed/lucia1/600/600', 'Oso polar en su habitat natural. Momento magico en el Artico', 445, '2025-12-28 03:10:51.333212+00', '2025-12-28 03:10:51.333212+00', '{"avatar": "https://i.pravatar.cc/150?u=lucia_nature", "username": "lucia_nature"}', 'e5555555-5555-5555-5555-555555555555'),
	('50050002-aaaa-bbbb-cccc-ddddeeee0002', 'e5555555-5555-5555-5555-555555555555', 'https://picsum.photos/seed/lucia2/600/600', 'Aurora boreal en Islandia. La naturaleza nos regala espectaculos unicos', 389, '2026-01-04 03:10:51.333212+00', '2026-01-04 03:10:51.333212+00', '{"avatar": "https://i.pravatar.cc/150?u=lucia_nature", "username": "lucia_nature"}', 'e5555555-5555-5555-5555-555555555555'),
	('50050003-aaaa-bbbb-cccc-ddddeeee0003', 'e5555555-5555-5555-5555-555555555555', 'https://picsum.photos/seed/lucia3/600/600', 'Cascada escondida en Costa Rica. Verde infinito', 198, '2026-01-07 03:10:51.333212+00', '2026-01-07 03:10:51.333212+00', '{"avatar": "https://i.pravatar.cc/150?u=lucia_nature", "username": "lucia_nature"}', 'e5555555-5555-5555-5555-555555555555'),
	('00000001-aaaa-bbbb-cccc-ddddeeee0001', NULL, 'https://picsum.photos/seed/anon1/600/600', 'Foto anonima desde algun lugar del mundo', 23, '2025-12-25 03:10:51.333212+00', '2025-12-25 03:10:51.333212+00', '{"avatar": "https://i.pravatar.cc/150?u=anonymous1", "username": "viajero_anonimo"}', NULL),
	('00000002-aaaa-bbbb-cccc-ddddeeee0002', NULL, 'https://picsum.photos/seed/anon2/600/600', 'Capturando momentos sin identidad', 45, '2025-12-26 03:10:51.333212+00', '2025-12-26 03:10:51.333212+00', '{"avatar": "https://i.pravatar.cc/150?u=anonymous2", "username": "fotografo_misterioso"}', NULL),
	('00000003-aaaa-bbbb-cccc-ddddeeee0003', NULL, 'https://picsum.photos/seed/anon3/600/600', 'La belleza esta en todas partes', 67, '2025-12-27 03:10:51.333212+00', '2025-12-27 03:10:51.333212+00', '{"avatar": "https://i.pravatar.cc/150?u=anonymous3", "username": "observador_silencioso"}', NULL),
	('30030003-aaaa-bbbb-cccc-ddddeeee0003', 'c3333333-3333-3333-3333-333333333333', 'https://picsum.photos/seed/ana3/600/600', 'Croissant recien horneado en Paris. Perfeccion francesa', 204, '2026-01-08 03:10:51.333212+00', '2026-01-09 03:12:38.361221+00', '{"avatar": "https://i.pravatar.cc/150?u=ana_foodie", "username": "ana_foodie"}', 'c3333333-3333-3333-3333-333333333333');


--
-- Data for Name: comments; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."comments" ("id", "post_id", "user_id", "content", "user", "created_at", "updated_at", "profile_id") VALUES
	('a5babf05-3d1e-4a1a-a355-7e1f682fa94f', '10010003-aaaa-bbbb-cccc-ddddeeee0003', 'b2222222-2222-2222-2222-222222222222', 'Increible foto! Siempre he querido ir', '{"avatar": "https://i.pravatar.cc/150?u=carlos_adventure", "username": "carlos_adventure"}', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', 'b2222222-2222-2222-2222-222222222222'),
	('61beddd2-080f-4546-a82b-ec1954a14831', '10010003-aaaa-bbbb-cccc-ddddeeee0003', 'e5555555-5555-5555-5555-555555555555', 'Los colores del amanecer son espectaculares', '{"avatar": "https://i.pravatar.cc/150?u=lucia_nature", "username": "lucia_nature"}', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', 'e5555555-5555-5555-5555-555555555555'),
	('12aa045e-399a-4236-b256-adf057914ad0', '10010003-aaaa-bbbb-cccc-ddddeeee0003', 'd4444444-4444-4444-4444-444444444444', 'Que camara usaste?', '{"avatar": "https://i.pravatar.cc/150?u=pedro_urban", "username": "pedro_urban"}', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', 'd4444444-4444-4444-4444-444444444444'),
	('6a0c3bf8-e18b-48a4-92e2-b01d59c7074c', '20020001-aaaa-bbbb-cccc-ddddeeee0001', 'a1111111-1111-1111-1111-111111111111', 'Que valiente! Felicitaciones por la cumbre', '{"avatar": "https://i.pravatar.cc/150?u=maria_garcia", "username": "maria_garcia"}', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', 'a1111111-1111-1111-1111-111111111111'),
	('4fc4a397-b09c-4996-82fe-de3a63bd4247', '20020001-aaaa-bbbb-cccc-ddddeeee0001', 'c3333333-3333-3333-3333-333333333333', 'El paisaje es impresionante', '{"avatar": "https://i.pravatar.cc/150?u=ana_foodie", "username": "ana_foodie"}', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', 'c3333333-3333-3333-3333-333333333333'),
	('90ebdf94-877f-4573-95ab-6c5c1b76df30', '50050001-aaaa-bbbb-cccc-ddddeeee0001', 'a1111111-1111-1111-1111-111111111111', 'Wow! Como lograste acercarte tanto?', '{"avatar": "https://i.pravatar.cc/150?u=maria_garcia", "username": "maria_garcia"}', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', 'a1111111-1111-1111-1111-111111111111'),
	('f54d819e-9a0c-44b6-934e-809a8dd49859', '50050001-aaaa-bbbb-cccc-ddddeeee0001', 'b2222222-2222-2222-2222-222222222222', 'Foto del ano sin duda', '{"avatar": "https://i.pravatar.cc/150?u=carlos_adventure", "username": "carlos_adventure"}', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', 'b2222222-2222-2222-2222-222222222222'),
	('164eb07f-c047-4234-a6c0-bfa6daf4df3c', '50050001-aaaa-bbbb-cccc-ddddeeee0001', 'd4444444-4444-4444-4444-444444444444', 'Hermoso animal', '{"avatar": "https://i.pravatar.cc/150?u=pedro_urban", "username": "pedro_urban"}', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', 'd4444444-4444-4444-4444-444444444444'),
	('0dd76e5a-49bf-427d-b12c-845d27756402', '50050001-aaaa-bbbb-cccc-ddddeeee0001', 'c3333333-3333-3333-3333-333333333333', 'Naturaleza pura', '{"avatar": "https://i.pravatar.cc/150?u=ana_foodie", "username": "ana_foodie"}', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', 'c3333333-3333-3333-3333-333333333333'),
	('1b4bcf39-0d71-463e-814e-c9a000c35b36', '30030003-aaaa-bbbb-cccc-ddddeeee0003', 'e5555555-5555-5555-5555-555555555555', 'Se ve delicioso!', '{"avatar": "https://i.pravatar.cc/150?u=lucia_nature", "username": "lucia_nature"}', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', 'e5555555-5555-5555-5555-555555555555'),
	('2442bf69-8eca-4064-915f-447b06a9e89b', '30030003-aaaa-bbbb-cccc-ddddeeee0003', 'a1111111-1111-1111-1111-111111111111', 'Paris siempre tiene la mejor pasteleria', '{"avatar": "https://i.pravatar.cc/150?u=maria_garcia", "username": "maria_garcia"}', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', 'a1111111-1111-1111-1111-111111111111'),
	('de551a0e-4dcd-444c-a74e-05a220aa7cac', '40040001-aaaa-bbbb-cccc-ddddeeee0001', 'c3333333-3333-3333-3333-333333333333', 'La vista es increible de noche', '{"avatar": "https://i.pravatar.cc/150?u=ana_foodie", "username": "ana_foodie"}', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', 'c3333333-3333-3333-3333-333333333333'),
	('f907d268-af02-416e-99ff-e61fe00cf063', '40040001-aaaa-bbbb-cccc-ddddeeee0001', 'b2222222-2222-2222-2222-222222222222', 'Hong Kong es otra dimension', '{"avatar": "https://i.pravatar.cc/150?u=carlos_adventure", "username": "carlos_adventure"}', '2026-01-09 03:10:51.333212+00', '2026-01-09 03:10:51.333212+00', 'b2222222-2222-2222-2222-222222222222'),
	('782b2e9c-0ade-44d7-b023-83a9b197fd88', '30030003-aaaa-bbbb-cccc-ddddeeee0003', 'e5555555-5555-5555-5555-555555555555', 'okokkok', NULL, '2026-01-09 03:12:28.575587+00', '2026-01-09 03:12:28.575587+00', 'e5555555-5555-5555-5555-555555555555');


--
-- Data for Name: post; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: post_ratings; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."post_ratings" ("id", "post_id", "session_id", "created_at") VALUES
	('21e663c6-830a-4b77-9e5f-759f16d13a53', '10010003-aaaa-bbbb-cccc-ddddeeee0003', 'session-carlos-001', '2026-01-09 03:10:51.333212+00'),
	('112d8b4f-4e00-4982-ad5f-a85f65c287e7', '10010003-aaaa-bbbb-cccc-ddddeeee0003', 'session-lucia-001', '2026-01-09 03:10:51.333212+00'),
	('0b2c8613-c9b6-473f-af40-ad369741a642', '10010003-aaaa-bbbb-cccc-ddddeeee0003', 'session-pedro-001', '2026-01-09 03:10:51.333212+00'),
	('943397cc-4622-4bd8-a0c7-033f7c2548f2', '10010003-aaaa-bbbb-cccc-ddddeeee0003', 'session-ana-001', '2026-01-09 03:10:51.333212+00'),
	('a134a1cf-def3-4ffa-bcd3-2bcff241c625', '20020001-aaaa-bbbb-cccc-ddddeeee0001', 'session-maria-001', '2026-01-09 03:10:51.333212+00'),
	('759addd1-f393-482e-984f-6be532f7382c', '20020001-aaaa-bbbb-cccc-ddddeeee0001', 'session-lucia-001', '2026-01-09 03:10:51.333212+00'),
	('457cdbfe-8bb3-4db3-a604-acbd038d9cc3', '20020001-aaaa-bbbb-cccc-ddddeeee0001', 'session-ana-001', '2026-01-09 03:10:51.333212+00'),
	('a25307d5-8404-44a1-8f02-e5746e14a5a3', '50050001-aaaa-bbbb-cccc-ddddeeee0001', 'session-maria-001', '2026-01-09 03:10:51.333212+00'),
	('4cec68f6-6256-451e-a52d-51e8e91a88dd', '50050001-aaaa-bbbb-cccc-ddddeeee0001', 'session-carlos-001', '2026-01-09 03:10:51.333212+00'),
	('8553390f-2554-43c1-adf7-f2268732b871', '50050001-aaaa-bbbb-cccc-ddddeeee0001', 'session-pedro-001', '2026-01-09 03:10:51.333212+00'),
	('0dead6de-8be9-4445-a41a-fada6db95509', '50050001-aaaa-bbbb-cccc-ddddeeee0001', 'session-ana-001', '2026-01-09 03:10:51.333212+00'),
	('a4327120-cab9-4154-be49-7862f46bdb9f', '50050001-aaaa-bbbb-cccc-ddddeeee0001', 'session-visitor-001', '2026-01-09 03:10:51.333212+00'),
	('49b8bb83-bb47-467e-a2fe-9729731377c6', '50050002-aaaa-bbbb-cccc-ddddeeee0002', 'session-maria-001', '2026-01-09 03:10:51.333212+00'),
	('9df21140-e32f-46a0-a920-c88b8ac65b3d', '50050002-aaaa-bbbb-cccc-ddddeeee0002', 'session-carlos-001', '2026-01-09 03:10:51.333212+00'),
	('8280a6ec-b169-4a85-a262-7df108aefbd4', '50050002-aaaa-bbbb-cccc-ddddeeee0002', 'session-pedro-001', '2026-01-09 03:10:51.333212+00'),
	('c5fbccb3-c804-4a2c-ba32-1789a4f49b3f', '40040001-aaaa-bbbb-cccc-ddddeeee0001', 'session-maria-001', '2026-01-09 03:10:51.333212+00'),
	('f3e5c969-635e-4348-833a-c9d1e4aa2abe', '40040001-aaaa-bbbb-cccc-ddddeeee0001', 'session-lucia-001', '2026-01-09 03:10:51.333212+00'),
	('b31da93f-83e8-4e15-a5d7-66ac51a7673d', '40040001-aaaa-bbbb-cccc-ddddeeee0001', 'session-ana-001', '2026-01-09 03:10:51.333212+00'),
	('cbca6b70-5e8b-4000-a1b7-ec3a55fd209f', '30030003-aaaa-bbbb-cccc-ddddeeee0003', 'session-lucia-001', '2026-01-09 03:10:51.333212+00'),
	('b9b6635b-d275-4e84-b296-d79d07062a23', '30030003-aaaa-bbbb-cccc-ddddeeee0003', 'session-maria-001', '2026-01-09 03:10:51.333212+00'),
	('77c1e5b6-b1ef-4468-a1df-5762e7ed3c65', '30030003-aaaa-bbbb-cccc-ddddeeee0003', 'session-carlos-001', '2026-01-09 03:10:51.333212+00'),
	('697d75b7-466c-4759-9611-a594258b1f46', '30030003-aaaa-bbbb-cccc-ddddeeee0003', 'mk30jlvh-024c5b82-cbab-46db-9c23-6a7efef847c0', '2026-01-09 03:12:38.361221+00');


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: buckets_analytics; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: buckets_vectors; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: iceberg_namespaces; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: iceberg_tables; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: prefixes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: vector_indexes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: hooks; Type: TABLE DATA; Schema: supabase_functions; Owner: supabase_functions_admin
--



--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 1, true);


--
-- Name: hooks_id_seq; Type: SEQUENCE SET; Schema: supabase_functions; Owner: supabase_functions_admin
--

SELECT pg_catalog.setval('"supabase_functions"."hooks_id_seq"', 1, false);


--
-- PostgreSQL database dump complete
--

-- \unrestrict MrW5aue2XBp4ncQXUuCIcKlB9haUicrd5q0UsGEWSaEyTsXLolCpK2LspvdgTf6

RESET ALL;
