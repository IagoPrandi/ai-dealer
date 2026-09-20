const LOCAL_BROWSER_ORIGIN_PATTERN =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

export function resolveAllowedCorsOrigin({
  configuredOrigins,
  isProduction,
  origin,
}: {
  configuredOrigins: string | undefined;
  isProduction: boolean;
  origin: string | undefined;
}): string | null {
  if (!origin) {
    return null;
  }

  const allowedOrigins = (configuredOrigins ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (
    allowedOrigins.includes(origin) ||
    (!isProduction && LOCAL_BROWSER_ORIGIN_PATTERN.test(origin))
  ) {
    return origin;
  }

  return null;
}
