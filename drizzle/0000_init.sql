CREATE TYPE "public"."article_status" AS ENUM('IDEA', 'WRITING', 'REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."integration_type" AS ENUM('WORDPRESS', 'SHOPIFY', 'GSC');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('IDLE', 'QUEUED', 'RUNNING', 'DONE', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."keyword_status" AS ENUM('SUGGESTED', 'PLANNED', 'USED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."onboarding_step" AS ENUM('WEBSITE', 'SERVICES', 'COMPETITORS', 'CONTACT', 'AREAS', 'FIRST_CONTENT', 'DONE');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('OWNER', 'EDITOR', 'VIEWER');--> statement-breakpoint
CREATE TABLE "articles" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"keyword_id" text,
	"title" text NOT NULL,
	"slug" text,
	"meta_title" text,
	"meta_description" text,
	"brief" jsonb,
	"content_md" text,
	"faq" jsonb,
	"seo_score" integer,
	"seo_checks" jsonb,
	"status" "article_status" DEFAULT 'IDEA' NOT NULL,
	"planned_for" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"published_url" text,
	"external_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gsc_daily_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"date" date NOT NULL,
	"clicks" integer NOT NULL,
	"impressions" integer NOT NULL,
	"ctr" double precision NOT NULL,
	"position" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gsc_query_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"period_end" date NOT NULL,
	"query" text NOT NULL,
	"clicks" integer NOT NULL,
	"impressions" integer NOT NULL,
	"ctr" double precision NOT NULL,
	"position" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"type" "integration_type" NOT NULL,
	"secret" text NOT NULL,
	"config" jsonb,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"phrase" text NOT NULL,
	"intent" text,
	"search_volume" integer,
	"difficulty" integer,
	"cpc" double precision,
	"cluster" text,
	"status" "keyword_status" DEFAULT 'SUGGESTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"role" "role" DEFAULT 'OWNER' NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_areas" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"name" text NOT NULL,
	"page_url" text,
	"selected" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"h1" text,
	"text" text NOT NULL,
	"is_service" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"domain" text NOT NULL,
	"business_name" text,
	"category" text,
	"summary" text,
	"language" text DEFAULT 'en' NOT NULL,
	"country" text,
	"state" text,
	"city" text,
	"street_address" text,
	"phone" text,
	"tone_of_voice" text,
	"onboarding_step" "onboarding_step" DEFAULT 'WEBSITE' NOT NULL,
	"scan_status" "job_status" DEFAULT 'IDLE' NOT NULL,
	"scan_error" text,
	"articles_per_month" integer DEFAULT 8 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_daily_metrics" ADD CONSTRAINT "gsc_daily_metrics_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_query_metrics" ADD CONSTRAINT "gsc_query_metrics_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_areas" ADD CONSTRAINT "service_areas_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_pages" ADD CONSTRAINT "site_pages_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "articles_site_status" ON "articles" USING btree ("site_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "gsc_daily_site_date" ON "gsc_daily_metrics" USING btree ("site_id","date");--> statement-breakpoint
CREATE INDEX "gsc_query_site_period" ON "gsc_query_metrics" USING btree ("site_id","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_site_type" ON "integrations" USING btree ("site_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "keywords_site_phrase" ON "keywords" USING btree ("site_id","phrase");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_user_workspace" ON "memberships" USING btree ("user_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_pages_site_url" ON "site_pages" USING btree ("site_id","url");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_workspace_domain" ON "sites" USING btree ("workspace_id","domain");