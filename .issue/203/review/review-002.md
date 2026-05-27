# PR Review #002 — feat(infra): harden deploy workflow secret bulk-push

**PR:** #244
**Date:** 2026-05-27
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 数件（観察のみ）
- Verdict: **APPROVED**

---

## Infrastructure / CI

### Blockers
なし

### Warnings
なし

### Notes
- `set -euo pipefail` 下で `${DECRYPTED_RAW:-}` / `${DECRYPTED_FILTERED:-}` の空文字フォールバックが併用されており、`set -u` 起因の早期失敗にも耐える二重防御
- コメント「Initialize before set -u trips...」で意図明示
- staging / production 両 workflow が完全対称、env_flag リストも一致

### 1 周目修正の確認
- **W-002 (trap タイミング)**: staging L103-107 / production L106-110 で「初期化 → trap → mktemp ×2」の正しい順序、`${var:-}` フォールバック付き
- **W-001 (Validate secrets 前倒し)**: スコープ外として保留、フォローアップ Issue 候補
- **W-003 (pnpm install 前提)**: 1 周目で対処済み確認

---

## TypeScript

### Blockers
なし

### Warnings
なし

### Notes
なし

### 1 周目修正の確認
- **W-001 (`--` フィルタ invariant)**: `checkSecrets.ts:32-37` JSDoc `Trust boundary.` に明記。コード側 inline comment も併記
- **W-002 (JSON.parse 重複キー silent)**: `checkSecrets.ts:28-31` JSDoc `Scope (intentional non-goals)` に明記
- **W-003 (値妥当性は不問)**: `checkSecrets.ts:25-27` JSDoc `Scope (intentional non-goals)` 先頭に明記
- 双方向の invariant 文書化（`secrets.ts:18-21` ↔ `checkSecrets.ts:21-22`）が確認できる

---

## Documentation

### Blockers
なし

### Warnings
なし

### Notes
- `docs/deployment_setup.md:143` の「ローカルコマンド」セクションに残る素 `sops -d` は pre-existing な例示であり本 PR の新フローと別文脈（観察のみ）
- `runtime_cloudflare.md:139` の `ADMIN_SETUP_TOKEN`（web-only）は spec 上は `webOnly` 配列として独立せず、ドキュメントの「`shared` / `dispatchExtras`」言及は実装と整合（pre-existing、本 PR 対象外）

### 1 周目修正の確認
- **B-001 (削除フロー Step 4 引数欠落)**: `deployment_setup.md:55-65` で追加フローと同じ 3 行ブロックに修正済み。Step 6 として Cloudflare 側手動削除も追記
- **B-002 (runtime_cloudflare.md の Deployment SOPS workflow)**: L131 を「CI `Inject secrets` step」に正したうえで decrypt → check → filter → push → indexer まで明示。L149-164 を新フロー 5 ステップに書き換え
- **W-001 (`.dev.vars.example` 言及対称化)**: README / deployment_setup.md とも Adding / Removing 両方で `.dev.vars.example` ステップあり
- **W-002 (sops コマンド表記統一)**: 新規追加箇所は全て `SOPS_AGE_KEY_FILE=~/.config/sops/age/hollow-<stage>.txt \` 形式
- **W-003 (post-deploy migration ブロック)**: `deployment_setup.md:81-94` に「Issue #203 マージ直後の一回限り cleanup」追加。3 つの legacy key 名 (`_comment` / `_dispatch_extras_comment` / `_resend_api_key_comment`) + env_flag 6 entries + `|| true` 設計意図コメントすべて含む
- **W-004 (`_web_only_comment` → `_resend_api_key_comment`)**: plan.md / testing.md の全箇所で置換済み、`_web_only_comment` 残存ゼロ
- **W-005 (`shared` / `dispatchExtras` 限定列挙)**: 「等」削除済み

---

## Design Decisions

特になし。ADR-001..ADR-005 は本 PR で全て実装済みで追加判断なし。

---

## Verdict

**APPROVED** — 3 レイヤー全てで Blocker 0 / Warning 0。1 ラウンドで全 W 解消、新規問題なし。Ready for review に切り替え。
