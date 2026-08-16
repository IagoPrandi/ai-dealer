import type { Metadata, Viewport } from "next";
import { PwaRegistrar } from "./PwaRegistrar";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Tyche",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tyche",
  },
  title: "Tyche",
  description: "Mobile-first Solana DApp for community-elected lottery rules.",
  icons: {
    apple: "/icons/apple-touch-icon.png?v=blindfolded-bust-transparent-v2",
    icon: [
      { rel: "icon", sizes: "32x32", type: "image/png", url: "/icons/favicon-32.png?v=blindfolded-bust-transparent-v2" },
      { rel: "icon", sizes: "192x192", type: "image/png", url: "/icons/icon-192.png?v=blindfolded-bust-transparent-v2" },
      { rel: "icon", sizes: "512x512", type: "image/png", url: "/icons/icon-512.png?v=blindfolded-bust-transparent-v2" },
    ],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#170B22",
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
          href="https://fonts.googleapis.com/css2?family=Bevan&family=Oswald:wght@400;500;600;700&family=DM+Mono:wght@400;500&family=Archivo:wght@400;600;700&display=swap"
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
