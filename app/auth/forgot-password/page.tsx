"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/utils/client";
import { BackIcon } from "@/app/components/icons";
import { Button } from "@/app/components/Button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    // Use NEXT_PUBLIC_SITE_URL for production, fallback to window.location.origin for development
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl}/auth/callback?next=/auth/reset-password`,
      });

      if (error) throw error;

      setMessage({
        type: "success",
        text: "Revisa tu correo electronico. Te hemos enviado un enlace para restablecer tu contrasena."
      });
      setEmail("");
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Error al enviar el correo",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 relative">
      {/* Back Button */}
      <div className="absolute top-6 left-6">
        <Button
          variant="accent"
          size="sm"
          href="/auth/login"
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
          <p className="text-foreground/60 mt-2">Recupera tu contrasena</p>
        </div>

        {/* Description */}
        <p className="text-foreground/70 text-sm text-center mb-6">
          Ingresa tu correo electronico y te enviaremos un enlace para restablecer tu contrasena.
        </p>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Correo electronico"
            required
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
            {isLoading ? "Enviando..." : "Enviar enlace"}
          </Button>
        </form>

        {/* Link a login */}
        <p className="text-center text-foreground/60 mt-6">
          Recordaste tu contrasena?{" "}
          <Link href="/auth/login" className="text-primary hover:underline">
            Inicia sesion
          </Link>
        </p>
      </div>
    </div>
  );
}
