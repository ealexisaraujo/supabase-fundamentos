-- Make username nullable to support the profile creation flow
-- Users set their username after registration via /profile/create
ALTER TABLE public.profiles ALTER COLUMN username DROP NOT NULL;
