-- One-time backfill of profiles.telegram_id for staff whose Telegram
-- connection was verified outside the self-service /telegram-setup link
-- flow (see 20260709140000_telegram_integration.sql for why that flow
-- exists and why binding is normally never done directly like this).
update profiles set telegram_id = 7172243242 where phone = '+998771300555';
update profiles set telegram_id = 1027885366 where phone = '+998905287175';
update profiles set telegram_id = 7306543035 where phone = '+998940626022';
update profiles set telegram_id = 328517685  where phone = '+998903819664';
update profiles set telegram_id = 6812299255 where phone = '+998912881311';
update profiles set telegram_id = 8460190691 where phone = '+998980772677';
update profiles set telegram_id = 7796723675 where phone = '+998918798803';
