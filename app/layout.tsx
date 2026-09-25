import type { Metadata } from "next";
import { Archivo, Archivo_Narrow, IBM_Plex_Mono, Newsreader } from "next/font/google";

import "./globals.css";

// Archivo throughout, Narrow for dense metadata rows. Same superfamily, so it
// reads as one voice at two densities.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const archivoNarrow = Archivo_Narrow({
  variable: "--font-archivo-narrow",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Long-form prose and placeholder covers only. Italic is for titles set inside
// running text.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
});

// Mono is for literal codes only. Plex Mono is a grotesque like Archivo, so the
// two sit together without announcing themselves.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "bookshelf",
  description: "Self-hosted book tracker",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${archivoNarrow.variable} ${newsreader.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
