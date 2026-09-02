import type { Metadata, Viewport } from "next";
import { Archivo, Bevan, DM_Mono, Oswald } from "next/font/google";
import { BRAND_NAME } from "@tyche/config";
import { PwaRegistrar } from "./PwaRegistrar";
import "./globals.css";
import "../features/public-site/public.css";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  weight: ["400", "600", "700"],
});
const bevan = Bevan({ subsets: ["latin"], variable: "--font-bevan", weight: "400" });
const dmMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-dm-mono",
  weight: ["400", "500"],
});
const oswald = Oswald({
  subsets: ["latin"],
  variable: "--font-oswald",
  weight: ["400", "500", "600", "700"],
});

function getMetadataBase() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    return new URL(configured);
  }
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("NEXT_PUBLIC_SITE_URL is required in production.");
  }
  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  applicationName: BRAND_NAME,
  metadataBase: getMetadataBase(),
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: BRAND_NAME,
  },
  title: BRAND_NAME,
  description: "Mobile-first Solana DApp for community-elected lottery rules.",
  openGraph: {
    description: "Play, inspect community rules, and verify every Tywish round.",
    siteName: BRAND_NAME,
    title: BRAND_NAME,
    type: "website",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png?v=goddess-magenta-v1",
    icon: [
      { rel: "icon", sizes: "32x32", type: "image/png", url: "/icons/favicon-32.png?v=goddess-magenta-v1" },
      { rel: "icon", sizes: "192x192", type: "image/png", url: "/icons/icon-192.png?v=goddess-magenta-v1" },
      { rel: "icon", sizes: "512x512", type: "image/png", url: "/icons/icon-512.png?v=goddess-magenta-v1" },
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
    <html className={`${archivo.variable} ${bevan.variable} ${dmMono.variable} ${oswald.variable}`} lang="en">
      <body>
        <PwaRegistrar />
        {children}
      </body>
    </html>
  );
}
