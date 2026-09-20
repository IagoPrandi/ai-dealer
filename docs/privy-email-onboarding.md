# Privy email onboarding

Tyche supports passwordless email onboarding through Privy while retaining a
Solana wallet as the only player identity used by the program and public API.
Email addresses, Privy user IDs, and Privy session material are never sent to
the Tyche API or included in an on-chain instruction.

## Provisioning

1. Create/select the Privy application for the intended Tyche environment.
2. Enable **Email** login with one-time passcodes in the Privy dashboard.
3. Enable Solana embedded wallets and allow automatic creation on login.
4. Add every approved browser origin in the Privy dashboard, including the
   exact local development origin (for example `http://localhost:3000`) and
   each production HTTPS origin.
5. Set `NEXT_PUBLIC_PRIVY_APP_ID` in the deployment environment. Production
   rendering fails clearly when this value is absent.

Do not enable Google OAuth for this release. It is a roadmap item that may be
added later as a linked login method for the same Privy user and wallet.

## Player behavior

`Continue with email` opens Privy's OTP flow. Any inbox provider, including
Gmail, uses that same path; there is no Google login button. On successful OTP
login Privy creates a self-custodial Solana embedded wallet. The player must
fund its displayed devnet address with their own SOL before submitting a paid
action. Tyche does not sponsor fees, relay transactions, provide an on-ramp,
or fund wallets automatically.

An explicitly selected external Wallet Standard wallet is used for that page
session. The Account screen lets a player switch between an external wallet and
their signed-in email wallet. Each transaction is signed by the active wallet;
there is no fallback from one signer to the other.

## Manual devnet validation

1. Visit `/play`, choose **Continue with email**, and complete OTP.
2. Confirm the receive address in **Account**, copy it, and fund it with
   devnet SOL.
3. Submit a guess, vote, and claim using the email wallet.
4. Choose an external mobile wallet, repeat the same actions, then switch back
   to the email wallet and verify its address is retained.
5. Reject an OTP/signing request and verify the UI reports the failure without
   switching wallets.
