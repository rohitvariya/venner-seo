ALTER TABLE "articles" ADD COLUMN "fact_issues" jsonb;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "hero_image_url" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "blueprint" jsonb DEFAULT '{"idealCustomer":"","differentiators":[],"facts":[],"targetSearches":[],"likedArticles":[],"author":null}'::jsonb NOT NULL;