# PR Review #001 — fix(admin): #817 UsersTable/Jobs の hydration mismatch を解消

**PR:** #820
**Date:** 2026-07-10
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 4
- Verdict: **APPROVED**

## レイヤー別ファイル

- General Review: review-001-general.md（B: 0 / W: 1 / N: 4）

## 指摘一覧

- [W-001] formatDate/formatDateTime のロジック・WHY コメントが2ファイルに逐語重複 — `app/components/admin/UsersTable/index.tsx:91-102` / `app/components/admin/Jobs/index.tsx:159-172`（General）
- [N-001] 数値固定オプション＋TZ固定で出力が決定論化し SSR/クライアント一致 — `UsersTable/index.tsx:96` / `Jobs/index.tsx:164`
- [N-002] `Dashboard/index.tsx:145` `formatActivityTime` が同型の未修正 mismatch を抱えうる（横断修正Issueの代表例）
- [N-003] early-return 後の timeZone 配置・型/呼び出し側不変・WHYのみコメント、CLAUDE.md 方針に適合
- [N-004] typecheck 通過 / lint・format no fixes / 対象2画面を完全カバー / スコープ規律良好

## 仕分けと対応

- **W-001（見送り）**: 本 PR の2ファイルは Issue #817 のスコープ。整形ロジックの共有ヘルパー化はコードベース全体に約12箇所ある同型フォーマッター（ProfileForm・PublishSettings・SecurityForm・relativeTime・Dashboard 等）の一部だけを切り出す中途半端な共通化になり、単独では改善にならない。N-002（Dashboard の未修正 mismatch）と併せて、「日付整形 TZ 横断修正 + 共有ヘルパー抽出」Issue に畳み込む。→ 別Issue #821 で対応。
- Blocker 0件・修正対象 Warning 0件（W-001 は見送り記録済み）のため、Step 7 の完了条件を満たし **APPROVED**。
