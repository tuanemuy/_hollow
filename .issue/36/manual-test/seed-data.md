# Seed Data for Manual Test (Issue #36)

**Date:** 2026-05-19
**Dev server:** `http://localhost:3000`
**D1:** `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/9ba2b04bf514d9facfd57ed57d849e77241a7adc99d1c1545d06688b43d84248.sqlite`

## Pre-seed fix (environment workaround)

Local D1 had a stale `instance_settings` row whose `design_tokens_json='{}'`, `prompts_json='{}'`, `llm_api_key_ciphertext=''` and `limits_json` (legacy shape) caused a `RehydrationError` -> `DataIntegrityError` on every sign-up. Deleted the row so `InstanceSettings.default()` fallback kicks in:

```sql
DELETE FROM instance_settings WHERE id='singleton';
```

This is a pre-existing environment issue, unrelated to Issue #36.

## Main user

| Field | Value |
| --- | --- |
| id | `019e3c5e-2c58-77c4-b0f2-3b9b9af7ff1d` |
| username | `testuser` |
| email | `test-user@example.com` |
| password | `TestPass123!` |
| display name | `TestUser` |
| email_verified | manually set to `1` (see below) |

`UPDATE users SET email_verified=1 WHERE email='test-user@example.com';`

## Secondary user X (owner-isolation tests)

| Field | Value |
| --- | --- |
| id | `019e3c62-41cd-756a-a002-26354b323b6b` |
| username | `testx` |
| email | `test-x@example.com` |
| password | `TestPass123!` |
| display name | `TestX` |
| email_verified | manually set to `1` |

## Notes (main user)

| Label | Title | Note ID | Notes |
| --- | --- | --- | --- |
| A | `Hello World` | `019e3c60-9037-7135-9241-d75b8a1400d2` | body updated with `#draft` |
| B | `Helsinki` | `019e3c61-03a6-7779-bffa-e517afa8964b` | body updated with `#design` |
| C | `テスト用ノート` | `019e3c61-297d-713f-98dd-9f44e4f6c1c0` | |
| D | `foo\|bar` | `019e3c61-441c-77e5-bd4e-40a4299f79e5` | title contains pipe (ADR-008) |

## Notes (user X)

| Label | Title | Note ID |
| --- | --- | --- |
| X-1 | `Heliopolis` | `019e3c62-c39c-7439-8acf-4241bcb8a843` |

## Tags (main user)

| Name | Tag ID |
| --- | --- |
| `draft` | `019e3c61-7ee1-768a-80ac-02255ed5772d` |
| `design` | (created via `#design` hashtag on note B) |

## Sessions

- `seed` — main user (testuser)
- `user-x` — user X (testx)
- `verify-tc-{NN}` — per-TC session
