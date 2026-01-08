import { redirect } from "next/navigation";
import { createClient } from "../utils/supabase/server";
import PostForm from "./PostForm";

/**
 * Post Creation Page - Protected Route
 *
 * This page requires authentication. Anonymous users are redirected to login.
 * Authenticated users see the PostForm with their profile information.
 */
export default async function PostPage() {
  const supabase = await createClient();

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Redirect anonymous users to login with return URL
    redirect("/auth/login?redirect=/post&message=Inicia sesion para crear un post");
  }

  // Fetch user's profile
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    // User exists but no profile - redirect to profile creation
    redirect("/profile/create?message=Crea tu perfil para publicar");
  }

  return (
    <PostForm
      user={{
        id: user.id,
        email: user.email,
      }}
      profile={{
        id: profile.id,
        username: profile.username,
        avatar_url: profile.avatar_url,
      }}
    />
  );
}
