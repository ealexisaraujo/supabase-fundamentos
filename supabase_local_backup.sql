


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





SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "image_url" "text",
    "caption" "text",
    "likes" numeric DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."posts_new" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "image_url" "text",
    "caption" "text",
    "likes" numeric DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user" "jsonb"
);


ALTER TABLE "public"."posts_new" OWNER TO "postgres";


ALTER TABLE ONLY "public"."posts_new"
    ADD CONSTRAINT "posts_new_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON TABLE "public"."posts" TO "anon";
GRANT ALL ON TABLE "public"."posts" TO "authenticated";
GRANT ALL ON TABLE "public"."posts" TO "service_role";



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

-- \restrict IIqPHHho1Nmnd53OnCKRRlX073ccBXeJ2Kg2pY1zoiOm4oUEFfmJ5NRcsmJbwW8

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
-- Data for Name: posts; Type: TABLE DATA; Schema: public; Owner: postgres
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
	('e6f4cfa6-15f2-4a79-a806-d8c488a21429', '11111111-1111-1111-1111-111111111111', 'https://picsum.photos/seed/e6f4cfa6-15f2-4a79-a806-d8c488a21429/600/600', 'Horizontes infinitos 🌅', 62, '2025-12-27 05:51:12.9961+00', '2025-12-27 05:51:12.9961+00', '{"avatar": "https://robohash.org/e6f4cfa6-15f2-4a79-a806-d8c488a21429?set=set5&bgset=bg1", "username": "user_e6f4c"}'),
	('2903ee83-b861-4c37-814c-7ab9f4451b76', '22222222-2222-2222-2222-222222222222', 'https://picsum.photos/seed/2903ee83-b861-4c37-814c-7ab9f4451b76/600/600', 'Culturas fascinantes 🎎', 15, '2025-12-27 05:51:12.9961+00', '2025-12-27 05:51:12.9961+00', '{"avatar": "https://robohash.org/2903ee83-b861-4c37-814c-7ab9f4451b76?set=set5&bgset=bg1", "username": "user_2903e"}'),
	('c6bb113f-82cc-483f-a789-b4edd9ef0a14', '33333333-3333-3333-3333-333333333333', 'https://picsum.photos/seed/c6bb113f-82cc-483f-a789-b4edd9ef0a14/600/600', 'Arquitectura sorprendente 🏰', 81, '2025-12-27 05:51:12.9961+00', '2025-12-27 05:51:12.9961+00', '{"avatar": "https://robohash.org/c6bb113f-82cc-483f-a789-b4edd9ef0a14?set=set5&bgset=bg1", "username": "user_c6bb1"}'),
	('996f8975-e80d-4db1-894e-03403105e191', '44444444-4444-4444-4444-444444444444', 'https://picsum.photos/seed/996f8975-e80d-4db1-894e-03403105e191/600/600', 'Senderos secretos 🥾', 46, '2025-12-27 05:51:12.9961+00', '2025-12-27 05:51:12.9961+00', '{"avatar": "https://robohash.org/996f8975-e80d-4db1-894e-03403105e191?set=set5&bgset=bg1", "username": "user_996f8"}'),
	('f823438c-6078-4cdb-84d5-2a2458771cdf', '55555555-5555-5555-5555-555555555555', 'https://picsum.photos/seed/f823438c-6078-4cdb-84d5-2a2458771cdf/600/600', 'Océanos azules 🌊', 29, '2025-12-27 05:51:12.9961+00', '2025-12-27 05:51:12.9961+00', '{"avatar": "https://robohash.org/f823438c-6078-4cdb-84d5-2a2458771cdf?set=set5&bgset=bg1", "username": "user_f8234"}'),
	('eed5dc8b-8162-4e11-ad7f-01e90a6c8584', '66666666-6666-6666-6666-666666666666', 'https://picsum.photos/seed/eed5dc8b-8162-4e11-ad7f-01e90a6c8584/600/600', 'Mercados locales 🛒', 77, '2025-12-27 05:51:12.9961+00', '2025-12-27 05:51:12.9961+00', '{"avatar": "https://robohash.org/eed5dc8b-8162-4e11-ad7f-01e90a6c8584?set=set5&bgset=bg1", "username": "user_eed5d"}'),
	('f676fd72-b329-4b90-b49e-e4fbe7875c86', '77777777-7777-7777-7777-777777777777', 'https://picsum.photos/seed/f676fd72-b329-4b90-b49e-e4fbe7875c86/600/600', 'Fiestas tradicionales 🎉', 52, '2025-12-27 05:51:12.9961+00', '2025-12-27 05:51:12.9961+00', '{"avatar": "https://robohash.org/f676fd72-b329-4b90-b49e-e4fbe7875c86?set=set5&bgset=bg1", "username": "user_f676f"}'),
	('8f36ea3b-b96b-4f7e-9758-12ad77bd142d', '88888888-8888-8888-8888-888888888888', 'https://picsum.photos/seed/8f36ea3b-b96b-4f7e-9758-12ad77bd142d/600/600', 'Paisajes de ensueño 💭', 63, '2025-12-27 05:51:12.9961+00', '2025-12-27 05:51:12.9961+00', '{"avatar": "https://robohash.org/8f36ea3b-b96b-4f7e-9758-12ad77bd142d?set=set5&bgset=bg1", "username": "user_8f36e"}'),
	('95d57832-05e4-4a3b-8d8f-1410348b7166', '99999999-9999-9999-9999-999999999999', 'https://picsum.photos/seed/95d57832-05e4-4a3b-8d8f-1410348b7166/600/600', 'Caminos de piedra 🪨', 19, '2025-12-27 05:51:12.9961+00', '2025-12-27 05:51:12.9961+00', '{"avatar": "https://robohash.org/95d57832-05e4-4a3b-8d8f-1410348b7166?set=set5&bgset=bg1", "username": "user_95d57"}'),
	('000feb26-40e3-4f36-a805-b62fac359ec1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'https://picsum.photos/seed/000feb26-40e3-4f36-a805-b62fac359ec1/600/600', 'Aventuras compartidas 👫', 88, '2025-12-27 05:51:12.9961+00', '2025-12-27 05:51:12.9961+00', '{"avatar": "https://robohash.org/000feb26-40e3-4f36-a805-b62fac359ec1?set=set5&bgset=bg1", "username": "user_000fe"}');


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES
	('images_platzi', 'images_platzi', NULL, '2026-01-01 18:37:18.207476+00', '2026-01-01 18:37:18.207476+00', true, false, NULL, NULL, NULL, 'STANDARD'),
	('post', 'post', NULL, '2026-01-02 17:00:14.387265+00', '2026-01-02 17:00:14.387265+00', false, false, NULL, NULL, NULL, 'STANDARD');


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
	('934ee1e3-a74f-428c-a84f-748a084c963b', 'images_platzi', 'profile/.emptyFolderPlaceholder', NULL, '2026-01-02 16:40:13.902514+00', '2026-01-02 16:40:13.902514+00', '2026-01-02 16:40:13.902514+00', '{"eTag": "\"d41d8cd98f00b204e9800998ecf8427e\"", "size": 0, "mimetype": "application/x-directory", "cacheControl": "no-cache", "lastModified": "2026-01-02T16:40:13.900Z", "contentLength": 0, "httpStatusCode": 200}', '7a2c7e39-1df7-4552-ab7a-076971da6bf2', NULL, '{}', 2),
	('d6ea79da-7a7a-4085-b874-be308807ce9c', 'images_platzi', 'posts/.emptyFolderPlaceholder', NULL, '2026-01-02 17:00:53.051136+00', '2026-01-02 17:00:53.051136+00', '2026-01-02 17:00:53.051136+00', '{"eTag": "\"d41d8cd98f00b204e9800998ecf8427e\"", "size": 0, "mimetype": "application/x-directory", "cacheControl": "no-cache", "lastModified": "2026-01-02T17:00:53.047Z", "contentLength": 0, "httpStatusCode": 200}', '279fa9b1-262e-4dd8-b7b8-eb35eef0a181', NULL, '{"mtime": "1767373253"}', 2);


--
-- Data for Name: prefixes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."prefixes" ("bucket_id", "name", "created_at", "updated_at") VALUES
	('images_platzi', 'profile', '2026-01-02 16:40:13.902514+00', '2026-01-02 16:40:13.902514+00'),
	('images_platzi', 'posts', '2026-01-02 17:00:53.051136+00', '2026-01-02 17:00:53.051136+00');


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

-- \unrestrict IIqPHHho1Nmnd53OnCKRRlX073ccBXeJ2Kg2pY1zoiOm4oUEFfmJ5NRcsmJbwW8

RESET ALL;
