"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "../utils/client";
import { CameraIcon } from "./icons";
import { Button } from "./Button";
import { shouldSkipImageOptimization } from "../utils/image";

interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  website: string | null;
}

interface ProfileEditFormProps {
  initialProfile?: Profile | null;
  onSuccess?: (profile: Profile) => void;
  isCreating?: boolean;
}

export default function ProfileEditForm({
  initialProfile,
  onSuccess,
  isCreating = false,
}: ProfileEditFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [formData, setFormData] = useState({
    username: initialProfile?.username || "",
    full_name: initialProfile?.full_name || "",
    bio: initialProfile?.bio || "",
    website: initialProfile?.website || "",
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    initialProfile?.avatar_url || null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialProfile) {
      setFormData({
        username: initialProfile.username,
        full_name: initialProfile.full_name || "",
        bio: initialProfile.bio || "",
        website: initialProfile.website || "",
      });
      setAvatarPreview(initialProfile.avatar_url);
    }
  }, [initialProfile]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadAvatar = async (userId: string) => {
    if (!avatarFile) return null;

    const fileExt = avatarFile.name.split(".").pop();
    const fileName = `${userId}-${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("images_platzi")
      .upload(filePath, avatarFile, {
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from("images_platzi")
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No estás autenticado");

      let avatarUrl = initialProfile?.avatar_url;

      if (avatarFile) {
        const uploadedUrl = await uploadAvatar(user.id);
        if (uploadedUrl) avatarUrl = uploadedUrl;
      }

      const updates = {
        id: user.id,
        username: formData.username,
        full_name: formData.full_name,
        bio: formData.bio,
        website: formData.website,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      };

      const { error, data } = await supabase
        .from("profiles")
        .upsert(updates)
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          throw new Error("El nombre de usuario ya existe");
        }
        throw error;
      }

      if (onSuccess && data) {
        onSuccess(data);
      } else {
        router.push(`/profile/${data.username}`);
        router.refresh();
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Error al guardar perfil",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 w-full max-w-md mx-auto">
      <div className="flex flex-col items-center gap-4">
        <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
          <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-border bg-card-bg relative">
            {avatarPreview ? (
              <Image
                src={avatarPreview}
                alt="Avatar"
                fill
                className="object-cover"
                unoptimized={shouldSkipImageOptimization(avatarPreview)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-primary/10">
                <CameraIcon />
              </div>
            )}
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <CameraIcon />
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="hidden"
          />
        </div>
        <p className="text-sm text-foreground/60">Toca para cambiar foto</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Username</label>
          <input
            type="text"
            required
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            className="w-full px-4 py-2 rounded-lg bg-card-bg border border-border focus:ring-2 focus:ring-primary/50 outline-none"
            placeholder="username"
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Nombre completo</label>
          <input
            type="text"
            value={formData.full_name}
            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            className="w-full px-4 py-2 rounded-lg bg-card-bg border border-border focus:ring-2 focus:ring-primary/50 outline-none"
            placeholder="John Doe"
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Bio</label>
          <textarea
            value={formData.bio}
            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
            className="w-full px-4 py-2 rounded-lg bg-card-bg border border-border focus:ring-2 focus:ring-primary/50 outline-none resize-none"
            rows={3}
            placeholder="Cuéntanos sobre ti..."
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Website</label>
          <input
            type="url"
            value={formData.website}
            onChange={(e) => setFormData({ ...formData, website: e.target.value })}
            className="w-full px-4 py-2 rounded-lg bg-card-bg border border-border focus:ring-2 focus:ring-primary/50 outline-none"
            placeholder="https://example.com"
          />
        </div>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-green-500/10 text-green-500"
              : "bg-red-500/10 text-red-500"
          }`}
        >
          {message.text}
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        disabled={loading}
      >
        {loading ? "Guardando..." : isCreating ? "Crear Perfil" : "Guardar Cambios"}
      </Button>
    </form>
  );
}
