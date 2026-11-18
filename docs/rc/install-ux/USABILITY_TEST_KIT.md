# Usability test kit — first-time beginner journeys

Status: **prepared, not yet run.** No participants have been recruited;
human validation (UXI-14) is BLOCKED until they are. Nothing in this kit
may be reported as a participant result until a round is actually run and
recorded with dates, candidate SHA, and environment.

## Who to recruit

- Provisioned-journey round: ~10 people with little or no CMS experience
  who might plausibly run a small site. Include phone-first users.
- Self-host round: ~5 people comfortable enough to hold a VPS login,
  starting from "you have a server and a domain" — record the help needed
  for SSH/DNS honestly; the bootstrap command does not erase those
  prerequisites.
- Screen for low familiarity and low patience for effort, never by
  insulting labels. Offer consent and recording choices up front; protect
  personal data; use disposable fixtures with synthetic content only.

## Rules for facilitators

- Give goals, not click instructions. Product-provided inline help is
  allowed and its use is recorded. A facilitator rescue counts as
  *assisted completion*, never as unaided success.
- Do not coach during a scored task. Note misunderstandings, not just
  clicks: after each task ask what the person believes is public, saved,
  or published.
- Any critical error — owner lockout, acknowledged work lost, unintended
  publication, wrong-site change — fails the round regardless of
  completion rates. Do not revise a target after seeing failures without
  recording the reason and running a fresh retest.

## Task cards (provisioned browser journey)

1. "Make a site for this project." (setup → usable private starter)
2. "Publish this short announcement with this photo." (first post →
   confirmed public view as a logged-out visitor)
3. "Change the homepage title."
4. "Find the draft you started earlier and finish it."
5. "You cancelled the passkey prompt by accident — get back in and
   finish." (injected stumble; resume path)
6. "You closed the tab before saving your recovery codes — get a new
   set." (rotation path)
7. "Something failed to send — find it and fix it." (needs-attention
   surface)
8. "Come back tomorrow and continue the unfinished setup." (next-day
   resume)

## Score sheet (per participant, per task)

- Completed unaided / assisted / abandoned
- Time (with authentication time reported separately for task 1)
- Wrong turns and retries
- Help used (inline help vs facilitator)
- Consequences (anything published, lost, or changed unintentionally)
- After-task ease: 1–5, plus one sentence in the person's own words
- Can they explain who can see their work and what was actually saved?

## Targets (internal, set before testing)

| Journey | Target |
| --- | --- |
| Provisioned setup → usable private starter | ≥9/10 unaided within 5 min |
| First post with supplied text/image → public view | ≥9/10 unaided within 3 min after setup |
| Edit homepage; find a previous draft | ≥9/10 unaided each within 2 min |
| Launch/visibility/save understanding | Zero critical exposure or data-loss errors; every misunderstanding recorded |
| Recover a removed draft; recover from an injected ordinary error | ≥9/10 unaided each within 3 min |
| Self-host bootstrap → working HTTPS claim page | ≥4/5 unaided; target 10 min after declared prerequisites on the benchmark host |
