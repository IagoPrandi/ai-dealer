import { CREATOR_REWARD_RATE_BPS, TURN_DURATION_CYCLE_HOURS } from "@idealer/constants";

export default function HomePage() {
  return (
    <main style={{ minHeight: "100dvh", padding: "24px", display: "grid", alignContent: "center" }}>
      <section style={{ maxWidth: "520px" }}>
        <p style={{ color: "var(--accent)", fontWeight: 700, margin: "0 0 12px" }}>Live Round Hub</p>
        <h1 style={{ fontSize: "clamp(36px, 10vw, 64px)", lineHeight: 1, margin: "0 0 16px" }}>
          Idealer
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "18px", lineHeight: 1.5, margin: "0 0 24px" }}>
          Pick your numbers. Vote for the rule. Watch the game change.
        </p>
        <dl style={{ display: "grid", gap: "12px", margin: 0 }}>
          <div>
            <dt style={{ color: "var(--muted)" }}>Turn cycle</dt>
            <dd style={{ margin: 0 }}>{TURN_DURATION_CYCLE_HOURS.join("h -> ")}h</dd>
          </div>
          <div>
            <dt style={{ color: "var(--muted)" }}>Creator reward</dt>
            <dd style={{ margin: 0 }}>{CREATOR_REWARD_RATE_BPS / 100}% of each alternative winner payout</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
