import { redirect } from "next/navigation";
import { createClient } from "../utils/supabase/server";

export default async function ProfilePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  // Only redirect to profile page if user has set a username
  // Otherwise, redirect to create page to set username
  if (profile?.username) {
    redirect(`/profile/${profile.username}`);
  } else {
    redirect("/profile/create");
  }
}
