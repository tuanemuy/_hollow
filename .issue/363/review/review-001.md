# PR Review #001 — feat(#363): 取り込みのディレクトリ提案で新規ネストパス作成をサポート

**PR:** #381
**Date:** 2026-05-31
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 多数（良好）
- Verdict: **BLOCKED**（Warning 2件を解消するまで未完了。Step 7 は Blocker 0 かつ Warning 0 を要求）

レビューレイヤー: Domain / Use Case + Adapter / Frontend / Test の4並列。

---

## Domain

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- `canonicalizeSuggestedDirectoryPath` は ADR-001/003 通り（split→trim→空除去→深さ上限→各セグメント `DirectoryName.create` の best-effort null 化→join、大小文字保持）。テストが trim・空除去・大小文字保持・深さ超過・上限ちょうど・over-long・禁止文字を網羅。
- `ensureNestedPath` は ADR-002 通り（root ensure→findBySiblingName 再利用 or create+insert、空配列→root id、`TooDeep` throw）。`assertSiblingNameUnique` を ensure 経路で呼ばないのは正しい（find→なければ create で一意担保）。
- `InvalidSuggestedDirectoryName` / `SUGGESTED_DIRECTORY_NAME_MAX_LENGTH` の撤去は妥当（全コードベースに dangling 参照なし、typecheck クリーン）。

## Use Case + Adapter

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- `resolveDirectoryId` の優先順位 `explicitId > segmentsToCreate > suggestedId > suggestedNameSegments > root` は ADR-005 のフォールバック方針を正しく具現化（plan より段が1つ増えたが整合的拡張）。
- 空配列→root の畳み込みが `ensureNestedPath` 契約に正しく寄せられている。
- VO の best-effort null 化（LLM 提案）と commit の `TooDeep` throw（ユーザー入力）の役割分担が重複なく成立。検証の二重化なし。
- プロンプトは2分岐とも多階層許可へ更新済み、既存マッチ優先文言は維持。DTO/wire は意味拡張のみで後方互換。

## Frontend

#### Blockers
- なし

#### Warnings
- **[W-001]** ヒント文言・プレースホルダで「最大10階層」をハードコード
  - 場所: `app/components/note/editor/DirectoryPicker.tsx`（ヒント本文・placeholder）
  - 理由: 深さ上限の SSOT は `MAX_DIRECTORY_DEPTH`（=10）。schema 側は import して導出しているのに UI 文言だけ「10」直書きで二重管理。定数変更時に文言が静かに古くなる。
  - 提案: 文言に `MAX_DIRECTORY_DEPTH` を補間する（例 `最大${MAX_DIRECTORY_DEPTH}階層`）。

#### Notes
- `allowNestedPath` opt-in は既存 `allowExistingActions` と一貫。NoteEditor は prop 未指定で false に倒れ単一名経路を維持（`/` 禁止文字で回帰は構造的に防止）。
- transport schema の max `MAX_DIRECTORY_DEPTH * (80+1)` = 810 は per-segment 80・深さ10 と整合。`.trim()` 維持、NoteEditor 別 action に影響なし。
- スタイリングは utility-first 準拠、新規 CSS/`@apply` なし。`IngestionJobRow` クイックコミットは wire 意味拡張で自然に機能（diff 変更不要）。

## Test

#### Blockers
- なし

#### Warnings
- **[W-001]** 「case-insensitive 再利用」のテストコメントが検証内容を誇張
  - 場所: `app/core/domain/directory/__tests__/service.test.ts`（中間再利用テスト）
  - 理由: seed した中間ディレクトリと ensure 対象を**同じ大小文字**で渡しているため、コメントの "case-insensitive" 部分は実際には大小文字無視の経路を通っていない。再利用そのものは件数・parentId で担保されているが、ADR-005 中核の lower 正規化マッチが未実証。
  - 提案: コメントから "case-insensitive" を削るか、異なるケース（例 `Tech`/`tech`）で大小文字無視の再利用を実証するケースを1つ足す（後者が望ましい）。

#### Notes
- 計画テスト方針の各項目は概ね網羅。撤去した 200 字キャップの旧テストは適切に削除、残骸なし。515 integration + unit PASS、typecheck clean。
- プロンプト文言アサーションは `"nested path"` の緩い部分文字列。`"/"` や `"10 levels"` を含めるとより意味的（Note 止まり）。

---

## Design Decisions

このラウンドで新たな設計判断はなし（既存 ADR-001〜004 の範囲内）。
