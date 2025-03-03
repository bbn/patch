import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
// Force Tailwind to be included
import "tailwindcss/tailwind.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "patch.land",
  description: "Graphical reactive programming environment",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <header className="border-b py-2">
          <div className="container mx-auto flex items-center">
            <h1 className="text-xl font-bold mr-8">
              <Link href="/">patch.land</Link>
            </h1>
            <nav className="flex space-x-6">
              <Link href="/" className="hover:text-blue-600 transition-colors">
                Gears
              </Link>
              <Link href="/patches" className="hover:text-blue-600 transition-colors">
                Patches
              </Link>
            </nav>
          </div>
        </header>
        <main>
          {children}
        </main>
      </body>
    </html>
  );
}
