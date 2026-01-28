import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Disciplined Life",
  description: "Daily discipline tracking",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.webmanifest" />

        {/* iOS PWA support */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Disciplined Life" />

        {/* iOS icon */}
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />

        {/* Theme */}
        <meta name="theme-color" content="#000000" />
      </head>
      <body className="antialiased bg-black text-white">
        {children}
      </body>
    </html>
  );
}