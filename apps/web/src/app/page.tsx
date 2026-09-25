import type { Metadata } from "next";

import { BRAND_NAME } from "@tyche/config";

import { LandingPage } from "../features/landing/LandingPage";

export const metadata: Metadata = {
  title: `${BRAND_NAME} — You write the rule. The house doesn’t.`,
  description: "Pick your numbers. Write how winning works. Watch the AI turn it into something the game can enforce.",
  openGraph: {
    title: `${BRAND_NAME} — You write the rule. The house doesn’t.`,
    description: "Pick your numbers. Write how winning works. Watch the AI turn it into something the game can enforce.",
    siteName: BRAND_NAME,
    type: "website",
  },
};

export default function HomePage() {
  return <LandingPage />;
}
