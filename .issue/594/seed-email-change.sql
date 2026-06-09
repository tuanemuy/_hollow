-- Issue #594 browser-verification seed: email_change challenges for P06.
-- Idempotent: removes only the two test rows it owns (matched by exact
-- value JSON) before re-inserting, so re-running never duplicates and
-- never touches other verification rows.
--
-- identifier = "email_change:<userId>" (dev-admin user).
-- value      = JSON.stringify({ token, payload: { newEmail } }).
-- consume() looks up by json_extract(value,'$.token') = token, so two
-- rows sharing the same identifier coexist and are each retrievable by
-- their exact token. Each token is single-use (the matched row is
-- deleted on consume).

DELETE FROM verifications
WHERE value IN (
  '{"token":"test-email-change-594","payload":{"newEmail":"new-address-594@example.com"}}',
  '{"token":"test-email-change-594-long","payload":{"newEmail":"very.long.local.part.address.for.wrapping.check@example-domain-name-594.com"}}'
);

INSERT INTO verifications (id, identifier, value, expires_at, created_at, updated_at)
VALUES
  (
    'seed-594-email-change-normal',
    'email_change:01950000-0000-7000-8000-000000000001',
    '{"token":"test-email-change-594","payload":{"newEmail":"new-address-594@example.com"}}',
    '2030-01-01T00:00:00.000Z',
    '2026-06-09T00:00:00.000Z',
    '2026-06-09T00:00:00.000Z'
  ),
  (
    'seed-594-email-change-long',
    'email_change:01950000-0000-7000-8000-000000000001',
    '{"token":"test-email-change-594-long","payload":{"newEmail":"very.long.local.part.address.for.wrapping.check@example-domain-name-594.com"}}',
    '2030-01-01T00:00:00.000Z',
    '2026-06-09T00:00:00.001Z',
    '2026-06-09T00:00:00.001Z'
  );
