"use client";

import { Ico } from "../tyche/shared";

/**
 * Server sections of the landing page cannot index into the client `Ico`
 * object, so they render the shared stroke icons through this boundary.
 */
export function LandingIcon({ name }: { name: keyof typeof Ico }) {
  const Icon = Ico[name];
  return <Icon aria-hidden="true" focusable="false" />;
}
