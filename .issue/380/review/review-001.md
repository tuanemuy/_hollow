# PR Review #001 — feat(issue/380): ノート詳細 DTO 拡張

**PR:** #384
**Date:** 2026-05-31
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 5（Domain 1 / Frontend 1 実質 / Test 3）
- Notes: 多数（実装が計画・ADR に忠実との確認）
- Verdict: **BLOCKED**（Warning を全件修正してから再レビュー）

---

## Domain / Use Case

### Blockers
なし

### Warnings
- **[W-D1]** snippet 生成ロジックが `getNoteDetail.ts` と `getBacklinks.ts` で完全重複（`toPlainText().slice(0,200)` + 空 null 畳みの3行）。ADR-004 の「同一 DTO の挙動差を避ける」意図に対し「同じ生成を別々に書いた」状態で、片方だけ変えると静かに乖離する。
  - 提案: `view.ts` に純粋ヘルパ `buildBacklinkSnippet(plainText)` または snippet 生成ヘルパを切り出して両 usecase から呼ぶ。（既存コードベースに同パターンの重複が他4箇所あるため Blocker ではないが、本 PR 内の2箇所は集約可能）

### Notes
- computeSegments のロジック・型安全・レイヤー責務・後方互換・null 安全・パフォーマンスはいずれも正当と確認（N-001〜N-007）。

## Frontend

### Blockers
なし

### Warnings
- **[W-F1]** `NoteMetaPanel.tsx:74` の snippet span に `[overflow-wrap:anywhere]` が付くが、親 `<Link>` が既に同指定を持つため冗長。参照パターン（TileView excerpt）とも不一致。
  - 提案: snippet 行から `[overflow-wrap:anywhere]` を外し excerpt 既存パターンに一致させる。

### Notes
- props 変更・全セグメントリンク化・key 一意性・a11y（aria-current / nav label / aria-hidden）・HTML 妥当性・Styling 規約遵守を確認（N-001〜N-006）。

## Test

### Blockers
なし

### Warnings
- **[W-T1]** 空本文 referrer の snippet=null 自動テストが欠落。ADR-003 の null 畳み分岐が未検証。`contentHtml: "<p></p>"` の referrer で `snippet === null` を1ケース追加。
- **[W-T2]** `getBacklinks` ユースケース側の snippet 検証が皆無。別コードパスのため getNoteDetail テストでは担保されない。`getBacklinks` テストに snippet アサーションを追加。
- **[W-T3]** 200文字 slice 境界が未検証。長文 referrer（>200字）で snippet が200字に切られることを検証するケースを追加。

### Notes
- seedChildDirectory ヘルパの schema 整合・root→leaf 順の厳密 toEqual・plaintext 反映・既存テスト非破壊を確認（N-001〜N-005）。

---

## Design Decisions

このラウンドで新たな設計判断なし。W-D1 への対応（snippet 生成ヘルパ抽出）は ADR-004 の意図をコードで担保する改善であり、既存方針の延長。
