CREATE TABLE "gbp_daily_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"date" date NOT NULL,
	"search_views" integer DEFAULT 0 NOT NULL,
	"maps_views" integer DEFAULT 0 NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"directions" integer DEFAULT 0 NOT NULL,
	"website_clicks" integer DEFAULT 0 NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geo_grid_scans" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"keyword" text NOT NULL,
	"center_lat" double precision NOT NULL,
	"center_lng" double precision NOT NULL,
	"radius_km" double precision NOT NULL,
	"size" integer NOT NULL,
	"points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"avg_rank" double precision,
	"top3_share" double precision,
	"status" "job_status" DEFAULT 'QUEUED' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_audits" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"status" "job_status" DEFAULT 'QUEUED' NOT NULL,
	"score" integer,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stats" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "site_insights" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" "job_status" DEFAULT 'QUEUED' NOT NULL,
	"data" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "is_testimonial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "lng" double precision;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "widget_key" text;--> statement-breakpoint
ALTER TABLE "gbp_daily_metrics" ADD CONSTRAINT "gbp_daily_metrics_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_grid_scans" ADD CONSTRAINT "geo_grid_scans_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_audits" ADD CONSTRAINT "site_audits_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_insights" ADD CONSTRAINT "site_insights_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gbp_daily_site_date" ON "gbp_daily_metrics" USING btree ("site_id","date");--> statement-breakpoint
CREATE INDEX "geo_grid_site" ON "geo_grid_scans" USING btree ("site_id","created_at");--> statement-breakpoint
CREATE INDEX "site_audits_site" ON "site_audits" USING btree ("site_id","created_at");--> statement-breakpoint
CREATE INDEX "site_insights_site_kind" ON "site_insights" USING btree ("site_id","kind","created_at");