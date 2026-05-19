# PR Review #001 — Issue #36 P12 internal-link suggest popup

**PR:** #64
**Date:** 2026-05-19
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 18
- Notes: 多数
- Verdict: **BLOCKED**（Warnings 即時対応を試みる）

---

## Domain + Application

### Blockers
なし

### Warnings
- **[W-D1]** `InternalLinkSuggestion` の `noteId`/`tagId`/`slug` が `string` に格下げされている。既存 DTO (`BacklinkDTO` 等) は `NoteId`/`TagId`/`NoteSlug` branded を保持しているため非対称。→ branded 型に揃える。
- **[W-D2]** ADR-008 フィルタが limit 後段で効くため「note 全部除外 → tag が埋めない」というセマンティクス確認テストが欠落。→ integration test に 1 ケース追加。
- **[W-D3]** port JSDoc が「adapter は filter なしで返す、フィルタは usecase 責務」を明文化していない。→ JSDoc 補強。

### Notes
- N-001: Port シグネチャ・JSDoc 品質高い
- N-002: ServiceArgs / UoW / clampLimit 既存パターン整合
- N-003: ADR-008 正規表現 `/[\[\]|]/` 正しい
- N-004〜006: スタブ追加・server fn 境界バリデーション・branded 型強制が適切

---

## Adapter (D1)

### Blockers
なし

### Warnings
- **[W-A1]** `searchIndex.ts:324` に `escapeLikePattern` の重複定義が残存（ADR-007 で別 Issue としていたが、3 行 import 置換で済む）。→ helpers から import に置換。
- **[W-A2]** ASCII 外 case-folding 不整合（トルコ語 I、独語 ß 等）。→ progress.md に記録。
- **[W-A3]** 既存 `tagRepository.findByOwner` の SQL 変更後の網羅的回帰テスト不足（query なし／sort=noteCount 等）。→ 別 PR で補完（本 PR スコープ外）。

### Notes
- N-001: helpers.escapeLikePattern の JSDoc が ADR-006/007 を参照し模範的
- N-002: ESCAPE 句と escapeLikePattern が整合、integration test で実証
- N-003〜006: early return / hydrateMany / SQL injection 防御・owner 隔離が正しく実装

---

## Frontend (Editor)

### Blockers
なし

### Warnings
- **[W-F1]** `internalLinkExtension.ts` に `"use client"` プラグマ無し。現状の RSC 解析ではセーフだが、リファクタで漏れやすい。→ `"use client"` 追記。
- **[W-F2]** useMemo コメントが「extensions 配列の再生成回避」と書かれているが、`useEditor` は実は extensions 変化で再生成しない。useRef の真の目的は「クロージャ古参照回避」。→ コメント修正。
- **[W-F3]** `props as unknown as InternalLinkSuggestion` キャストが silent。`items` 戻り値型変更がコンパイルエラーにならない。→ コメント追加で意図明示。
- **[W-F4]** `allowSpaces: true` × `char: "[["` で popup 開きっぱなしのとき query が行末まで貪欲一致するリスク。→ progress.md に記録（別 Issue 候補）。
- **[W-F5]** `allowedPrefixes` デフォルト = `[' ']` のため `foo[[bar` で起動しない。→ progress.md に記録（UX 判断、別 Issue 候補）。

### Notes
- N-001: wysiwygSanitizerIntegration.test.ts に Mention 非漏洩 regression が無い（→ 本 PR 内で追加検討）
- N-002〜007: position 計算・schema 多重防御・onMouseDown 罠回避・autosave protocol 保持・Escape teardown が正しい

---

## Test

### Blockers
なし

### Warnings
- **[W-T1]** popup test の position assertion がスコープ外。→ 残すか削るか判断。
- **[W-T2]** onClick negative test 不足（onMouseDown 罠の反対側）。→ regression test を 1 本追加。
- **[W-T3]** `INTERNAL_LINK_PATTERN`/`HASHTAG_PATTERN` をテスト内ローカル再宣言、canonical drift を検知できない。→ 受容（既知のトレードオフ）。
- **[W-T4]** `]` 単独タイトル除外のテスト不足。→ シナリオ追加。
- **[W-T5]** 「note が limit を埋める→tag 0 件」の強い順序保証テスト不足。→ シナリオ追加（D-W2 と同根）。
- **[W-T6]** tag `isolates owners` で `ownerId` 直接 assert 漏れ。→ 1 行追記。
- **[W-T7]** tag case-insensitive テストが `nameNormalized` 小文字保存前提に強依存。→ 優先度低、受容。

### Notes
- N-001〜007: seed パターン・regression test・stub 設計・既存プロトコル保持が良好

---

## Design Decisions

特になし（本ラウンドでは新たな ADR は出ていない）。
