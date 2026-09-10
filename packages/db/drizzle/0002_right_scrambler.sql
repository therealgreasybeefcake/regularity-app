CREATE TYPE "public"."team_member_role" AS ENUM('owner', 'admin', 'member', 'viewer');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"token" text NOT NULL,
	"code" text,
	"role" "team_member_role" DEFAULT 'member' NOT NULL,
	"invited_by" text NOT NULL,
	"email" text,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_invitations_token_unique" UNIQUE("token"),
	CONSTRAINT "team_invitations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "team_member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "linked_user_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_members_team_user_uq" ON "team_members" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_members_user_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drivers" ADD CONSTRAINT "drivers_linked_user_id_user_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Backfill: every existing team's owner becomes an 'owner' member, so the
-- membership-based authz cutover is behavior-identical for current solo users.
INSERT INTO "team_members" ("team_id", "user_id", "role")
SELECT "id", "owner_id", 'owner' FROM "teams"
ON CONFLICT ("team_id", "user_id") DO NOTHING;
