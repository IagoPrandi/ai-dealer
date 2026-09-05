# Desktop system (1024 px and above)

Use this reference for the playable Tyche DApp. The exact visual source is
`design_handoff_desktop/Tyche Desktop.dc.html`; `desktop.css` and `markup.md` beside it are the
implementation handoff. The extracted `support.js` is only the generated Design Component
runtime and must not be copied into the Next.js app.

## Desktop-only contract

- Apply desktop layout only inside `@media (min-width: 1024px)`.
- Keep the mobile markup and interaction order intact. Add `.ide-deck` wrappers, which are
  `display: contents` below 1024px, and `.ide-desktop-only` companions when desktop needs
  information that mobile reveals in a later step.
- Do not use `matchMedia` or render-time width checks to replace a transactional flow. A user
  may resize without losing a number selection, draft, wallet state, or pending transaction.
- Keep `/dev/gallery` phone previews isolated from desktop shell chrome.

## Shell geometry

| Region | Geometry |
| --- | --- |
| Rail | 260px, `#0C0512`, right inset hairline |
| Context bar | 70px, 32px inline padding, bottom inset hairline |
| Content | maximum 1120px, 26px top / 32px inline / 30px bottom |
| Default columns | `minmax(0, 1fr) 400px`, 30px gap |
| Rules | `minmax(0, 1fr) 440px` |
| Play | `minmax(0, 1fr) 360px` |
| Create | `minmax(0, 1fr) 420px`, no column gap |
| Account | `400px minmax(0, 1fr)` |

The rail always shows brand/environment, Round, Rules, Rewards, Account, one yellow “Create a
rule” action, live round state, and wallet state. The active route changes; the rail geometry
does not. Secondary screens keep the rail on desktop even when mobile hides bottom navigation.

## Screen composition

- Home: full-width round bar; metrics and ranked rules on the left; live activity and previous
  result on the right. Rule creation lives in the rail, not in the desktop Home content.
- Play: 10-column number grid and controls on the left; sticky selected-number review and
  submit action on the right. Confirmation is a centered 620px dialog.
- Rules: tabs above a master list; selected rule detail and vote actions in a sticky 440px
  panel. Do not show the mobile detail sheet on desktop.
- Create: 720px chat column plus 420px interpretation panel. Keep the composer attached to the
  chat column and the final submit action in the interpretation panel.
- Result and Rewards: main evidence/activity on the left; outcome or action summary on the
  right.
- Account: wallet/claim summary at 400px on the left; rules, conversations, and history on the
  right.
- Claims: dense rows/table treatment. My guesses: current guesses in a two-column card grid.
  Invite: link and attribution on the left, reward explanation on the right.
- Share, Connect, and Draw result: centered cards at 680px, 540px, and 760px respectively.
- A rule opened outside the Rules master/detail screen uses a centered 680px square dialog
  with no mobile drag handle. Keep the inset ring, cyan solid shadow, square 44px close action,
  compact typography, and a viewport-safe maximum height. Never stretch the mobile sheet.

## Desktop primitives

- `.ide-roundbar`: square surface, inset ring, 6px orange solid shadow, prize/timer/actions in
  one row. Keep primary button text on one line.
- `.ide-detail`: square `#0F0618` panel with inset ring and 5px cyan solid shadow.
- `.ide-table`: compact grid rows separated by hairlines; values right-aligned in DM Mono.
- Number picker: ten columns, at least 44px high per cell, yellow hover only on unselected
  cells.
- Buttons with a right/down solid shadow reserve 3px so full-width actions do not clip.

## Verification

Inspect at 1024x768 and 1440x880, then re-check 390x844 and 320x568. Confirm no horizontal
overflow, no duplicated mobile/desktop headers, no clipped rail or action text, keyboard focus
on every control, and unchanged mobile navigation and transaction steps.
