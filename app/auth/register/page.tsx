"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/utils/client";
import { BackIcon } from "@/app/components/icons";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    if (password !== confirmPassword) {
      setMessage({ type: "error", text: "Las contraseñas no coinciden" });
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      setMessage({ 
        type: "success", 
        text: "¡Registro exitoso! Revisa tu correo para confirmar tu cuenta." 
      });
      setEmail("");
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Error al registrarse",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 relative">
      {/* Back Button */}
      <Link 
        href="/"
        className="absolute top-6 left-6 flex items-center gap-2 px-6 py-2 rounded-full text-sm font-semibold bg-gradient-to-r from-[#a3e635] to-[#bef264] text-black shadow-md hover:shadow-lg hover:brightness-105 transition-all transform hover:-translate-y-0.5"
        aria-label="Volver al inicio"
      >
        <BackIcon className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
        <span className="text-sm font-medium">Volver</span>
      </Link>

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Suplatzigram
          </h1>
          <p className="text-foreground/60 mt-2">Crea tu cuenta</p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Correo electrónico"
            required
            className="w-full px-4 py-3 rounded-xl bg-card-bg border border-border text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            required
            minLength={6}
            className="w-full px-4 py-3 rounded-xl bg-card-bg border border-border text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />

          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirmar contraseña"
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

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Registrando..." : "Registrarse"}
          </button>
        </form>

        {/* Link a login */}
        <p className="text-center text-foreground/60 mt-6">
          ¿Ya tienes cuenta?{" "}
          <Link href="/auth/login" className="text-primary hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
