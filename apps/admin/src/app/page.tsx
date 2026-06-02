import { CREATOR_REWARD_RESERVE_SHARE_BPS, TREASURY_FEE_BPS } from "@idealer/constants";

export default function AdminPage() {
  return (
    <main style={{ minHeight: "100dvh", padding: "32px", display: "grid", alignContent: "center" }}>
      <section style={{ maxWidth: "680px" }}>
        <p style={{ color: "var(--accent)", fontWeight: 700, margin: "0 0 12px" }}>Restricted Console</p>
        <h1 style={{ fontSize: "clamp(32px, 7vw, 56px)", lineHeight: 1, margin: "0 0 16px" }}>
          Idealer Admin
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "18px", lineHeight: 1.5, margin: "0 0 24px" }}>
          Operational insights only. This surface must not manipulate live game outcomes.
        </p>
        <dl style={{ display: "grid", gap: "12px", margin: 0 }}>
          <div>
            <dt style={{ color: "var(--muted)" }}>Treasury fee</dt>
            <dd style={{ margin: 0 }}>{TREASURY_FEE_BPS / 100}%</dd>
          </div>
          <div>
            <dt style={{ color: "var(--muted)" }}>Creator reward reserve share</dt>
            <dd style={{ margin: 0 }}>{CREATOR_REWARD_RESERVE_SHARE_BPS / 100}% of platform monetization</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
