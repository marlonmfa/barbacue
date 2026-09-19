CREATE TABLE IF NOT EXISTS "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"job_title" text NOT NULL,
	"brand" text DEFAULT 'barbacue' NOT NULL,
	"phone" text,
	"email" text,
	"employment_type" text DEFAULT 'clt' NOT NULL,
	"salary_cents" integer DEFAULT 0 NOT NULL,
	"weekly_hours" integer DEFAULT 44 NOT NULL,
	"work_schedule" jsonb,
	"hire_date" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
