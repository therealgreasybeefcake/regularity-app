/**
 * Seeds a permanent demo/reviewer account for app-store review (Google Play,
 * Apple). Runs against whatever DATABASE_URL is in apps/api/.env — which points
 * at the production Railway Postgres — so the deployed app can log in with it.
 *
 * Idempotent: if the account already exists it just (re)sets the password so the
 * credentials below are always valid. Goes through BetterAuth's sign-up so the
 * password hash matches what the login flow expects.
 *
 * Run:  pnpm --filter @regularity/api seed:test-account
 * Override creds via env: SEED_EMAIL, SEED_PASSWORD, SEED_NAME.
 */
import { auth } from '../auth';
import { db } from '../db';
import { schema } from '@regularity/db';
import { eq } from 'drizzle-orm';

const email = process.env.SEED_EMAIL ?? 'reviewer@regularity.app';
const password = process.env.SEED_PASSWORD ?? 'PlayReview2026!';
const name = process.env.SEED_NAME ?? 'Play Store Reviewer';

async function main() {
  const existing = await db.query.user.findFirst({ where: eq(schema.user.email, email) });

  if (existing) {
    // Reuse BetterAuth's password hashing + storage path via the reset-by-context
    // ctx helper. Simplest reliable approach: delete the credential account and
    // re-create through sign-up so the hash format always matches the verifier.
    await db.delete(schema.account).where(eq(schema.account.userId, existing.id));
    await db.delete(schema.user).where(eq(schema.user.id, existing.id));
    console.log(`Removed existing account for ${email}, recreating...`);
  }

  await auth.api.signUpEmail({ body: { email, password, name } });

  // App-store reviewers can't click an email verification link, so mark verified.
  await db
    .update(schema.user)
    .set({ emailVerified: true })
    .where(eq(schema.user.email, email));

  console.log('\n✅ Seeded permanent review account:');
  console.log(`   email:    ${email}`);
  console.log(`   password: ${password}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
