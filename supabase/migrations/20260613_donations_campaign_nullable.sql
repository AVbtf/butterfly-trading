-- supabase/migrations/20260613_donations_campaign_nullable.sql
-- Phase 4 — allow undirected donations.
--
-- A donation is created on a closing trade BEFORE the user has directed it to a
-- campaign (edge cases 2.7-2.9; Section 8 — the impact wallet holds undirected
-- funds, and the user assigns a campaign later). record_fill_and_donation
-- therefore inserts donations with campaign_id = NULL. The donations table was
-- created with campaign_id NOT NULL, which contradicts that design and blocks
-- every donation. Make the column nullable.

alter table donations alter column campaign_id drop not null;
