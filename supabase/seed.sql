-- =============================================================================
-- Seed Data for Suplatzigram - Authenticated Posts Feature
-- =============================================================================
-- This seed creates:
-- 1. Auth users (for authentication)
-- 2. Profiles linked to those users
-- 3. Posts linked to profiles via profile_id (new authenticated flow)
-- 4. Some legacy anonymous posts (backward compatibility)
-- 5. Comments on posts
-- 6. Post ratings for likes
-- =============================================================================

-- =============================================================================
-- 1. AUTH USERS
-- Create test users in auth.users table
-- Password for all users: "password123"
-- =============================================================================
INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
) VALUES
    -- User 1: maria_garcia (travel blogger)
    (
        'a1111111-1111-1111-1111-111111111111',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'maria@example.com',
        '$2a$10$PznXiVH2Y7ZGCE9xBcWJFuJbVVnRQKpYlOEj.xb1fkI6K/pAqQyCy', -- password123
        NOW(),
        '{"provider": "email", "providers": ["email"]}',
        '{"full_name": "Maria Garcia"}',
        NOW() - INTERVAL '30 days',
        NOW(),
        '',
        '',
        '',
        ''
    ),
    -- User 2: carlos_adventure (outdoor photographer)
    (
        'b2222222-2222-2222-2222-222222222222',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'carlos@example.com',
        '$2a$10$PznXiVH2Y7ZGCE9xBcWJFuJbVVnRQKpYlOEj.xb1fkI6K/pAqQyCy', -- password123
        NOW(),
        '{"provider": "email", "providers": ["email"]}',
        '{"full_name": "Carlos Rodriguez"}',
        NOW() - INTERVAL '25 days',
        NOW(),
        '',
        '',
        '',
        ''
    ),
    -- User 3: ana_foodie (food photographer)
    (
        'c3333333-3333-3333-3333-333333333333',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'ana@example.com',
        '$2a$10$PznXiVH2Y7ZGCE9xBcWJFuJbVVnRQKpYlOEj.xb1fkI6K/pAqQyCy', -- password123
        NOW(),
        '{"provider": "email", "providers": ["email"]}',
        '{"full_name": "Ana Martinez"}',
        NOW() - INTERVAL '20 days',
        NOW(),
        '',
        '',
        '',
        ''
    ),
    -- User 4: pedro_urban (urban explorer)
    (
        'd4444444-4444-4444-4444-444444444444',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'pedro@example.com',
        '$2a$10$PznXiVH2Y7ZGCE9xBcWJFuJbVVnRQKpYlOEj.xb1fkI6K/pAqQyCy', -- password123
        NOW(),
        '{"provider": "email", "providers": ["email"]}',
        '{"full_name": "Pedro Sanchez"}',
        NOW() - INTERVAL '15 days',
        NOW(),
        '',
        '',
        '',
        ''
    ),
    -- User 5: lucia_nature (nature photographer)
    (
        'e5555555-5555-5555-5555-555555555555',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'lucia@example.com',
        '$2a$10$PznXiVH2Y7ZGCE9xBcWJFuJbVVnRQKpYlOEj.xb1fkI6K/pAqQyCy', -- password123
        NOW(),
        '{"provider": "email", "providers": ["email"]}',
        '{"full_name": "Lucia Fernandez"}',
        NOW() - INTERVAL '10 days',
        NOW(),
        '',
        '',
        '',
        ''
    )
ON CONFLICT (id) DO NOTHING;

-- Also insert into auth.identities for proper auth flow
INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
) VALUES
    ('a1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', '{"sub": "a1111111-1111-1111-1111-111111111111", "email": "maria@example.com"}', 'email', 'a1111111-1111-1111-1111-111111111111', NOW(), NOW(), NOW()),
    ('b2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', '{"sub": "b2222222-2222-2222-2222-222222222222", "email": "carlos@example.com"}', 'email', 'b2222222-2222-2222-2222-222222222222', NOW(), NOW(), NOW()),
    ('c3333333-3333-3333-3333-333333333333', 'c3333333-3333-3333-3333-333333333333', '{"sub": "c3333333-3333-3333-3333-333333333333", "email": "ana@example.com"}', 'email', 'c3333333-3333-3333-3333-333333333333', NOW(), NOW(), NOW()),
    ('d4444444-4444-4444-4444-444444444444', 'd4444444-4444-4444-4444-444444444444', '{"sub": "d4444444-4444-4444-4444-444444444444", "email": "pedro@example.com"}', 'email', 'd4444444-4444-4444-4444-444444444444', NOW(), NOW(), NOW()),
    ('e5555555-5555-5555-5555-555555555555', 'e5555555-5555-5555-5555-555555555555', '{"sub": "e5555555-5555-5555-5555-555555555555", "email": "lucia@example.com"}', 'email', 'e5555555-5555-5555-5555-555555555555', NOW(), NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 2. PROFILES
-- Create profiles linked to auth users
-- =============================================================================
INSERT INTO public.profiles (id, username, full_name, avatar_url, bio, website) VALUES
    ('a1111111-1111-1111-1111-111111111111', 'maria_garcia', 'Maria Garcia', 'https://i.pravatar.cc/150?u=maria_garcia', 'Travel blogger exploring the world one photo at a time', 'https://mariagarciatravel.com'),
    ('b2222222-2222-2222-2222-222222222222', 'carlos_adventure', 'Carlos Rodriguez', 'https://i.pravatar.cc/150?u=carlos_adventure', 'Outdoor photographer and mountain enthusiast', 'https://carlosadventure.com'),
    ('c3333333-3333-3333-3333-333333333333', 'ana_foodie', 'Ana Martinez', 'https://i.pravatar.cc/150?u=ana_foodie', 'Food photographer | Restaurant reviewer | Coffee addict', NULL),
    ('d4444444-4444-4444-4444-444444444444', 'pedro_urban', 'Pedro Sanchez', 'https://i.pravatar.cc/150?u=pedro_urban', 'Urban explorer capturing city life', 'https://pedrourban.photo'),
    ('e5555555-5555-5555-5555-555555555555', 'lucia_nature', 'Lucia Fernandez', 'https://i.pravatar.cc/150?u=lucia_nature', 'Nature lover | Wildlife photographer', NULL)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 3. POSTS - AUTHENTICATED (with profile_id)
-- Posts created by authenticated users, linked to their profiles
-- =============================================================================
INSERT INTO public.posts_new (id, user_id, profile_id, image_url, caption, likes, created_at, updated_at, "user") VALUES
    -- Maria's posts (travel blogger - 4 posts)
    ('10010001-aaaa-bbbb-cccc-ddddeeee0001', 'a1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
     'https://picsum.photos/seed/maria1/600/600',
     'Atardecer magico en Santorini. Los colores del cielo griego son increibles',
     127, NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days',
     '{"avatar": "https://i.pravatar.cc/150?u=maria_garcia", "username": "maria_garcia"}'),

    ('10010002-aaaa-bbbb-cccc-ddddeeee0002', 'a1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
     'https://picsum.photos/seed/maria2/600/600',
     'Explorando las calles de Tokyo. La fusion de lo antiguo y moderno me fascina',
     89, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days',
     '{"avatar": "https://i.pravatar.cc/150?u=maria_garcia", "username": "maria_garcia"}'),

    ('10010003-aaaa-bbbb-cccc-ddddeeee0003', 'a1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
     'https://picsum.photos/seed/maria3/600/600',
     'Machu Picchu al amanecer. Un sueno hecho realidad',
     234, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days',
     '{"avatar": "https://i.pravatar.cc/150?u=maria_garcia", "username": "maria_garcia"}'),

    ('10010004-aaaa-bbbb-cccc-ddddeeee0004', 'a1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
     'https://picsum.photos/seed/maria4/600/600',
     'Perdida en las calles de Marrakech',
     56, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day',
     '{"avatar": "https://i.pravatar.cc/150?u=maria_garcia", "username": "maria_garcia"}'),

    -- Carlos's posts (outdoor photographer - 3 posts)
    ('20020001-aaaa-bbbb-cccc-ddddeeee0001', 'b2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222',
     'https://picsum.photos/seed/carlos1/600/600',
     'Cumbre del Aconcagua. 6962 metros de pura adrenalina',
     312, NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days',
     '{"avatar": "https://i.pravatar.cc/150?u=carlos_adventure", "username": "carlos_adventure"}'),

    ('20020002-aaaa-bbbb-cccc-ddddeeee0002', 'b2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222',
     'https://picsum.photos/seed/carlos2/600/600',
     'Kayak en los fiordos noruegos. Agua cristalina y montanas imponentes',
     178, NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days',
     '{"avatar": "https://i.pravatar.cc/150?u=carlos_adventure", "username": "carlos_adventure"}'),

    ('20020003-aaaa-bbbb-cccc-ddddeeee0003', 'b2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222',
     'https://picsum.photos/seed/carlos3/600/600',
     'Camping bajo las estrellas en Patagonia',
     145, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days',
     '{"avatar": "https://i.pravatar.cc/150?u=carlos_adventure", "username": "carlos_adventure"}'),

    -- Ana's posts (food photographer - 3 posts)
    ('30030001-aaaa-bbbb-cccc-ddddeeee0001', 'c3333333-3333-3333-3333-333333333333', 'c3333333-3333-3333-3333-333333333333',
     'https://picsum.photos/seed/ana1/600/600',
     'Ramen perfecto en un callejon de Osaka. Caldo de 12 horas',
     98, NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days',
     '{"avatar": "https://i.pravatar.cc/150?u=ana_foodie", "username": "ana_foodie"}'),

    ('30030002-aaaa-bbbb-cccc-ddddeeee0002', 'c3333333-3333-3333-3333-333333333333', 'c3333333-3333-3333-3333-333333333333',
     'https://picsum.photos/seed/ana2/600/600',
     'Tacos al pastor en Mexico DF. Sabor autentico',
     156, NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days',
     '{"avatar": "https://i.pravatar.cc/150?u=ana_foodie", "username": "ana_foodie"}'),

    ('30030003-aaaa-bbbb-cccc-ddddeeee0003', 'c3333333-3333-3333-3333-333333333333', 'c3333333-3333-3333-3333-333333333333',
     'https://picsum.photos/seed/ana3/600/600',
     'Croissant recien horneado en Paris. Perfeccion francesa',
     203, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day',
     '{"avatar": "https://i.pravatar.cc/150?u=ana_foodie", "username": "ana_foodie"}'),

    -- Pedro's posts (urban explorer - 2 posts)
    ('40040001-aaaa-bbbb-cccc-ddddeeee0001', 'd4444444-4444-4444-4444-444444444444', 'd4444444-4444-4444-4444-444444444444',
     'https://picsum.photos/seed/pedro1/600/600',
     'Skyline de Hong Kong desde Victoria Peak',
     267, NOW() - INTERVAL '9 days', NOW() - INTERVAL '9 days',
     '{"avatar": "https://i.pravatar.cc/150?u=pedro_urban", "username": "pedro_urban"}'),

    ('40040002-aaaa-bbbb-cccc-ddddeeee0002', 'd4444444-4444-4444-4444-444444444444', 'd4444444-4444-4444-4444-444444444444',
     'https://picsum.photos/seed/pedro2/600/600',
     'Graffiti en las calles de Berlin. Arte urbano en su maxima expresion',
     134, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days',
     '{"avatar": "https://i.pravatar.cc/150?u=pedro_urban", "username": "pedro_urban"}'),

    -- Lucia's posts (nature photographer - 3 posts)
    ('50050001-aaaa-bbbb-cccc-ddddeeee0001', 'e5555555-5555-5555-5555-555555555555', 'e5555555-5555-5555-5555-555555555555',
     'https://picsum.photos/seed/lucia1/600/600',
     'Oso polar en su habitat natural. Momento magico en el Artico',
     445, NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days',
     '{"avatar": "https://i.pravatar.cc/150?u=lucia_nature", "username": "lucia_nature"}'),

    ('50050002-aaaa-bbbb-cccc-ddddeeee0002', 'e5555555-5555-5555-5555-555555555555', 'e5555555-5555-5555-5555-555555555555',
     'https://picsum.photos/seed/lucia2/600/600',
     'Aurora boreal en Islandia. La naturaleza nos regala espectaculos unicos',
     389, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days',
     '{"avatar": "https://i.pravatar.cc/150?u=lucia_nature", "username": "lucia_nature"}'),

    ('50050003-aaaa-bbbb-cccc-ddddeeee0003', 'e5555555-5555-5555-5555-555555555555', 'e5555555-5555-5555-5555-555555555555',
     'https://picsum.photos/seed/lucia3/600/600',
     'Cascada escondida en Costa Rica. Verde infinito',
     198, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days',
     '{"avatar": "https://i.pravatar.cc/150?u=lucia_nature", "username": "lucia_nature"}')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 4. POSTS - ANONYMOUS (legacy posts without profile_id)
-- These demonstrate backward compatibility with posts that don't have profile_id
-- =============================================================================
INSERT INTO public.posts_new (id, user_id, profile_id, image_url, caption, likes, created_at, updated_at, "user") VALUES
    ('00000001-aaaa-bbbb-cccc-ddddeeee0001', NULL, NULL,
     'https://picsum.photos/seed/anon1/600/600',
     'Foto anonima desde algun lugar del mundo',
     23, NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days',
     '{"avatar": "https://i.pravatar.cc/150?u=anonymous1", "username": "viajero_anonimo"}'),

    ('00000002-aaaa-bbbb-cccc-ddddeeee0002', NULL, NULL,
     'https://picsum.photos/seed/anon2/600/600',
     'Capturando momentos sin identidad',
     45, NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days',
     '{"avatar": "https://i.pravatar.cc/150?u=anonymous2", "username": "fotografo_misterioso"}'),

    ('00000003-aaaa-bbbb-cccc-ddddeeee0003', NULL, NULL,
     'https://picsum.photos/seed/anon3/600/600',
     'La belleza esta en todas partes',
     67, NOW() - INTERVAL '13 days', NOW() - INTERVAL '13 days',
     '{"avatar": "https://i.pravatar.cc/150?u=anonymous3", "username": "observador_silencioso"}')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 5. COMMENTS
-- Comments on various posts (with user_id and profile_id for authenticated comments)
-- =============================================================================
INSERT INTO public.comments (post_id, user_id, profile_id, content, "user") VALUES
    -- Comments on Maria's Machu Picchu post (most liked)
    ('10010003-aaaa-bbbb-cccc-ddddeeee0003', 'b2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', 'Increible foto! Siempre he querido ir', '{"avatar": "https://i.pravatar.cc/150?u=carlos_adventure", "username": "carlos_adventure"}'),
    ('10010003-aaaa-bbbb-cccc-ddddeeee0003', 'e5555555-5555-5555-5555-555555555555', 'e5555555-5555-5555-5555-555555555555', 'Los colores del amanecer son espectaculares', '{"avatar": "https://i.pravatar.cc/150?u=lucia_nature", "username": "lucia_nature"}'),
    ('10010003-aaaa-bbbb-cccc-ddddeeee0003', 'd4444444-4444-4444-4444-444444444444', 'd4444444-4444-4444-4444-444444444444', 'Que camara usaste?', '{"avatar": "https://i.pravatar.cc/150?u=pedro_urban", "username": "pedro_urban"}'),

    -- Comments on Carlos's Aconcagua post
    ('20020001-aaaa-bbbb-cccc-ddddeeee0001', 'a1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'Que valiente! Felicitaciones por la cumbre', '{"avatar": "https://i.pravatar.cc/150?u=maria_garcia", "username": "maria_garcia"}'),
    ('20020001-aaaa-bbbb-cccc-ddddeeee0001', 'c3333333-3333-3333-3333-333333333333', 'c3333333-3333-3333-3333-333333333333', 'El paisaje es impresionante', '{"avatar": "https://i.pravatar.cc/150?u=ana_foodie", "username": "ana_foodie"}'),

    -- Comments on Lucia's polar bear post
    ('50050001-aaaa-bbbb-cccc-ddddeeee0001', 'a1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'Wow! Como lograste acercarte tanto?', '{"avatar": "https://i.pravatar.cc/150?u=maria_garcia", "username": "maria_garcia"}'),
    ('50050001-aaaa-bbbb-cccc-ddddeeee0001', 'b2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', 'Foto del ano sin duda', '{"avatar": "https://i.pravatar.cc/150?u=carlos_adventure", "username": "carlos_adventure"}'),
    ('50050001-aaaa-bbbb-cccc-ddddeeee0001', 'd4444444-4444-4444-4444-444444444444', 'd4444444-4444-4444-4444-444444444444', 'Hermoso animal', '{"avatar": "https://i.pravatar.cc/150?u=pedro_urban", "username": "pedro_urban"}'),
    ('50050001-aaaa-bbbb-cccc-ddddeeee0001', 'c3333333-3333-3333-3333-333333333333', 'c3333333-3333-3333-3333-333333333333', 'Naturaleza pura', '{"avatar": "https://i.pravatar.cc/150?u=ana_foodie", "username": "ana_foodie"}'),

    -- Comments on Ana's croissant post
    ('30030003-aaaa-bbbb-cccc-ddddeeee0003', 'e5555555-5555-5555-5555-555555555555', 'e5555555-5555-5555-5555-555555555555', 'Se ve delicioso!', '{"avatar": "https://i.pravatar.cc/150?u=lucia_nature", "username": "lucia_nature"}'),
    ('30030003-aaaa-bbbb-cccc-ddddeeee0003', 'a1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'Paris siempre tiene la mejor pasteleria', '{"avatar": "https://i.pravatar.cc/150?u=maria_garcia", "username": "maria_garcia"}'),

    -- Comments on Pedro's Hong Kong post
    ('40040001-aaaa-bbbb-cccc-ddddeeee0001', 'c3333333-3333-3333-3333-333333333333', 'c3333333-3333-3333-3333-333333333333', 'La vista es increible de noche', '{"avatar": "https://i.pravatar.cc/150?u=ana_foodie", "username": "ana_foodie"}'),
    ('40040001-aaaa-bbbb-cccc-ddddeeee0001', 'b2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', 'Hong Kong es otra dimension', '{"avatar": "https://i.pravatar.cc/150?u=carlos_adventure", "username": "carlos_adventure"}')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 6. POST RATINGS
-- Likes from users (using session_id for anonymous likes)
-- The post_ratings table only has: id, post_id, session_id, created_at
-- =============================================================================
INSERT INTO public.post_ratings (post_id, session_id) VALUES
    -- Ratings for Maria's Machu Picchu post
    ('10010003-aaaa-bbbb-cccc-ddddeeee0003', 'session-carlos-001'),
    ('10010003-aaaa-bbbb-cccc-ddddeeee0003', 'session-lucia-001'),
    ('10010003-aaaa-bbbb-cccc-ddddeeee0003', 'session-pedro-001'),
    ('10010003-aaaa-bbbb-cccc-ddddeeee0003', 'session-ana-001'),

    -- Ratings for Carlos's Aconcagua post
    ('20020001-aaaa-bbbb-cccc-ddddeeee0001', 'session-maria-001'),
    ('20020001-aaaa-bbbb-cccc-ddddeeee0001', 'session-lucia-001'),
    ('20020001-aaaa-bbbb-cccc-ddddeeee0001', 'session-ana-001'),

    -- Ratings for Lucia's polar bear post (most popular)
    ('50050001-aaaa-bbbb-cccc-ddddeeee0001', 'session-maria-001'),
    ('50050001-aaaa-bbbb-cccc-ddddeeee0001', 'session-carlos-001'),
    ('50050001-aaaa-bbbb-cccc-ddddeeee0001', 'session-pedro-001'),
    ('50050001-aaaa-bbbb-cccc-ddddeeee0001', 'session-ana-001'),
    ('50050001-aaaa-bbbb-cccc-ddddeeee0001', 'session-visitor-001'),

    -- Ratings for Lucia's aurora post
    ('50050002-aaaa-bbbb-cccc-ddddeeee0002', 'session-maria-001'),
    ('50050002-aaaa-bbbb-cccc-ddddeeee0002', 'session-carlos-001'),
    ('50050002-aaaa-bbbb-cccc-ddddeeee0002', 'session-pedro-001'),

    -- Ratings for Pedro's Hong Kong post
    ('40040001-aaaa-bbbb-cccc-ddddeeee0001', 'session-maria-001'),
    ('40040001-aaaa-bbbb-cccc-ddddeeee0001', 'session-lucia-001'),
    ('40040001-aaaa-bbbb-cccc-ddddeeee0001', 'session-ana-001'),

    -- Ratings for Ana's croissant post
    ('30030003-aaaa-bbbb-cccc-ddddeeee0003', 'session-lucia-001'),
    ('30030003-aaaa-bbbb-cccc-ddddeeee0003', 'session-maria-001'),
    ('30030003-aaaa-bbbb-cccc-ddddeeee0003', 'session-carlos-001')
ON CONFLICT (post_id, session_id) DO NOTHING;

-- =============================================================================
-- Summary of seeded data:
-- - 5 authenticated users with profiles
-- - 15 authenticated posts (linked to profiles via profile_id)
-- - 3 anonymous posts (backward compatibility)
-- - 13 comments across various posts
-- - 20 post ratings
--
-- Test credentials:
-- Email: maria@example.com, carlos@example.com, ana@example.com,
--        pedro@example.com, lucia@example.com
-- Password: password123 (for all users)
-- =============================================================================
