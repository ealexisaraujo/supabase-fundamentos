"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/utils/client";
import { BackIcon } from "@/app/components/icons";
import { Button } from "@/app/components/Button";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    // Check if user has a valid session (from password recovery link)
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        // No session means the user didn't come from a valid recovery link
        router.push("/auth/forgot-password");
        return;
      }

      setIsCheckingSession(false);
    };

    checkSession();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    if (password !== confirmPassword) {
      setMessage({ type: "error", text: "Las contrasenas no coinciden" });
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setMessage({ type: "error", text: "La contrasena debe tener al menos 6 caracteres" });
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      setMessage({
        type: "success",
        text: "Contrasena actualizada exitosamente! Redirigiendo..."
      });

      // Redirect to home after a short delay
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 2000);

    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Error al actualizar la contrasena",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-foreground/60 mt-4">Verificando sesion...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 relative">
      {/* Back Button */}
      <div className="absolute top-6 left-6">
        <Button
          variant="accent"
          size="sm"
          href="/"
          leftIcon={<BackIcon className="w-4 h-4" />}
        >
          Volver
        </Button>
      </div>

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Suplatzigram
          </h1>
          <p className="text-foreground/60 mt-2">Crea una nueva contrasena</p>
        </div>

        {/* Description */}
        <p className="text-foreground/70 text-sm text-center mb-6">
          Ingresa tu nueva contrasena. Debe tener al menos 6 caracteres.
        </p>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nueva contrasena"
            required
            minLength={6}
            className="w-full px-4 py-3 rounded-xl bg-card-bg border border-border text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />

          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirmar nueva contrasena"
            required
            minLength={6}
            className="w-full px-4 py-3 rounded-xl bg-card-bg border border-border text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />

          {/* Mensaje de estado */}
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

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            disabled={isLoading}
          >
            {isLoading ? "Actualizando..." : "Actualizar contrasena"}
          </Button>
        </form>
      </div>
    </div>
  );
}
