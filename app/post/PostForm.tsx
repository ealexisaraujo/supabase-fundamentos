"use client";

/**
 * PostForm - Authenticated Post Creation Form
 *
 * This component handles post creation for authenticated users.
 * It receives user and profile data from the server component
 * and creates posts associated with the user's profile.
 */

import { useState, useRef } from "react";
import Image from "next/image";
import { supabase } from "../utils/client";
import { CloseIcon } from "../components/icons";
import { ThemeToggle } from "../components/ThemeToggle";
import { revalidatePostsCache } from "../actions/revalidate-posts";
import { revalidateProfileCache } from "../actions/revalidate-profiles";

interface PostFormProps {
  user: {
    id: string;
    email?: string;
  };
  profile: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
}

export default function PostForm({ user, profile }: PostFormProps) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadAndCreatePost = async (file: File) => {
    // 1. Prepare filename
    const fileExt = file.name.split(".").pop();
    const fileName = file.name.substring(0, file.name.lastIndexOf("."));
    const sanitizedFileName = fileName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const finalFileName = `${sanitizedFileName}-${Date.now()}.${fileExt}`;
    const filePath = `posts/${user.id}/${finalFileName}`;

    // 2. Upload to storage bucket
    const { error: uploadError } = await supabase.storage
      .from("images_platzi")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading image:", uploadError);
      throw uploadError;
    }

    // 3. Get public URL
    const { data: urlData } = supabase.storage
      .from("images_platzi")
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;

    console.log("Image uploaded:", publicUrl);

    // 4. Create post with user and profile association
    const { data: postData, error: postError } = await supabase
      .from("posts_new")
      .insert({
        user_id: user.id,
        profile_id: profile.id,
        image_url: publicUrl,
        caption: caption,
        likes: 0,
        user: {
          username: profile.username,
          avatar: profile.avatar_url || "",
        },
      })
      .select("*");

    if (postError) {
      console.error("Error creating post:", postError);
      throw postError;
    }

    console.log("Post created:", postData);

    return {
      uploadedImageUrl: publicUrl,
      newPost: postData,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!imageFile) {
      setMessage({ type: "error", text: "Por favor selecciona una imagen" });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      await uploadAndCreatePost(imageFile);

      // Invalidate both posts and profile caches
      await revalidatePostsCache();
      await revalidateProfileCache(profile.username);

      // Hard navigation to home - bypasses all client-side caching
      window.location.href = "/";
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Error al crear el post",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card-bg border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="w-10" />
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Crear Post
          </h1>
          <ThemeToggle />
        </div>
      </header>

      {/* Form */}
      <main className="max-w-lg mx-auto px-4 py-8">
        {/* Creator info */}
        <div className="flex items-center gap-3 mb-6 p-3 bg-card-bg rounded-xl border border-border">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/10">
            {profile.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt={profile.username}
                width={40}
                height={40}
                className="object-cover w-full h-full"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-primary font-bold">
                {profile.username[0].toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <span className="font-medium text-foreground">@{profile.username}</span>
            <p className="text-xs text-foreground/60">Publicando como</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Image upload area */}
          <div className="flex flex-col gap-2">
            {imagePreview ? (
              <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-card-bg border border-border">
                <Image
                  src={imagePreview}
                  alt="Preview"
                  fill
                  className="object-cover"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                  aria-label="Eliminar imagen"
                >
                  <CloseIcon />
                </button>
              </div>
            ) : (
              <label
                htmlFor="image-upload"
                className="flex flex-col items-center justify-center gap-3 aspect-square w-full rounded-xl border-2 border-dashed border-border bg-card-bg cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
              >
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-8 h-8 text-primary"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
                    />
                  </svg>
                </div>
                <span className="text-foreground/60 text-sm">
                  Haz clic para seleccionar una imagen
                </span>
              </label>
            )}

            <input
              ref={fileInputRef}
              id="image-upload"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
            />
          </div>

          {/* Caption */}
          <div className="flex flex-col gap-2">
            <textarea
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Escribe algo sobre tu foto..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-card-bg border border-border text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          {/* Status message */}
          {message && (
            <div
              className={`px-4 py-3 rounded-xl text-sm ${
                message.type === "success"
                  ? "bg-green-500/10 text-green-500 border border-green-500/20"
                  : "bg-red-500/10 text-red-500 border border-red-500/20"
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isLoading || !imageFile}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Publicando...
              </>
            ) : (
              "Publicar"
            )}
          </button>
        </form>
      </main>
    </div>
  );
}
