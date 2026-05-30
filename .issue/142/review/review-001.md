# PR Review #001 — security(admin): add Origin/Referer header verification for admin server functions

**PR:** #359
**Date:** 2026-05-30
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 6
- Notes: 多数（網羅性・順序・境界の妥当性を確認）
- Verdict: **BLOCKED → 全 Warning 修正済み**（再レビューで確認）

レビューは Security / Presentation・アーキ / Test の 3 レイヤー並列。

---

## Security

### Blockers
- なし

### Warnings
- **[W-001]** 空文字列 `Origin: ""` で Referer フォールバックが発動しない（`csrfMiddleware.ts:52-55`）。fail-closed なのでバイパスにはならないが、空 Origin を送る構成で正当な POST が誤 403 になりうる。
  → **修正済み**: 条件を `origin ? isSameOrigin(origin, ...) : isSameOrigin(getRequestHeader("referer"), ...)` に変更。空文字（falsy）も Referer フォールバックへ。
- **[W-002]** `APP_URL` 不正値/空文字の起動時検証がない（`serverCloudflare.ts:299`）。誤設定時に全 admin POST が 403 化（fail-closed だが運用者に伝わりにくい）。
  → **見送り（スコープ外）**: DI 起動時の config 検証であり本 Issue（CSRF middleware 追加）のスコープ外。fail-closed で攻撃面の問題ではない。Phase 4 で別 Issue 化を検討。

### Notes（要点）
- CSRF 核心防御は正しい。`Origin: null`・空文字・subdomain・scheme 差異・port 差異をすべて reject（誤許可なし、node 実測）。
- admin mutation 15 関数（6ファイル）すべてに適用、漏れ 0（grep 確認）。admin に状態変更 GET なし、loader は serverData で middleware 非通過。
- 順序 `[errorResponseMiddleware, csrfMiddleware]` 正しい。throw が serialize 済み 403 に。
- ForbiddenError の code/message 漏洩は無害（汎用文言、stack 削除済み）。session cookie 非干渉。
- json POST は middleware 前に seroval パースで弾かれ、formData 経路のみ本体到達 → CSRF 迂回経路なし。

## Presentation / Architecture

### Blockers
- なし

### Warnings
- **[W-001]** `origin`/`referer` を両方無条件先読み（`csrfMiddleware.ts:48-49`）。origin がある分岐では referer 未使用で冗長。
  → **修正済み**: Security W-001 の修正と統合。origin が falsy のときだけ `getRequestHeader("referer")` を読む形にした。

### Notes（要点）
- ヘキサゴナル境界適切（transport 境界＝presentation）。内側レイヤー漏れなし。ADR-001/003 と実装一致。
- `getContainer().config.appUrl` は errorResponseMiddleware/head.ts と整合、client-graph safe。
- ForbiddenError 再利用（ADR-002）は status マッピングの一貫性を保つ。
- `isSameOrigin` 純粋関数分離・命名・粒度妥当。6ファイル適用は機械的に一貫（import 位置・配列順）。
- コメント密度は既存 middleware と同等で過剰でない。

## Test

### Blockers
- なし

### Warnings
- **[W-001]** 結合テストが手書きネストで、実 action.ts の配列順そのものは保証しない（射程が ADR-004 の主張より狭い）。
  → **修正済み**: 結合テストのコメントに「semantics を固定するもので各 action.ts の配列順は保証しない」旨の但し書きを追加。
- **[W-002]** 明示/暗黙ポート正規化の正常系（`:443` ⇔ 暗黙、`:8787` 明示一致）のテストがない。
  → **修正済み**: `isSameOrigin` に正規化の正常系 2 件追加。
- **[W-003]** `Origin: null` リテラル文字列のエッジテストがない。
  → **修正済み**: `isSameOrigin("null", APP_URL) === false` を追加。
- **[W-004]** 「Origin=evil かつ Referer=app でも 403」（Origin 優先・Referer 非フォールバック）のテストがない。
  → **修正済み**: middleware body に該当ケース + 空文字 Origin フォールバックケースを追加。

### Notes（要点）
- vi.mock パターンは既存規約と整合、実挙動を素通りさせていない。
- アサーションは本質的（AppServerError instanceof + kind + httpStatusFor=403 + setResponseStatus(403)）。
- テスト種別配置（unit pool）は ADR-004 の判断・vitest 構成と一致。フレーク要因なし。

---

## Design Decisions

このラウンドで新たな ADR 追加なし。Security W-002（APP_URL 起動時検証）は本 Issue スコープ外として Phase 4 で別 Issue 化を検討。

## 修正サマリー

- `csrfMiddleware.ts`: Origin 優先・空文字/欠落時のみ Referer フォールバックに変更（Sec W-001 + Pres W-001）。
- `csrfMiddleware.test.ts`: テスト 15 → 20 件（ポート正規化2・`Origin: null`1・forged Origin 非フォールバック1・空文字フォールバック1）。結合テストの射程を但し書きで明確化（Test W-001〜W-004）。
- typecheck / biome / 全 20 テスト PASS。
