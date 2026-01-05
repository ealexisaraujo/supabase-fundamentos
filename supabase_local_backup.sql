


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


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






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
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
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
    "user" "jsonb"
);


ALTER TABLE "public"."posts_new" OWNER TO "postgres";


COMMENT ON TABLE "public"."posts_new" IS 'Posts table with realtime enabled for live like count updates';



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_ratings"
    ADD CONSTRAINT "post_ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."posts_new"
    ADD CONSTRAINT "posts_new_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_ratings"
    ADD CONSTRAINT "unique_session_post_rating" UNIQUE ("post_id", "session_id");



CREATE INDEX "comments_created_at_idx" ON "public"."comments" USING "btree" ("created_at");



CREATE INDEX "comments_post_id_idx" ON "public"."comments" USING "btree" ("post_id");



CREATE INDEX "comments_user_id_idx" ON "public"."comments" USING "btree" ("user_id");



CREATE INDEX "idx_post_ratings_post_id" ON "public"."post_ratings" USING "btree" ("post_id");



CREATE INDEX "idx_post_ratings_session_id" ON "public"."post_ratings" USING "btree" ("session_id");



CREATE OR REPLACE TRIGGER "update_comments_updated_at_trigger" BEFORE UPDATE ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_comments_updated_at"();



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts_new"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_ratings"
    ADD CONSTRAINT "post_ratings_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts_new"("id") ON DELETE CASCADE;



CREATE POLICY "Allow all public" ON "public"."posts_new" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all public operations on post_ratings" ON "public"."post_ratings" USING (true) WITH CHECK (true);



CREATE POLICY "Allow delete own comments" ON "public"."comments" FOR DELETE USING ((("user_id" IS NOT NULL) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Allow public insert" ON "public"."comments" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow public read" ON "public"."comments" FOR SELECT USING (true);



CREATE POLICY "Allow update own comments" ON "public"."comments" FOR UPDATE USING ((("user_id" IS NOT NULL) AND ("user_id" = "auth"."uid"()))) WITH CHECK ((("user_id" IS NOT NULL) AND ("user_id" = "auth"."uid"())));



ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_ratings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."posts_new" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."post_ratings";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."posts_new";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";































































































































































GRANT ALL ON FUNCTION "public"."update_comments_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_comments_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_comments_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."comments" TO "anon";
GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON TABLE "public"."post_ratings" TO "anon";
GRANT ALL ON TABLE "public"."post_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."post_ratings" TO "service_role";



GRANT ALL ON TABLE "public"."posts_new" TO "anon";
GRANT ALL ON TABLE "public"."posts_new" TO "authenticated";
GRANT ALL ON TABLE "public"."posts_new" TO "service_role";









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

-- \restrict xDiw0GiIURkDgVeDU1f6ItsioGpr1RdN26xYqAy6mkIBaSCh4ak3OQZUe1wfu31

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



--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



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
-- Data for Name: posts_new; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."posts_new" ("id", "user_id", "image_url", "caption", "likes", "created_at", "updated_at", "user") VALUES
	('976642a2-548b-444d-bc12-ee047f68a116', '11111111-1111-1111-1111-111111111111', 'https://picsum.photos/seed/976642a2-548b-444d-bc12-ee047f68a116/600/600', 'Caminos sin rumbo fijo 🚶‍♂️', 42, '2025-12-27 05:51:12.9961+00', '2025-12-27 05:51:12.9961+00', '{"avatar": "https://robohash.org/976642a2-548b-444d-bc12-ee047f68a116?set=set5&bgset=bg1", "username": "user_97664"}'),
	('bde02ccc-3694-4667-8ee4-493fc0579caa', '22222222-2222-2222-2222-222222222222', 'https://picsum.photos/seed/bde02ccc-3694-4667-8ee4-493fc0579caa/600/600', 'Ciudades que nunca duermen 🌃', 67, '2025-12-27 05:51:12.9961+00', '2025-12-27 05:51:12.9961+00', '{"avatar": "https://robohash.org/bde02ccc-3694-4667-8ee4-493fc0579caa?set=set5&bgset=bg1", "username": "user_bde02"}'),
	('bd43df11-aa6c-4af9-a23b-f16cdd0ffae4', '33333333-3333-3333-3333-333333333333', 'https://picsum.photos/seed/bd43df11-aa6c-4af9-a23b-f16cdd0ffae4/600/600', 'Montañas que tocan el cielo 🗻', 18, '2025-12-27 05:51:12.9961+00', '2025-12-27 05:51:12.9961+00', '{"avatar": "https://robohash.org/bd43df11-aa6c-4af9-a23b-f16cdd0ffae4?set=set5&bgset=bg1", "username": "user_bd43d"}'),
	('f698349e-b6c7-4d78-be5c-c8995624f575', '44444444-4444-4444-4444-444444444444', 'https://picsum.photos/seed/f698349e-b6c7-4d78-be5c-c8995624f575/600/600', 'Ríos de aventura 🌊', 89, '2025-12-27 05:51:12.9961+00', '2025-12-27 05:51:12.9961+00', '{"avatar": "https://robohash.org/f698349e-b6c7-4d78-be5c-c8995624f575?set=set5&bgset=bg1", "username": "user_f6983"}'),
	('9479f550-9aa3-4ae1-b09d-8f7b4952674f', '55555555-5555-5555-5555-555555555555', 'https://picsum.photos/seed/9479f550-9aa3-4ae1-b09d-8f7b4952674f/600/600', 'Desiertos infinitos 🏜️', 31, '2025-12-27 05:51:12.9961+00', '2025-12-27 05:51:12.9961+00', '{"avatar": "https://robohash.org/9479f550-9aa3-4ae1-b09d-8f7b4952674f?set=set5&bgset=bg1", "username": "user_9479f"}'),
	('f4ba80c2-399d-4c4e-994f-235b501030d2', '66666666-6666-6666-6666-666666666666', 'https://picsum.photos/seed/f4ba80c2-399d-4c4e-994f-235b501030d2/600/600', 'Selvas llenas de vida 🌴', 55, '2025-12-27 05:51:12.9961+00', '2025-12-27 05:51:12.9961+00', '{"avatar": "https://robohash.org/f4ba80c2-399d-4c4e-994f-235b501030d2?set=set5&bgset=bg1", "username": "user_f4ba8"}'),
	('1e71414b-9ec6-4c01-80f9-7a56a3ce8fa4', '77777777-7777-7777-7777-777777777777', 'https://picsum.photos/seed/1e71414b-9ec6-4c01-80f9-7a56a3ce8fa4/600/600', 'Nieve y aventura ❄️', 73, '2025-12-27 05:51:12.9961+00', '2025-12-27 05:51:12.9961+00', '{"avatar": "https://robohash.org/1e71414b-9ec6-4c01-80f9-7a56a3ce8fa4?set=set5&bgset=bg1", "username": "user_1e714"}'),
	('9ef31c07-ec1c-4f23-a509-8551babc471c', '88888888-8888-8888-8888-888888888888', 'https://picsum.photos/seed/9ef31c07-ec1c-4f23-a509-8551babc471c/600/600', 'Islas perdidas 🏝️', 27, '2025-12-27 05:51:12.9961+00', '2025-12-27 05:51:12.9961+00', '{"avatar": "https://robohash.org/9ef31c07-ec1c-4f23-a509-8551babc471c?set=set5&bgset=bg1", "username": "user_9ef31"}'),
	('430a6097-deb2-4bcf-8d7b-622db3b0a81a', '99999999-9999-9999-9999-999999999999', 'https://picsum.photos/seed/430a6097-deb2-4bcf-8d7b-622db3b0a81a/600/600', 'Caminos rurales 🛤️', 94, '2025-12-27 05:51:12.9961+00', '2025-12-27 05:51:12.9961+00', '{"avatar": "https://robohash.org/430a6097-deb2-4bcf-8d7b-622db3b0a81a?set=set5&bgset=bg1", "username": "user_430a6"}'),
	('c8905c8e-1bc4-4cde-845e-7b1bf8c79504', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'https://picsum.photos/seed/c8905c8e-1bc4-4cde-845e-7b1bf8c79504/600/600', 'Metrópolis vibrantes 🏙️', 38, '2025-12-27 05:51:12.9961+00', '2025-12-27 05:51:12.9961+00', '{"avatar": "https://robohash.org/c8905c8e-1bc4-4cde-845e-7b1bf8c79504?set=set5&bgset=bg1", "username": "user_c8905"}'),
	('8adefcb3-87a1-439a-a177-2b0174a42884', NULL, 'http://localhost:54321/storage/v1/object/public/images_platzi/posts/alex_araujo_perfil-1767652149208.jpg', 'yoyoy', 0, '2026-01-05 22:29:09.275141+00', '2026-01-05 22:29:09.275141+00', NULL);


--
-- Data for Name: comments; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."comments" ("id", "post_id", "user_id", "content", "user", "created_at", "updated_at") VALUES
	('4164350c-3ba8-484c-a6ca-69202be554e3', '976642a2-548b-444d-bc12-ee047f68a116', NULL, 'Qué buena foto!', '{"avatar": "https://i.pravatar.cc/150?img=1", "username": "juan_perez"}', '2026-01-05 22:26:05.902718+00', '2026-01-05 22:26:05.902718+00'),
	('5c344045-2932-48e5-a2d3-14d3509c8d34', '976642a2-548b-444d-bc12-ee047f68a116', NULL, 'Me encanta el lugar', '{"avatar": "https://i.pravatar.cc/150?img=2", "username": "maria_garcia"}', '2026-01-05 22:26:05.902718+00', '2026-01-05 22:26:05.902718+00'),
	('58d87279-60f7-42e6-b9ef-b8c9984a3181', 'bde02ccc-3694-4667-8ee4-493fc0579caa', NULL, 'Increíble vista!', '{"avatar": "https://i.pravatar.cc/150?img=3", "username": "carlos_ruiz"}', '2026-01-05 22:26:05.902718+00', '2026-01-05 22:26:05.902718+00'),
	('4b419935-2250-4293-a61c-7d653f138ca8', 'f698349e-b6c7-4d78-be5c-c8995624f575', NULL, 'Wow, qué aventura!', '{"avatar": "https://i.pravatar.cc/150?img=4", "username": "ana_luz"}', '2026-01-05 22:26:05.902718+00', '2026-01-05 22:26:05.902718+00'),
	('376a7d98-c191-4157-9cc3-2d5a96b6e712', '976642a2-548b-444d-bc12-ee047f68a116', NULL, 'Qué buena foto!', '{"avatar": "https://i.pravatar.cc/150?img=1", "username": "juan_perez"}', '2026-01-05 03:05:30.585337+00', '2026-01-05 03:05:30.585337+00'),
	('1d551292-f040-4e35-8592-6b11f35d9dae', '976642a2-548b-444d-bc12-ee047f68a116', NULL, 'Me encanta el lugar', '{"avatar": "https://i.pravatar.cc/150?img=2", "username": "maria_garcia"}', '2026-01-05 03:05:30.585337+00', '2026-01-05 03:05:30.585337+00'),
	('44ca9052-f656-403d-8b02-6b701243e480', 'bde02ccc-3694-4667-8ee4-493fc0579caa', NULL, 'Increíble vista!', '{"avatar": "https://i.pravatar.cc/150?img=3", "username": "carlos_ruiz"}', '2026-01-05 03:05:30.585337+00', '2026-01-05 03:05:30.585337+00'),
	('abf65580-b065-4c0d-88df-d035d03b6777', 'f698349e-b6c7-4d78-be5c-c8995624f575', NULL, 'Wow, qué aventura!', '{"avatar": "https://i.pravatar.cc/150?img=4", "username": "ana_luz"}', '2026-01-05 03:05:30.585337+00', '2026-01-05 03:05:30.585337+00'),
	('3673ff0f-5045-4fb7-9cae-a98aafa3a3b1', 'c8905c8e-1bc4-4cde-845e-7b1bf8c79504', NULL, 'ksmskmkskmksm', '{"avatar": "https://i.pravatar.cc/40?u=anonymous", "username": "anonymous"}', '2026-01-05 03:15:17.918539+00', '2026-01-05 03:15:17.918539+00');


--
-- Data for Name: post_ratings; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."post_ratings" ("id", "post_id", "session_id", "created_at") VALUES
	('8872abee-741f-4e9f-9689-e76e5336f82c', '976642a2-548b-444d-bc12-ee047f68a116', 'mk0khlch-f451347f-7854-4c72-af60-699d9b4a28b4', '2026-01-05 03:19:23.711563+00'),
	('e7f17417-cc23-462f-b358-c0598a9ef60a', 'bde02ccc-3694-4667-8ee4-493fc0579caa', 'mk0khlch-f451347f-7854-4c72-af60-699d9b4a28b4', '2026-01-05 03:19:53.49921+00'),
	('4027bb57-33d5-4c1e-bc5b-a094ad0f0486', 'bd43df11-aa6c-4af9-a23b-f16cdd0ffae4', 'mk0khlch-f451347f-7854-4c72-af60-699d9b4a28b4', '2026-01-05 03:19:58.963333+00');


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES
	('images_platzi', 'images_platzi', NULL, '2026-01-05 22:27:39.320003+00', '2026-01-05 22:27:39.320003+00', true, false, NULL, NULL, NULL, 'STANDARD');


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

INSERT INTO "storage"."objects" ("id", "bucket_id", "name", "owner", "created_at", "updated_at", "last_accessed_at", "metadata", "version", "owner_id", "user_metadata", "level") VALUES
	('5c730929-b529-4e47-8a48-b09eb9405bf7', 'images_platzi', 'posts/alex_araujo_perfil-1767652149208.jpg', NULL, '2026-01-05 22:29:09.249857+00', '2026-01-05 22:29:09.249857+00', '2026-01-05 22:29:09.249857+00', '{"eTag": "\"a688a2119b59834733db7e64cf4c947e\"", "size": 151312, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-01-05T22:29:09.242Z", "contentLength": 151312, "httpStatusCode": 200}', 'bfd29a80-bfa1-438f-af0e-e6d74fee2292', NULL, '{}', 2);


--
-- Data for Name: prefixes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."prefixes" ("bucket_id", "name", "created_at", "updated_at") VALUES
	('images_platzi', 'posts', '2026-01-05 22:29:09.249857+00', '2026-01-05 22:29:09.249857+00');


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

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 1, false);


--
-- Name: hooks_id_seq; Type: SEQUENCE SET; Schema: supabase_functions; Owner: supabase_functions_admin
--

SELECT pg_catalog.setval('"supabase_functions"."hooks_id_seq"', 1, false);


--
-- PostgreSQL database dump complete
--

-- \unrestrict xDiw0GiIURkDgVeDU1f6ItsioGpr1RdN26xYqAy6mkIBaSCh4ak3OQZUe1wfu31

RESET ALL;
