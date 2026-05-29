# PR Review #001 — アップロード前にカスタムプロンプトを入力できる画面を追加 (#228)

**PR:** #339
**Date:** 2026-05-30
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 4
- Notes: 多数（良好）
- Verdict: **BLOCKED**（Warning 修正のため。Blocker は 0）

レビューレイヤー: Domain / Use Case / Adapter / Frontend / Test の5並列。

---

## Domain

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- VO バリデーション（16 KiB バイト計測・空正規化）、discriminated union 各遷移の override 保持（`...job` スプレッド）、reconstruct ラウンドトリップ、`buildBase` の Pick 追加、errorCode 命名（`ingestion_invalid_prompt_override`）、ドメイン純粋性すべて健全。errorCodeNaming テスト 538 件 pass。

## Use Case

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- override 優先・空フォールバック（structure/metadata 独立解決、override 側は resolver 非呼出）、`promoted.promptOverride` 経由（DB 再ロード不要）、structure override の LLM 経由 kind 限定、ドメインロジック漏出なし、UoW/イベント境界維持、broad try/catch 不増、型安全すべて適切。

## Adapter / Infrastructure

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- スキーマ nullable 2列、マイグレーション 0012 後方互換・手書き内容正、toEntity↔toRowValues マッピング整合、`save` の `.set()` に override 非含有（ADR-002 provenance 不変条件）をコードと統合テストで担保、driver エラー変換契約維持、`as string` キャスト妥当。

## Frontend

#### Blockers
- なし

#### Warnings
- **[W-001]** transport の過大入力時に raw `throw new Error` → 汎用「エラーが発生しました」表示。`uploadFileFn` は手書き validator なので validation kind で返すのが他 serverFn と一貫。
  - 場所: `app/components/ingestion/actions.ts`（`readPromptOverride` over-cap throw）
  - **対応済み**: `AppServerError`（kind=validation, code=INVALID_INPUT, fieldErrors）に変更。UI に意味のあるメッセージ（422）が出るように。
- **[W-002]** 2つの textarea に `maxLength` がない（他フォームは `maxLength` を持つ慣習）。
  - 場所: `app/components/ingestion/UploadDialog.tsx`（2 textarea）
  - **対応済み**: `maxLength={16 * 1024}` を両 textarea に付与。

#### Notes
- state 管理・dialog 再オープン時リセット・`submitFiles` の useCallback 依存・単一/複数両経路の append・transport 検証（File 除外・バイトガード）・a11y（label/htmlFor・details/summary）・Tailwind utility-first 規約すべて適切。

## Test

#### Blockers
- なし

#### Warnings
- **[W-001]** transport `readPromptOverride` の自動テストが皆無（plan が「テストで固定」と明記したフィールド名契約・DoS ガードが手動ブラウザ検証任せ）。
  - 場所: `app/components/ingestion/actions.ts`（`readPromptOverride`）
  - **対応済み**: `readPromptOverride` を export し、`__tests__/readPromptOverride.test.ts` を新規作成（trim/空→undefined/File 無視/over-cap throw(validation)/フィールド名固定/境界値）。
- **[W-002]** UI 側 FormData 配線（フィールド名契約・複数ファイル全件適用）が `UploadDialog.test.tsx` 未カバー。
  - 場所: `app/components/ingestion/__tests__/UploadDialog.test.tsx`
  - **対応済み**: 単一/複数ファイル submit で FormData に override が入る／空時は付かないテストを追加（全件適用＝完了条件1を担保）。

#### Notes
- ドメイン/usecase/adapter のカバレッジは plan 方針を的確に充足。VO 境界・entity 正規化/保持/ラウンドトリップ・adapter ラウンドトリップ/save 不変・usecase override 優先(resolver 未呼出を厳密 assert)/フォールバック/regenerate 後保持すべて良好。
- `entity.property.test.ts` は更新不要だった（create のみ使用・override オプショナル）ことを確認。

---

## Design Decisions

このラウンドで新規の設計判断なし。過大入力エラーを validation kind に変更した点は ADR-003（transport 2点検証）の具体化で、既存 ADR の範囲内。

## 修正結果

全 4 Warning をその場で修正。`pnpm typecheck` pass、`biome check` clean、`pnpm test:unit` 2806 件 pass（ingestion 系 37 件含む）。
