---
name: privy-production-release
description: Gate Tyche Vercel and AWS production releases that use Privy email wallets. Use when preparing, deploying, promoting, or reviewing a production release; do not use for local or devnet-only development.
---

# Privy Production Release

Use this skill before a user-facing Vercel production deployment or AWS backend
release that supports the Privy-enabled player DApp. Treat every unchecked gate
as a release blocker. This skill does not authorize a deployment by itself;
perform external mutations only when the user explicitly requests that release.

## Scope and invariants

- The current working environment is development. Do not alter local `.env`,
  development, preview, or devnet Privy configuration while preparing this
  checklist.
- Privy has separate development and production apps. The production web build
  must receive the production app's `NEXT_PUBLIC_PRIVY_APP_ID` through the
  **Production** scope of the Vercel player-web project. Never hard-code an app
  ID or copy it into tracked environment files.
- `NEXT_PUBLIC_PRIVY_APP_ID` is browser-visible configuration, not a secret.
  Privy app secrets, session tokens, user IDs, email addresses, wallet keys,
  and AWS credentials are never browser variables or release-log values.
- AWS hosts the API and worker; it must not receive a Privy app ID. Its
  `WEB_ORIGIN` and `TYCHE_WORKER_CORS_ORIGINS` must exactly match the deployed
  player-web origins that are allowed to call it.
- Do not enable real-SOL/mainnet value flow unless the PRD M9 readiness gates
  are complete and confirmed separately.

## Required evidence before deployment

Read `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `infra/aws/README.md`, the
current `apps/web/next.config.ts`, `apps/web/vercel.json`, and the Privy
configuration before declaring this gate ready. Report every result as
**passed**, **failed**, or **not verifiable**; do not self-attest dashboard
settings that cannot be inspected.

### 1. Privy dashboard and identity controls

For the production Privy application, obtain dashboard evidence that:

1. Allowed domains contain only the exact, live player-web production origins.
   Remove `localhost`, LAN IPs, temporary tunnels, and unused preview domains.
   Do not add API, worker, RPC, wallet, or Privy service hostnames as allowed
   application domains.
2. Email OTP is enabled. SMS is disabled. OAuth providers are disabled unless
   an explicitly approved release adds one.
3. Email OTP users are required to use MFA with a passkey or authenticator app
   before a wallet holding meaningful value can be accessed.
4. The production domain has been verified and Privy HttpOnly cookies are
   enabled. Record the chosen, reviewed session duration; do not silently use
   the 30-day default.
5. Embedded Solana wallets are enabled for the intended cluster and the
   recovery options and user-facing self-custody education are reviewed.

Use the current official Privy guides as the authority:

- https://docs.privy.io/security/implementation-guide/security-checklist
- https://docs.privy.io/security/implementation-guide/content-security-policy

### 2. CSP and anti-clickjacking

The player web app must emit an enforced `Content-Security-Policy` HTTP header
on every route. A `<meta>` tag is insufficient for `frame-ancestors`.

Require at minimum a restrictive policy equivalent to Privy's current Next.js
guidance, adapted only for services this application actually uses:

- `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'`, `worker-src 'self'`, and `manifest-src 'self'`;
- `frame-ancestors 'none'`, plus `X-Frame-Options: DENY` for legacy clients;
- `child-src` and `frame-src` allowing only `https://auth.privy.io`,
  `https://verify.walletconnect.com`, and `https://verify.walletconnect.org`,
  plus CAPTCHA hosts only when CAPTCHA is enabled;
- `connect-src` allowing only the application origins, `https://auth.privy.io`,
  the WalletConnect relay/explorer hosts required by the SDK, the configured
  Solana RPC host, and `https://*.rpc.privy.systems` when Privy's RPC is used;
- no `unsafe-eval`; keep `script-src` as strict as the built Next.js app
  permits. Any `unsafe-inline` exception requires a documented dependency
  reason and staging evidence.

Inspect the source configuration and the response headers from each live
production origin after deployment. Run the email OTP, embedded-wallet,
external-wallet, mobile wallet, logout, and transaction flows under enforcing
CSP. First use `Content-Security-Policy-Report-Only` in staging when a policy
is new or materially changed; promote only after resolving relevant reports.

### 3. Production CORS and AWS edge

Check Terraform's `web_origins`, the resolved AWS `WEB_ORIGIN`, and
`TYCHE_WORKER_CORS_ORIGINS` against the same exact player-web origin list.
Production code must not implicitly allow localhost, LAN addresses, tunnels,
or wildcards. Validate rejected origins do not receive an
`Access-Control-Allow-Origin` response.

Keep the AWS Caddy path allowlist and private settlement boundary intact. Run
the documented AWS health and deny-by-default smoke tests after rollout.

### 4. Production App ID promotion

Only after the dashboard gates above pass:

1. Identify the production Privy app ID from the Privy dashboard. If it is not
   available, stop and ask the user for it; never infer it from a development
   app or create a replacement.
2. Set `NEXT_PUBLIC_PRIVY_APP_ID` on the **web Vercel project, Production
   scope only**. Remove an obsolete Production value first if the Vercel UI or
   CLI requires replacement. Do not assign the production ID to Preview or
   Development.
3. Confirm the value is not the development Privy app ID without printing
   either identifier in logs. A fresh Vercel production build is mandatory,
   because `NEXT_PUBLIC_*` variables are embedded at build time.
4. Verify the build fails if this variable is absent; the existing
   `resolvePrivyAppId` production check must remain in place.

## Release order

1. Complete source, CSP, unit, lint, typecheck, build, dependency/secret-scan,
   and infrastructure-plan checks.
2. Obtain the dashboard evidence and configure the production App ID as above.
3. Deploy AWS configuration only after the CORS origin set is exact, then run
   its smoke tests.
4. Deploy the Vercel production build. Verify CSP, X-Frame-Options, CORS, and
   the allowed-domain behavior against the live custom domain.
5. Exercise OTP -> embedded address -> funding -> transaction -> logout, then
   repeat with an external mobile wallet. Record only pass/fail and redacted
   identifiers.
6. Update the Work Log and Progress Tracker with the evidence, unresolved
   gates, deployed commit and domains. Do not tick a milestone without user
   confirmation.

## Stop conditions

Stop the release and report the exact failed gate if the production app ID is
missing or points to development, any dashboard item lacks evidence, CSP or
anti-clickjacking headers are absent, CORS accepts a non-production origin, a
production origin does not resolve over HTTPS, or any required wallet flow is
blocked. Never weaken CSP, CORS, MFA, or domain restrictions merely to make a
deployment succeed.
