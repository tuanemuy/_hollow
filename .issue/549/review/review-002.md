# PR Review #002 — feat(#549): P11 ノート詳細のモック追従 backend 拡張

**PR:** #555
**Date:** 2026-06-07
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 数件（任意。1件のみ本ラウンドで取り込み）
- Verdict: **APPROVED**

review-001 で対応した修正の再レビュー。Adapter/Security + Frontend と Test の 2 視点を並列実施。

---

## Adapter/Security + Frontend（2周目）

#### Blockers
なし

#### Warnings
なし

#### Notes
- broken アフォーダンス CSS（`.wikilink[data-unresolved]`）は muted 色 + cursor:default で resolved と区別が付き、"静かな"トーンに馴染む。トークン参照のみ。**[Frontend W-001] 解消。**
- UUID_V7_PATTERN の export/import はステートレス（`/g` なし）でクリーン。**[Adapter N-001] 解消。**（valueObject.ts 等の別定義は循環参照回避のためスコープ外）
- displayText フォールバックは `display → refDisplay → target` の優先順で正しく、3 ソースとも `escapeTextValue` 単一経路を通り XSS 抜け道なし。**[Frontend N-003] 解消。**
- port JSDoc のトラスト境界明記は唯一の呼び出し元（`getNoteDetail` の sanitize 済み body）と一致。**[Adapter N-002] 解消。**
- リグレッションなし（typecheck 緑 / lint クリーン / 関連ユニット緑 / 新規 XSS 兆候なし）。
- **[N-001（任意）]** refDisplay フォールバック分岐の直接テストがあると盤石 → **本ラウンドで renderer 単体テストに 1 ケース追加**（`[[uuid]]` + displayText → label=displayText、生 UUID 非漏洩）。

## Test（2周目）

#### Blockers
なし

#### Warnings
なし

#### Notes
- 4 件の 1周目テスト指摘（W-001 / N-001 / N-002 / N-003）はすべて意味のある検証として解消。偽陽性・トートロジー・致命的カバレッジ穴なし。実機緑（unit 27 / integration 22）。
- E2E 統合テストは `seedInternalLink(resolved)` → repo rehydrate → 実 `UltrahtmlNoteBodyRenderer`（本番 DI と同一）→ `<a href>` を通す本物の結線検証。未解決分岐の焼き直しではない。
- backlink-meta DOM テストは `span.uppercase` で meta 行を一意特定し有/空両分岐を pin。
- overlap / hashtag 終端も両面から検証。

---

## Design Decisions

新規の設計判断なし。

## 完了

**Blocker 0 / Warning 0 を達成。1 ラウンドクリーンで Phase 3 完了 → PR を Ready for review に切り替える。**
