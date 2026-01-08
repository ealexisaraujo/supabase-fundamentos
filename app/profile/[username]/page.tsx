import { notFound } from "next/navigation";
import { createClient } from "../../utils/supabase/server";
import ProfileClientPage from "./ProfileClientPage";

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const resolvedParams = await params;
  const username = resolvedParams.username;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();

  if (!profile) {
    notFound();
  }

  return <ProfileClientPage initialProfile={profile} />;
}
