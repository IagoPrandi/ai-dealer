import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Idealer",
  description: "Mobile-first Solana DApp for community-elected lottery rules."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
