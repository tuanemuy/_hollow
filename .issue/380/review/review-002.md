# PR Review #002 — feat(issue/380): ノート詳細 DTO 拡張

**PR:** #384
**Date:** 2026-05-31
**Round:** 2回目（修正後の再レビュー）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 全 Warning（W-D1 / W-F1 / W-T1 / W-T2 / W-T3）の修正が妥当・回帰なしと確認
- Verdict: **APPROVED**

---

## Domain / Use Case / Test（再レビュー）

### Blockers
なし

### Warnings
なし

### Notes
- **W-D1**: `view.ts` に `buildBacklinkSnippet(htmlSanitizer, note)` を抽出。`getNoteDetail` / `getBacklinks` が共通ヘルパを呼び、slice 長・null 畳みが単一情報源に集約。抽出前後で挙動同一。
- **W-T1**: 空本文 referrer で `snippet === null` を検証（`toBeNull()`）。
- **W-T2**: `getBacklinks` の snippet 検証を追加（別コードパスを独立に担保）。
- **W-T3**: `"a".repeat(250)` で snippet 長 200 を検証。空白なしで toPlainText の whitespace collapse の影響を受けず脆くない。
- 回帰確認: typecheck パス / integration 515 件パス / biome 対象ファイルクリーン。

## Frontend（再レビュー）

### Blockers
なし

### Warnings
なし

### Notes
- **W-F1**: snippet span から冗長な `[overflow-wrap:anywhere]` を除去し TileView excerpt パターンに一致。親 `<Link>` が同指定を保持するため折返しは継続機能（回帰なし）。条件分岐・key・a11y 構造に変更なし。

---

## Design Decisions

新たな設計判断なし。1ラウンドで全 Warning を解消し APPROVED。
