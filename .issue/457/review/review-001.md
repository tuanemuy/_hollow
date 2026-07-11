# PR Review #001 — docs(security): #457 認証経路の rate limit / lockout 検討

**PR:** #836
**Date:** 2026-07-11
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 6
- Verdict: **BLOCKED**（Warning 修正のため再レビューへ）

## レイヤー別ファイル

- General Review: review-001-general.md（B: 0 / W: 2）

## 指摘一覧

- [W-001] WAF Match のサーバー関数パス失効リスクの記載漏れ — `docs/runtime_cloudflare.md`（Auth endpoint edge protection / Match）→ 反映
- [W-002] runtime doc の一文が investigation §6 と食い違い（app 層 limiter も scrypt CPU は節約可） — `docs/runtime_cloudflare.md` → 反映
- [N-001] wrangler バインディング列挙が緩い（ASSETS/RELAY/AI も存在） — `investigation.md` §0 / `plan.md` → 反映

## 対応

W-001 / W-002 / N-001 をすべてこの PR で修正（同一2ファイル内で完結する精度修正）。コード事実照合は全一致・AC 全充足で Blocker ゼロ。
