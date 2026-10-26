# Database Migrations

## Baseline (20261026HHMMSS_baseline.sql)

This is a `pg_dump --schema-only --schema=public` snapshot of the production
database captured on 26 October 2026. It includes all tables, functions, RLS
policies, triggers, and grants in the `public` schema.

### Post-restore step (manual)

The `on_auth_user_created` trigger on `auth.users` is NOT in this dump (it lives
in the `auth` schema managed by Supabase). After restoring from this baseline to
a fresh project, run this once:

```sql
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();