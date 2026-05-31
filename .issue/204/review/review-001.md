# PR Review #001 — feat(#204): メタタグ・SEO 設定の整備

**PR:** #390
**Date:** 2026-06-01
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 4
- Notes: 多数（良好）
- Verdict: **BLOCKED**（Warning 修正のため再レビューへ）

---

## Presentation / Frontend

### Blockers
- なし

### Warnings
- **[B/W: Pres-W-001]** Article JSON-LD に `image` が欠落。OGP 側は buildHead が常にデフォルト og-image を出すが、Article 構造化データの推奨フィールド `image` が無くリッチリザルト適格性に影響。→ JSON-LD に `image: <default og-image url>` を追加。
- **[Pres-W-002]** ProfilePage の Person に `url` 等の推奨フィールドが無い。`Person.url` を足すのは低コストで効果あり。

### Notes（抜粋）
- canonical 重複解消（__root.tsx の filter）は型安全かつ副作用なしで正しく機能。
- loader 二段化 + 二層の NotFound 握りで SSR クラッシュ防止。`react cache()` デデュープは未実装（コスト残）。
- buildJsonLdScript の `<`→`<` は `</script>` breakout 対策として十分。
- internalRouteHead 共通化・noindex 付与単位（ADR-001）はコード上正しい。

## Security

### Blockers
- なし

### Warnings
- なし

### Notes（抜粋）
- TanStack の Asset.js は ld+json のみ `dangerouslySetInnerHTML` 経路。buildJsonLdScript が唯一の防御線で、全 `<` 置換により breakout 不可。他 meta は React 自動エスケープ。
- getPublicNote が missing/private を一律 NotFound 化（列挙防止）。head は isNotFoundError のみ握り情報露出なし。
- head server fn 3本すべて validateInput 通過。value-object 構築と合わせ2点検証準拠。
- noindex カバレッジに漏れ・誤付与なし。公開ページに noindex は付かない。

## Architecture & Requirements

### Blockers
- なし

### Warnings
- **[Arch-W-001]** 公開ノートの description が空文字になりうる（本文空ノート）。`buildHead` は `?? ` で nullish 判定のため空文字はフォールバックされず空タグになる。→ `plain` が空なら description を省略しサイト既定へフォールバック。
- **[Arch-W-002]** 公開ノートで RSC loader と head server fn が getPublicNote を二重取得（ADR-003/plan 予告通り）。別 server fn のため react cache() でも自然にはデデュープされない。コスト許容なら ADR-003 の Consequences を「未デデュープで確定」に更新。

### Notes（抜粋）
- Issue #204 の8問題すべてに対応。スコープ外（sitemap/robots.txt生成・OG動的生成）に踏み込まず。
- 依存方向遵守。AppConfig.locale は SSOT/型に反映、serverCloudflare.test.ts は無改修で通る。
- ADR-001〜006 すべて実装に反映。アセットは自作で著作物性懸念なし。
- 認証フロー（login/signup等）への noindex は意図的に未付与（公開導線）。スコープ取りこぼしではない。

---

## 仕分け

| ID | 対応 |
|----|------|
| Pres-W-001 (Article image) | このPRで修正 |
| Pres-W-002 (Person.url) | このPRで修正 |
| Arch-W-001 (空 description) | このPRで修正 |
| Arch-W-002 (二重RPC) | ADR-003 に「未デデュープで確定」と記録（コスト許容） |

## Design Decisions
- 二重 RPC は別 server fn 構造のため react cache() では共有されず、デデュープは見送り確定（ADR-003 更新）。
