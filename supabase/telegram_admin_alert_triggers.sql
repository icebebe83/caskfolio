-- Telegram admin alert triggers using pg_net.
--
-- Configured values:
--   Project ref: atrjypugrnmnbgxockeu
--   Webhook secret: caskfolio_telegram_secret_20260528
--
-- Required Edge Function secrets:
--   TELEGRAM_BOT_TOKEN
--   TELEGRAM_WEBHOOK_SECRET
--
-- Telegram chat id is fixed in the Edge Function as 1007112216.

create extension if not exists pg_net with schema extensions;

create or replace function public.telegram_admin_alert_webhook()
returns trigger
language plpgsql
set search_path = public, net
as $$
begin
  perform net.http_post(
    url := 'https://atrjypugrnmnbgxockeu.supabase.co/functions/v1/telegram-admin-alert',
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(new),
      'old_record', null
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', 'caskfolio_telegram_secret_20260528'
    ),
    timeout_milliseconds := 1000
  );

  return new;
end;
$$;

drop trigger if exists telegram_admin_alert_auth_users_insert on auth.users;

create trigger telegram_admin_alert_auth_users_insert
after insert on auth.users
for each row
execute function public.telegram_admin_alert_webhook();

drop trigger if exists telegram_admin_alert_public_listings_insert on public.listings;

create trigger telegram_admin_alert_public_listings_insert
after insert on public.listings
for each row
execute function public.telegram_admin_alert_webhook();
