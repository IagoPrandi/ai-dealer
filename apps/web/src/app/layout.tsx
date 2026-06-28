import type { Metadata, Viewport } from "next";
import { PwaRegistrar } from "./PwaRegistrar";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Idealer",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Idealer",
  },
  title: "Idealer",
  description: "Mobile-first Solana DApp for community-elected lottery rules.",
  icons: {
    apple: "/icons/icon-192.svg",
    icon: [
      { rel: "icon", url: "/icons/icon-192.svg" },
      { rel: "icon", sizes: "512x512", url: "/icons/icon-512.svg" },
    ],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0b0910",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link crossOrigin="anonymous" rel="preconnect" href="https://fonts.gstatic.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Sora:wght@500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <PwaRegistrar />
        {children}
      </body>
    </html>
  );
}
