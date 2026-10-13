
# LostLink — Phase 1 (Auth, Roles, Profile)
1. `cp .env.example .env.local`, fill values (`npx auth secret` for AUTH_SECRET). 2. `npm install && npm run dev`.
3. Make the first admin by hand in Atlas: set `role: "admin"` on your user. Nobody can self-promote through the API.
4. Deploy: add the same variables in Vercel. Run `npm run audit` before each release.
Before launch: replace `lib/ratelimit.js` with Upstash Redis (in-memory limits don't span Vercel instances), add an Atlas IP/network rule and a least-privilege DB user, and configure Resend + a verified sending domain.
=======
# lost-and-found-management-system
AI-powered Lost and Found Management System for reporting, intelligent item matching, ownership verification, secure recovery, and lost-item hotspot analysis.
>>>>>>> origin/main
