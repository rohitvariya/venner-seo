CREATE TYPE "public"."post_status" AS ENUM('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED');--> statement-breakpoint
ALTER TYPE "public"."integration_type" ADD VALUE 'GBP';--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"external_name" text NOT NULL,
	"reviewer" text,
	"rating" integer NOT NULL,
	"comment" text,
	"reviewed_at" timestamp with time zone,
	"reply_text" text,
	"replied_at" timestamp with time zone,
	"draft_reply" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"article_id" text,
	"channel" text NOT NULL,
	"text" text NOT NULL,
	"link" text,
	"image_url" text,
	"cta" text,
	"status" "post_status" DEFAULT 'DRAFT' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"external_id" text,
	"external_url" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "google_posts_per_week" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "social_channels" jsonb DEFAULT '["google","facebook","instagram","linkedin"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "auto_reply_positive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_site_external" ON "reviews" USING btree ("site_id","external_name");--> statement-breakpoint
CREATE INDEX "social_posts_site_status" ON "social_posts" USING btree ("site_id","status");