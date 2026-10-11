CREATE INDEX "appointment_user_start_at_id_idx" ON "appointments" USING btree ("user_id","start_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointment_time_order_check" CHECK ("appointments"."end_at" > "appointments"."start_at");--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;--> statement-breakpoint
-- Supabase may already have btree_gist installed in the extensions schema.
-- Drizzle migrations run in a transaction, so this search path change is local.
SET LOCAL search_path = public, extensions;--> statement-breakpoint
ALTER TABLE "public"."appointments"
  ADD CONSTRAINT "appointment_user_time_exclusion"
  EXCLUDE USING gist (
    "user_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  ) WHERE ("status" <> 'cancelled');
