CREATE TABLE "ai_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"question_id" text NOT NULL,
	"engine" text NOT NULL,
	"mentioned" boolean NOT NULL,
	"cited" boolean NOT NULL,
	"competitors_mentioned" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answer_excerpt" text,
	"error" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"question" text NOT NULL,
	"topic" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"score" integer NOT NULL,
	"checks" jsonb NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "ai_status" "job_status" DEFAULT 'IDLE' NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "ai_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_checks" ADD CONSTRAINT "ai_checks_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_checks" ADD CONSTRAINT "ai_checks_question_id_ai_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."ai_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_questions" ADD CONSTRAINT "ai_questions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_scores" ADD CONSTRAINT "post_scores_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_checks_site_checked" ON "ai_checks" USING btree ("site_id","checked_at");--> statement-breakpoint
CREATE INDEX "ai_checks_question" ON "ai_checks" USING btree ("question_id","engine");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_questions_site_question" ON "ai_questions" USING btree ("site_id","question");--> statement-breakpoint
CREATE UNIQUE INDEX "post_scores_site_url" ON "post_scores" USING btree ("site_id","url");