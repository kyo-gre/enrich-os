import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppShell } from "../components/layout/app-shell";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Enrich OS — Creator Identity Enricher",
  description: "Local creator identity enrichment for influencer outreach.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="h-full font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
