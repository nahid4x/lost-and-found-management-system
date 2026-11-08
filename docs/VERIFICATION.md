# AI-Powered Hidden Verification & Match Scoring

Extends the existing FindIt matching/claims flow; nothing was rebuilt. Items → protected answers; Claims → server-side score; the finder reviews the score.

## How it works
1. **Found report → "Private verification" step (optional).** Up to 10 questions, each with a private answer, an *answer type* (exact text · number · description), an *importance* (1–3 in the UI, 1–5 accepted by the API) and, for numbers, an optional allowed difference. Suggestion chips per category (wallet, phone, keys, bag…).
2. **Where the answers live.** The item document stores only question metadata. The answers are in a **separate collection (`itemsecrets`)** that is read in exactly three places: the owner's `GET/PUT /items/:id/verification` and the service-token-only `GET /internal/items/:id/verification` used for scoring. Public APIs, search, map, admin lists, events and the Claims database never contain answers.
3. **Claimant → "Verify ownership".** The form shows the questions only. Blank answers are allowed but count as unanswered. Submission is **one attempt per claimant per item** and is final.
4. **Server-side scoring** (`services/shared/src/verification.js`, called by Claims at submit time; the frontend never scores):
   * text: equal after normalisation (case, spacing, punctuation, Bangla/Arabic digits);
   * number: strict numeric equality (৳, "Tk", commas ignored; `5 notes` is not a number) unless the finder set an allowed difference;
   * description: equal after normalisation = match; strong word overlap (≥ `VERIFY_DESCRIPTIVE_MIN_SIMILARITY`) = **approximate**, worth half credit and *never* counted as a match;
   * `score = Σ(weight × credit) / Σ(weight of every scorable question)`: **unanswered questions stay in the denominator, so skipping can never raise the score**. 5 equal questions with 4 correct = **80 %**.
   * Levels use configurable thresholds (`VERIFY_HIGH_THRESHOLD` 80, `VERIFY_MEDIUM_THRESHOLD` 50). No scorable answers on file ⇒ "unscored" (manual review), never 0 or 100.
5. **Finder → Claims → "AI Verification" panel:** percentage ring, "4 of 5 answers matched", High/Medium/Low badge, "Review recommended", per-question table (question · claimant's answer · ✓ ≈ ✗ —), claimant's note and proofs, and **Approve / Reject / Request more info / Contact claimant**. The panel never prints the correct answers.
6. **Request further verification / Contact claimant:** the finder sends a message (≤ 500 chars, max 3 rounds); the claimant is notified and replies with text + up to 3 private photos. (Chat stays locked until approval, as before.) This is deliberately *not* a second chance to answer the questions, which would allow guessing.

## What each party can see
| | Public | Other users | Claimant | Finder (owner) | Admin |
|---|---|---|---|---|---|
| Questions | no | only via the claim form | yes | yes | metadata only |
| Correct answers | no | no | no | yes (own report, until locked/any time to read) | **no** (404) |
| Score / per-answer results | no | no | **no** | yes | no |
| Other claimants' answers/scores | no | no | no | yes (own report) | audit/attempt log only (no answers) |

## Spec interpretations (please confirm)
* The claimant is **not** shown their own score (removes any feedback signal to tune guesses).
* Questions are **locked after the first claim** so an owner cannot tailor answers to a claimant.
* Admins cannot read private answers (privacy over convenience).
* "Questions actually submitted and eligible for scoring" is implemented as *eligible = has a stored answer*; blank claimant answers are eligible and score 0.

## Anti-guessing controls
One attempt per item; 10 claims/hour and 30/day per user (Redis-backed in production); max 5 open claims; lock after 3 rejections in 24 h; gateway rate limits; no score or per-answer feedback to claimants; generic errors; **every attempt (scored, duplicate, invalid, blocked, service-unavailable) is stored** in `verificationattempts` with user, IP and time (admin: `GET /api/claims/admin/verification-attempts`).

## Files changed
**New:** `services/shared/src/verification.js` (+ test) · `frontend/src/lib/verification.js` · `frontend/src/components/VerificationEditor.jsx` · `VerificationParts.jsx` · `frontend/src/styles/verification.css`
**Modified:** `services/items/src/{app,models,views}.js` · `services/claims/src/{app,models,index}.js` · `services/notify/src/app.js` · `frontend/src/pages/{ReportPage,ItemDetail,Claims}.jsx` · tests (`items`, `claims`, `components`) · `frontend/e2e/*` · `scripts/e2e-local.mjs` · `docker-compose.yml` (claims env) · `.env.example`

## Database changes (no migration script needed)
Additive only; MongoDB creates collections on first write.
* New collections: `itemsecrets` (Items DB), `verificationattempts` (Claims DB).
* New optional fields: `items.verificationMeta`, `items.claimsCount`; `foundItems.verification`; `claims.{verification,message,reviewState,infoRounds,moreInfo,supplement}`.
* Existing reports/claims keep working: reports with plain questions and no answers are "unscored" (manual review). To enable scoring on an old report that has no claims yet, the owner opens it → **Private verification → Add questions**.

## Environment
New (all optional, defaults shown): `ITEMS_URL=http://items:4002` (Claims → Items, internal network), `VERIFY_HIGH_THRESHOLD=80`, `VERIFY_MEDIUM_THRESHOLD=50`, `VERIFY_DESCRIPTIVE_MIN_SIMILARITY=0.6`. No new secrets or packages are required by the feature.

## Tests (run in the build sandbox against real Redis and a MongoDB-compatible database)
Backend **108/108** (scoring unit tests incl. the 4/5 = 80 % case; leakage test planting a distinctive answer and checking every role/endpoint/event; authorization/IDOR; locks; attempts; fail-closed when Items is unreachable; thresholds; legacy compatibility) · frontend **15/15** · cross-process end-to-end **46/46** (incl. score 100 % with formatting differences, 0 % for a wrong claimant, claimant sees no score, duplicate submission refused, internal endpoint rejects calls without the service token) · ESLint clean · `npm audit` 0 vulnerabilities (after `npm audit fix` and the Zod 3→4 upgrade) · gitleaks clean.
**Not run here:** Docker build, Playwright (specs updated, unexecuted), real MongoDB, Cloudinary.

## Remaining manual steps
1. Rebuild: `docker compose up -d --build items claims notify frontend`.
2. Optionally set the `VERIFY_*` variables in `.env`.
3. Run `npx playwright test` against the running stack.
4. Decide whether to encrypt answers at rest (MongoDB field-level encryption / volume encryption); currently they are plain text in an isolated collection.

## Limits to keep in mind
A high score is a *signal*. Guessable answers (colours, "black") can score by luck, so weight distinctive questions higher; the panel says so, and approval stays a human decision.
