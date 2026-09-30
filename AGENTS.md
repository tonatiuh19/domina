# DOMINA — Agent Guide

This app runs as a Vite React client plus one Vercel serverless function.

- **npm only.** Do not use pnpm or yarn.
- **API:** all runtime routes live inline in `api/index.ts`. Shared code may be imported with `import type` only.
- **Data:** TiDB via `database/schema.sql`. Change schema with a new file in `database/migrations/`, apply `npm run db:migrate`, then update `schema.sql`.
- **Identities:** learners (`users`, `user_sessions`) and staff (`admins`, `admin_sessions`) stay separate. Company buyers are staff with `role=company` linked via `admins.company_id`.
- **UI components** live in `app/components/ui`. Pages live in `app/pages`. Data fetching goes through Redux slices, not components.
- **Mobile**: every surface (marketing, auth, learner portal, admin) must be responsive with **no page-level horizontal scrolling**. Contained scroll only inside tables/galleries. See `.cursor/rules/mobile-responsive.mdc`.
- **Copy:** add strings to both `app/locales/en/translation.json` and `app/locales/es/translation.json`.
- **Tests:** `npm test`. `VITEST=true` and `@example.test` must not send Resend mail or call live Stripe. `npm run test:cleanup-fixtures` deletes those rows. New/changed API routes need matching `api/**/*.test.ts` coverage including edge cases (see `.cursor/rules/api-testing.mdc`).
- **CDN:** course covers use Disrupting Labs `uploadImages.php` (`main_folder=domina`), same enteratelo-php stack as athlete-hub. Helpers live in `shared/cdnUrl.ts` (client) and are inlined in `api/index.ts`.
- **Deploy:** `npm run deploy:prod` runs the inline-API check, typecheck, tests, fixture cleanup, then `vercel --prod`.

Dev server: `npm run dev` (UI on port 8080, API proxied from 8081).
