-- One-off cleanup for accounts rejected BEFORE rejection became a hard delete.
-- Rejecting a signup in the admin panel now deletes the account outright, so no
-- new rows will ever have status = 'rejected'. This clears out the old ones so
-- they stop showing in the members list.
--
-- Review before running — this is irreversible:
--   SELECT email, name, created_at FROM portal_users WHERE status = 'rejected';

DELETE FROM portal_users WHERE status = 'rejected';
