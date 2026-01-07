import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BottomNav from "./components/BottomNav";
import { ThemeProvider } from "./context/ThemeContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://supabase-fundamentos-dun.vercel.app";

export const metadata: Metadata = {
  title: "Suplatzigram",
  description: "App inspirada en Instagram - Curso de Supabase de Platzi. Aprende a construir aplicaciones con Supabase, autenticación, base de datos en tiempo real y almacenamiento.",
  metadataBase: new URL(siteUrl),
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: siteUrl,
    siteName: "Suplatzigram",
    title: "Suplatzigram - Aprende Supabase con Platzi",
    description: "App inspirada en Instagram para el Curso de Supabase de Platzi. Comparte fotos, likes y comentarios en tiempo real.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Suplatzigram - Curso de Supabase de Platzi",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Suplatzigram - Aprende Supabase con Platzi",
    description: "App inspirada en Instagram para el Curso de Supabase de Platzi. Comparte fotos, likes y comentarios en tiempo real.",
    images: ["/og-image.png"],
    creator: "@platzi",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <div className="pb-20">
            {children}
          </div>
          <BottomNav />
        </ThemeProvider>
      </body>
    </html>
  );
}
