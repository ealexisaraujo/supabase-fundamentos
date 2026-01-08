"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../utils/client";
import ProfileEditForm from "../../components/ProfileEditForm";
import { ThemeToggle } from "../../components/ThemeToggle";

export default function CreateProfilePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }

      // Check if profile already exists
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single();

      if (profile) {
        router.replace(`/profile/${profile.username}`);
      }
      setChecking(false);
    };
    checkUser();
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card-bg border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">Crear Perfil</h1>
          <ThemeToggle />
        </div>
      </header>
      
      <main className="max-w-lg mx-auto px-4 py-8">
        <ProfileEditForm isCreating />
      </main>
    </div>
  );
}
