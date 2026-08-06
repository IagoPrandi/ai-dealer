import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tyche Admin",
  description: "Restricted operational insights console for Tyche."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
