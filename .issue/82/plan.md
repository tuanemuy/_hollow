# 実装計画 — Issue #82: refactor: normalize ErrorCode naming convention across domains

**Issue:** #82
**作成日:** 2026-05-21
**複雑度:** 中〜大規模

---

## 目的

全 11 ドメインの `*ErrorCode` で混在している命名スタイル（UPPER_SNAKE / lower_snake / prefix有無）を統一し、spec 文言と実装値の対称性を回復する。これにより:

- 新規 ErrorCode 追加時の判断負荷を解消する
- spec-sync 系の差分検出を機械的に行えるようにする
- 命名規約として `.issue/42/adr.md` ADR-004 の方針（spec 文言一致優先）を全ドメインに拡張する

## スコープ

### 含まれるもの

- 全 11 ドメイン（adminSettings, directory, export, identity, ingestion, media, note, publication, search, tag, view）の `errorCode.ts` の **文字列リテラル値（右辺）** を `lower_snake_case` に統一
- `PublicationErrorCode.MediaNotOwned` の値を spec 文言一致の `"media_not_owned"` に統一（ADR で特例として記録）
- 再発防止用の単体テスト（`errorCodeNaming.test.ts`）を追加
- 命名規約を `CLAUDE.md` の Error handling セクションに追記
- 値変更に追従する必要のあるテスト・production コードの修正
- ADR の作成（`.issue/82/adr.md`）

### 含まれないもの

- **TS シンボル名（property key）の変更**: `NoteErrorCode.InvalidId` のような参照は不変（呼び出し側 700+ 箇所への波及を避ける）
- **prefix の強制統一**: spec が prefix なしで書いている lower_snake 値（`slug_conflict`, `edit_locked_by_other`, `cannot_rename_root` 等）は spec 一致を優先して維持
- **spec 文言の変更**: spec は SSOT、コードを spec に合わせる
- **`SystemErrorCode` の変更**: 横断技術コード（`OPTIMISTIC_LOCK_FAILURE` 等）は driver-level conflict code として UPPER_SNAKE のまま温存
- **`*ErrorCode` 定数経由でない `BusinessRuleError("...")` リテラル直書きの定数化**: `identity/challenge.ts` の `token_*` 系、`common/version.ts` の `INVALID_VERSION` 等の定数化は別 Issue 候補（ADR でメモのみ）
- **i18n 連携 / ログ・監視ダッシュボードの値追従**: 該当連携は確認できなかったため、本 Issue では考慮不要。確認漏れが見つかった場合は別 Issue で扱う

## 調査結果サマリー

### 命名スタイル分布（11 ドメインの errorCode.ts）

| ドメイン | UPPER件数 | lower件数 | 一貫性 |
|---|---|---|---|
| adminSettings | 13 | 0 | 一貫（UPPER） |
| directory | 5 | 9 | **混在** |
| export | 17 | 3 | **混在** |
| identity | 19 | 14 | **混在** |
| ingestion | 23 | 0 | 一貫（UPPER） |
| media | 17 | 2 | **混在** |
| note | 16 | 8 | **混在**（Issue 起点） |
| publication | 11 | 0 | 一貫（UPPER）※ `MediaNotOwned` のみ spec 不一致 |
| search | 16 | 0 | 一貫（UPPER） |
| tag | 8 | 0 | 一貫（UPPER） |
| view | 13 | 0 | 一貫（UPPER） |
| **合計** | **158** | **36** | **混在 5 / 一貫 6** |

### spec 文言調査

- `spec/testcases/` / `spec/usecases/` / `spec/domains/` の `BusinessRuleError('...')` リテラル: **全件 lower_snake**（UPPER_SNAKE は 0 件）
- spec は SSOT として尊重し、コード側を spec に揃える方向で進める

### 依存関係

- **presentation 層**: `errorResponse.ts` / `errorDisplay.ts` は code 値を構造的にしか扱わず、UPPER_SNAKE 依存は driver-level conflict code（`OPTIMISTIC_LOCK_FAILURE` 等）のみ → 影響なし
- **frontend**:
  - `app/components/note/editor/useEditLock.ts` の `HELD_BY_OTHER_CODES`: 値は既に lower（変更不要）
  - `app/components/auth/*` で `error.code === "token_*"` / `"unverified"` などを直接比較（全 lower、変更不要）
  - `app/components/export/ExportJobDetail/Page.tsx`: `ExportErrorCode.Unauthorized` 経由（値変更で自動追従）
- **テスト**: 200+ 件は `*ErrorCode.X` 経由で参照（値変更で自動追従）。UPPER_SNAKE 文字列を直接 assert している箇所のみ追従修正が必要

## 実装ステップ

### 1. ADR の作成

- **対象ファイル:** `.issue/82/adr.md`（新規）
- **変更内容:**
  - ADR-001: `*ErrorCode` の値は `lower_snake_case` に統一（spec 文言一致優先）
  - ADR-002: prefix の有無は spec 文言を踏襲（強制統一はスコープ外）
  - ADR-003: `SystemErrorCode` はスコープ外（横断技術コード）
  - ADR-004: `PublicationErrorCode.MediaNotOwned` を spec 文言一致のため `"media_not_owned"` に統一（異ドメイン間の値重複を容認）
  - ADR-005: 再発防止は単体テスト（`errorCodeNaming.test.ts`）で行う（Biome カスタムルールは採用しない）
- **理由:** 規約変更は ADR で記録するのがプロジェクト規約

### 2. CLAUDE.md に命名規約を追記

- **対象ファイル:** `CLAUDE.md`
- **変更内容:** Error handling セクションに次の段落を追加:
  > `*ErrorCode` 定数の値（右辺リテラル）は `lower_snake_case` で記述する。spec の `BusinessRuleError('...')` 文言と一致させる。property key は PascalCase。横断技術コードを扱う `SystemErrorCode` のみ例外的に `UPPER_SNAKE`。
- **理由:** 新規追加時の判断負荷を文書化で解消する

### 3. 11 ドメインの正解値マッピングテーブルを確定する（実装前）

11 ドメイン × 全 property の **正解値テーブル**を作成し、ADR の付録として残してから書き換えに着手する（レビュー P-001 反映）。

#### 値決定フローチャート（ADR-002 の機械適用版）

各 `*ErrorCode` の property（例: `NoteErrorCode.InvalidId`）について:

1. **spec/testcases/ / spec/usecases/ / spec/domains/ を `grep -rE "BusinessRuleError\('[^']+'\)" spec/` で全 spec 文言を抽出**
2. **property の意味と完全に対応する spec 文言が 1 件のみ存在** → その文言をそのまま value とする
3. **複数の spec 文言が同じ property に対応する場合**（例: `NoteErrorCode.AlreadyTrashed` に対し SaveNote は `'note_trashed'`、DeleteNote は `'note_already_trashed'` を要求）
   - 既存実装の value（`note_already_trashed`）を維持し、もう片方の文言は **本 Issue では `*ErrorCode` 定数化せず、現状のリテラル直書きを温存**（ADR-006 で既知の不整合として列挙）
4. **同じ意味の spec 文言が複数ドメインで共有される場合**（例: `media_not_owned`）→ ADR-004 の特例として全ドメインで同値を採用
5. **spec に該当文言が無い** → `{domain}_{snake_case_of_property_key}` をデフォルトとする（例: `NoteErrorCode.InvalidTitle` → spec 文言なし → `note_invalid_title`）
6. **`cannot_*_root` のように spec が prefix 無しで定めている** → そのまま prefix を付けない

#### 正解値テーブル作成手順

実装フェーズの最初に以下を実施:

```bash
# spec 全文言を抽出
grep -rhE "BusinessRuleError\('[^']+'" spec/ | grep -oE "'[a-z_]+'" | sort -u > /tmp/spec_codes.txt

# 各 *ErrorCode の全 property を抽出（11 ドメイン分）
for d in adminSettings directory export identity ingestion media note publication search tag view; do
  echo "=== $d ==="
  cat app/core/domain/$d/errorCode.ts
done
```

これらの突合を行い、上記フローチャートに従って `.issue/82/error-code-mapping.md`（または ADR 付録）に「現状値 → 新値 → 根拠」表を作成する。曖昧なケース（特に下記）は ADR に判断を明記:

- `NoteErrorCode.ContentTooLarge` vs spec `'content_too_large'`（prefix なし）
- `TagErrorCode.MergeOwnerMismatch` vs spec `'tag_owner_mismatch'`
- `TagErrorCode.MergeSameTag` vs spec `'tag_merge_same'`
- `ViewErrorCode.NameConflict` vs spec `'saved_view_name_conflict'`
- `IngestionErrorCode.InvalidStateForCommit/Regenerate/Discard` vs spec `'invalid_status_for_*'`（"state" vs "status"、prefix なし）
- `PublicationErrorCode.ShareLink*` vs spec の prefix なし `share_link_*`
- `PublicationErrorCode.ShareLinkRevoked` の値変更が **`ShareLinkGate` の既存バグを副次的に修正する**（後述 P-004 反映）
- `NoteErrorCode.AlreadyTrashed` の重義性（前述 #3）

### 4. 11 ドメインの errorCode.ts を機械的に変換

Step 3 の正解値テーブルに従って書き換える。**property key は不変**、value のみ変更。書き換え対象の概算件数（ドメイン単位、確定値は Step 3 のテーブルで決まる）:

- adminSettings: 13 件 UPPER → lower
- directory: 5 件 UPPER → lower（既存 lower の `cannot_*_root` は維持）
- export: 17 件 UPPER → lower（`pdf_export_not_implemented_in_mvp` は維持）
- identity: 19 件 UPPER → lower（既存 lower の `user_not_*`, `email_taken` 等は維持）
- ingestion: 23 件 UPPER → lower（`invalid_status_for_*` 系は spec 文言一致を採用）
- media: 17 件 UPPER → lower（既存 lower の `media_not_owned`, `media_not_viewable` は維持）
- note: 16 件 UPPER → lower（既存 lower の `slug_conflict`, `edit_locked_by_other` 等は維持）
- publication: 11 件 UPPER → lower。`PUBLICATION_MEDIA_NOT_OWNED` → `media_not_owned`、`PUBLICATION_SHARE_LINK_*` → `share_link_*`（spec 文言一致）
- search: 16 件 UPPER → lower
- tag: 8 件 UPPER → lower
- view: 13 件 UPPER → lower（`saved_view_*` 系は spec 文言一致）

### 5. UPPER_SNAKE 文字列リテラルを直接アサートしているテスト・コードを追従

- **検出方法:** `grep -rnE "\"[A-Z][A-Z0-9_]+\"" app/ | grep -E "NOTE_|MEDIA_|EXPORT_|INGESTION_|VIEW_|TAG_|DIRECTORY_|SEARCH_|PUBLICATION_|ADMIN_SETTINGS_|USER_|USERNAME_|PASSWORD_|EMAIL_|CHALLENGE_|CREDENTIAL_|DISPLAY_NAME_|BIO_|MEDIA_ASSET_ID_"`
- **対応:** ヒットした test の expect リテラルや production コードの引数を新値に書き換える
- **注意:** `NotFoundError("XYZ_NOT_FOUND")` 系は application 層エラーで `*ErrorCode` 対象外 → 触らない
- **追加チェック（レビュー P-003 反映）:** `ingestion_jobs.error_code` / `export_jobs.error_code` 列に永続化される値も変わるため、関連する test fixture（`runIngestionJob.integration.test.ts:787` 等）と seed が UPPER 値を期待していないか確認。`expect(rows[0]?.errorCode).toBe(IngestionErrorCode.UnsupportedFormat)` のような property key 経由比較は自動追従するが、リテラル直書きがあれば修正

### 6. 再発防止テストを追加

- **対象ファイル:** `app/core/domain/__tests__/errorCodeNaming.test.ts`（新規ディレクトリ + ファイル）
- **変更内容（レビュー S-001/S-004 反映）:**
  - **glob で全 `app/core/domain/*/errorCode.ts` を動的列挙**（手動追記漏れ防止）。Vitest は Vite ベースのため `import.meta.glob('../*/errorCode.ts', { eager: true })` が利用可能
  - 全 ErrorCode の **value** が `/^[a-z][a-z0-9_]*$/` にマッチすることを検証
  - 全 ErrorCode の **key** が `/^[A-Z][A-Za-z0-9]*$/` にマッチすることを検証（PascalCase 強制）
  - **regex 自己検証**: `expect(validValueRegex.test("UPPER_VALUE")).toBe(false)` / `expect(validValueRegex.test("good_value")).toBe(true)` を同ファイル内に追加。検証ロジック自体を CI で常時検証する
- **理由:** 命名規約違反を CI で自動検知。Biome のカスタムルールより低コストで保守可能

### 7. 全体検証

- **コマンド:** `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test`
- **理由:** CLAUDE.md の規約「変更後は typecheck / lint:fix / format を必ず実行」。値変更は `(typeof X)[keyof typeof X]` の literal union を通じて全 callsite に型として伝播するため tsgo が漏れを検出する

### 8. 副次バグ修正の確認（レビュー P-004 反映）

- **背景:** `app/components/public/ShareLinkGate/index.tsx:73-76` で `state.error.code === "share_link_revoked"` と比較しているが、対応する `PublicationErrorCode.ShareLinkRevoked` の現状値は `"PUBLICATION_SHARE_LINK_REVOKED"` で一致しておらず、リンク失効時の表示が実は壊れている。本 Issue の lower 化で副次的に修正される
- **対応:** testing.md の項目 6 を強化し、revoked share link を踏んだ際の表示が修正前後で挙動が変わる旨を明記。manual-test で実機確認する

## 設計判断

詳細は `.issue/82/adr.md` を参照。

- **TS シンボル名は不変**: 呼び出し側 700+ 箇所への影響を避けるため、property key（PascalCase）は変更しない
- **spec を SSOT として尊重**: spec の `BusinessRuleError('...')` 文言と実装値を一致させる方向で統一
- **prefix の強制統一はしない**: spec が prefix 無しで書いている値はそのまま維持（ADR-004 の精神）
- **`SystemErrorCode` は対象外**: driver-level conflict code は UPPER_SNAKE のまま
- **`PublicationErrorCode.MediaNotOwned` は spec 一致のため値重複を容認**: 異ドメインで同じ意味のコードを共有

## リスクと注意点

- **R1 値変更による hard-coded assertion の break**: テスト内 UPPER_SNAKE 文字列リテラル直書きは Step 4 で全件検出・修正する
- **R2 ログ・監視への影響**: 本リポジトリは未本番稼働の前提。本番化前に運用ダッシュボードの依存があれば別途同期する（ADR でメモ）
- **R3 公開 API への波及**: TanStack Start の server-function 経由の一体型構成で、外部 SDK 向けの公開 API は無いとみなす。HTTP レスポンスの `code` フィールドは内部利用のみと想定
- **R4 `PublicationErrorCode.MediaNotOwned` の値重複**: `MediaErrorCode.NotOwned`, `NoteErrorCode.MediaNotOwned`, `PublicationErrorCode.MediaNotOwned` が同値 `"media_not_owned"` になる。これは spec 由来の意図された設計。test 内で「どのドメインから来たか」を `code` 値で識別している箇所は無いことを確認
- **R5 一括変更**: 11 ドメインを単一 PR で一括変更する。複数 PR に分けると一時的な不整合期間が発生するため

## テスト方針

- **型チェック (`pnpm typecheck`)**: `(typeof XxxErrorCode)[keyof typeof XxxErrorCode]` の literal union が新値に追従。型エラーが出れば修正漏れ
- **ユニット/インテグレーションテスト (`pnpm test`)**: 既存 200+ 件のシンボル参照テストは自動追従。UPPER 文字列直書きは Step 4 で修正
- **新規 `errorCodeNaming.test.ts`**: 全 ErrorCode が新規約に合致することを担保
- **動作確認 (manual-test)**: 値変更のみで UI / API 表面の挙動は変わらない。frontend での `error.code === "edit_locked_by_other"` 等は値が変わらないため挙動不変。manual-test は最小スポット確認（後述 testing.md 参照）

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | ○（spec 文言一致と PublicationErrorCode 特例の指摘） | ○（再発防止テストの提案） | ○（最小変更と prefix 維持の判断） |
| 推奨方針 | 候補A: lower_snake_with_prefix | 候補A: lower_snake_case | 候補A: lower_snake_with_prefix |
| 取り込んだ点 | `PublicationErrorCode.MediaNotOwned` の特例化、prefix 統一規則 | `errorCodeNaming.test.ts` による再発防止、CLAUDE.md ドキュメント化 | TS シンボル名不変、UPPER のみ機械変換、prefix なし lower の温存 |

## レビュー反映

### 修正した点

- **P-001（両エージェント）**: Step 3 を「ドメイン別 prefix 決め打ち」から「正解値マッピングテーブル + 値決定フローチャート」へ書き直し。実装着手前に `.issue/82/error-code-mapping.md` で 11 ドメイン × 全 property の正解値を確定する手順を追加
- **P-002（要件カバレッジ）**: ADR-001 / ADR-006 を更新し、「spec 文言との整合」の意味を「現状 `*ErrorCode` 定数に存在する value を spec 文言に揃える」に明確化。spec に存在するが `*ErrorCode` 定数化されていない文言（`note_trashed`, `unsupported_format`, `size_exceeded`, `content_too_large`, `invalid_status_for_*`, `visibility_private` 等）の対応は「既存 property に該当があればそれを spec 文言に揃える、無ければ別 Issue で定数化」と境界を明示
- **P-002（実現可能性）**: `NoteErrorCode.AlreadyTrashed`（値 `"note_already_trashed"`）と spec の SaveNote/RenameNote が期待する `'note_trashed'` の食い違いを ADR-006 に既知の不整合として記録。本 Issue では `AlreadyTrashed` の値（DeleteNote spec 一致側）を維持し、`note_trashed` リテラル直書き側は別 Issue で定数化
- **P-003（実現可能性）**: `ingestion_jobs.error_code` / `export_jobs.error_code` 列への永続化を Step 5 の追加チェックとリスク（R6 として ADR-001 トレードオフ）に明記
- **P-004（実現可能性）★**: `ShareLinkGate` の `share_link_revoked` 比較が現状壊れており、本 Issue で副次的に修正される事実を Step 8 として独立追加。testing.md にも実機確認項目を追加
- **P-003（要件カバレッジ）**: testing.md のスポット照合を「全 11 ドメインの spec 文言と value の対称性を `errorCodeNaming.test.ts` 内で検査する」設計に変更（spec ファイルから動的に文言抽出し、`Object.values(*ErrorCode)` との集合演算で検査）

### 取り込んだ改善提案

- **S-001**: `errorCodeNaming.test.ts` を `import.meta.glob` で全 `*/errorCode.ts` を動的列挙する設計に変更
- **S-002**: ADR-002 の prefix 規則を Step 3 内で「値決定フローチャート」として機械適用可能に書き直し
- **S-004**: regex 検証ロジック自体を `errorCodeNaming.test.ts` 内で `expect(regex.test(...)).toBe(...)` で常時検証
- **S-005**: ADR-006 の対象リストに `changePublicationVisibility.ts:63` / `issueShareLink.ts:66` / `listShareLinks.ts:38` の `"note_trashed"` リテラル直書きを追加列挙

### 見送った提案とその理由

- **S-003（PR 分割）**: 「ADR + テスト + 1 ドメイン pilot」と「残り 10 ドメイン」の 2 PR 分割案。pilot で規約を確立する利点はあるが、ADR-001 で「property key 不変 + 値の lower 化」という枠が既に明確で、PR 分割しても規約議論は再燃しない。`errorCodeNaming.test.ts` を最初の commit で導入し、ドメイン単位で commit を分けることで PR 内のレビュー単位を確保する方針で対応。1 PR に統合することで「全ドメイン揃った状態」のレビューがしやすい利点を優先する
