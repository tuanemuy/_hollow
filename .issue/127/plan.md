# 実装計画 — Issue #127: note_internal_links.resolved_note_id が null のまま残るケースの調査

**Issue:** #127
**作成日:** 2026-05-29
**複雑度:** 中〜大規模

---

## 目的

`note_internal_links.resolved_note_id` が、リンクテキストに対応するノートが存在する場合に正しく解決されている状態にする。本 Issue は原因未特定の調査系として起票されたが、調査の結果、根本原因を **`resolveInternalLinks` の照合キーの不整合（title を slug として照合している）** と断定した。これを修正する。

## 根本原因（確定）

フロントエンドは内部リンクを **タイトル文字列**で挿入するのに、サーバーの解決ロジックはそれを **slug** とみなして照合しているため、title-keyed リンクは事実上ほぼ解決されず `resolved_note_id` が null のまま残る。

確定の根拠（file:line）:

1. **挿入はタイトル** — `app/components/note/editor/internalLinkSuggest.ts:25` の `formatInternalLinkInsertion` が `[[${suggestion.title}]]` を挿入する。slug ではない。ADR-008（`.issue/36/adr.md`）が「`[[title]]` 挿入」を正式仕様として確定しており、`searchInternalLinkTargets.ts:90-94` ではタイトルに `[ ] |` を含むノートをサジェストから除外してまでタイトル挿入の round-trip を守っている。
2. **抽出は target=タイトル** — `app/core/domain/note/service.ts:120-134` の `extractMetadataFromHtml` が `[[target]]` の `target`（タイトル文字列）を、UUIDv7 でなければ `kind=title` の `target` に格納する。
3. **解決は slug 照合（バグ）** — `app/core/domain/note/service.ts:181-189` の `resolveInternalLinks` が、`kind=title` の `ref.target`（タイトル）を `NoteSlug.create(ref.target)` に通して `findByOwnerAndSlug` で照合している。`NoteSlug` の pattern は `/^[a-z0-9][a-z0-9-]*$/`（`valueObject.ts`）なので、大文字・空白・日本語を含む通常のタイトルは即 throw → `catch`（service.ts:190-194）→ `withResolved(ref, null)`。仮に throw しなくても、slug 照合はタイトルにヒットしない。
4. **ドキュメントと実装の乖離** — service.ts:163-168 の JSDoc は「Resolve `kind=title` references to ids by looking up the owner's note catalogue」と書いており、**タイトルで引く意図**だったが実装が slug になっている。あるべき姿（title 照合）に寄せるのが正。

### 原因候補の検証結果

| 候補 | 検証結果 |
|---|---|
| ノート作成時に呼ばれない | 呼ばれる（`createNote.ts` → `assembleFromInputs` → `resolveInternalLinks`）。が slug 照合のため null。 |
| 編集時に再解決されない | `saveNote.ts` で `contentHtml/tagNames/internalLinkRefs` のいずれかが渡れば再アセンブルされる。タイトルのみ更新時は再解決されないが本バグの主因ではない。 |
| リンク先が後から作成された場合の再解決欠如 | バックフィル機構は**存在しない**。ただし本 Issue の主因ではなく二次的。→ スコープ外（後述）。 |
| ingestion との差異 | 差異なし。`commitIngestionPreview.ts` も同じ `assembleFromInputs` を通る。 |
| ref.target と resolvedNoteId の関係検証漏れ | これが根本原因（title を slug 扱いしている照合キーの型/意味不一致）。 |

## スコープ

### 含まれるもの

- `kind=title` の内部リンクを **タイトル完全一致**（case-insensitive）でノートに解決するよう `resolveInternalLinks` を修正する。
- `kind=id`（`[[<uuid>]]`）の内部リンクも、対象が **active かつ同一 owner** のノードのとき `resolved_note_id` を埋める（存在確認付き。ブラウザ検証 TC-005 で発覚した既存バグ。ADR-007）。
- 解決に必要な「owner スコープのタイトル完全一致 lookup」をポート / アダプタに追加する。
- 同名タイトルが複数ある場合の決定的な選択規則を実装する。
- `resolveInternalLinks` のユニットテスト（現在ゼロ）と、create / save / ingestion 経路の統合テストを追加する。

### 含まれないもの

- **リンク先ノートが後から作成 / 改名 / 削除されたときの既存リンクのバックフィル / 再解決機構** — 作成・改名・削除の各イベントでの再解決という独立した大きめの機構であり、本 Issue の「対応するノートが存在する場合に正しく解決される」という期待動作とは別軸。Phase 4 で follow-up Issue として切り出す。
- **既存 DB の `resolved_note_id IS NULL` 行の一括バックフィル** — 修正後は対象ノートを再保存すれば自動的に埋まる。一括移行は運用判断であり本 Issue 範囲外。
- `notes` への `title_normalized` カラム追加（ADR-004 が `lower(title)` 関数式を選択済みのため踏襲。スキーマ変更はスコープ拡大）。
- **タイトルに `[ ` `] ` `|` を含むノートへのリンク** — `INTERNAL_LINK_PATTERN` の境界文字でありサジェストからも除外済み（ADR-008）。`[[...]]` で round-trip できないため本修正後も解決不能（broken のまま）。これは既知の制約であり本 Issue では扱わない。

## 実装ステップ

### 1. ポートにタイトル完全一致 lookup を追加

- **対象ファイル:** `app/core/domain/note/ports/noteRepository.ts`
- **変更内容:** `findActiveByOwnerAndTitle(ownerId: UserId, title: string): Promise<readonly Note[]>` を追加。case-insensitive 完全一致で active note を返す。タイトルは owner 内で一意でないため、`searchByTitlePrefix` と同じ並び（title asc, id asc）で複数返し、選択は呼び出し側（ドメインサービス）に委ねる。JSDoc に「unresolved 判定・複数一致時の選択は呼び出し側の責務」と明記。
- **理由:** title-keyed リンク解決にはタイトル完全一致引きが必須だが、現状は `findByOwnerAndSlug`（slug 完全一致）と `searchByTitlePrefix`（prefix）しかなく、完全一致 title lookup が存在しない。

### 2. アダプタ実装

- **対象ファイル:** `app/core/adapters/d1/repositories/noteRepository.ts`
- **変更内容:** 上記メソッドを実装。`lower(title) = lower(?)` の関数式で case-insensitive 完全一致。`owner_id = ?` かつ `status = 'active'` で絞り、title asc, id asc で order。`searchByTitlePrefix` の既存実装に倣う。
- **理由:** ADR-004 と整合した大小無視マッチング。owner + status 絞り込みで実用上のヒット件数は小さい前提（ADR-004 の判断根拠を踏襲）。

### 3. `resolveInternalLinks` を修正

- **対象ファイル:** `app/core/domain/note/service.ts:170-197`
- **変更内容:** `kind=title` の処理から `NoteSlug.create` を撤去し、新ポート `findActiveByOwnerAndTitle(ownerId, ref.target)` でタイトル完全一致照合する。候補が空なら `withResolved(ref, null)`（broken link は維持）、1件以上なら決定規則（ステップ4）で1件選び `withResolved(ref, candidate.id)`。`kind=id` は従来どおり素通し。
- **理由:** 根本原因の解消。あるべき姿（JSDoc が示すタイトル照合）に実装を寄せる。
- **注意（catch 完全撤去）:** 現在の `try/catch`（service.ts:190-194）は `NoteSlug.create` の throw を握り潰すためのもの。title 照合では VO の throw 経路が消え、「解決失敗」は候補空配列で表現できるため **`try/catch` は完全に撤去**する。`findActiveByOwnerAndTitle` の I/O エラー（アダプタが `mapDbError` で翻訳した `SystemError`）はそのまま UoW 境界へ伝播させる（CLAUDE.md「ドメインは I/O エラーを再翻訳しない」「ordinary application logic で broad try/catch を避ける」に合致）。範囲限定ではなく撤去が規約に沿う。

### 4. 同名タイトル複数一致時の決定ロジック

- **対象ファイル:** `app/core/domain/note/service.ts`（resolveInternalLinks 内）
- **変更内容:** 候補配列をドメイン側で `title asc, id asc` に**明示ソートしてから先頭を採用**する。空配列なら null。ポートの並び保証に暗黙依存しない（ポート実装が並びを変えても壊れない）。
- **理由:** タイトルは owner 内で一意でない。決定的な順序で1件選ぶことで結果を安定させ、テストで固定可能にする。サジェスト側（`searchInternalLinkTargets`）と同じ並びを使い、ユーザーの直感（候補リスト先頭）と一致させる。明示ソートでポート/ドメイン間の結合を緩める。

### 5. 自己参照（self-link）の除外

- **対象ファイル:** `app/core/domain/note/service.ts`（`assembleFromInputs` / `resolveInternalLinks`）、`app/core/application/note/createNote.ts`、`saveNote.ts`、`ingestion/commitIngestionPreview.ts`
- **変更内容:** `assembleFromInputs` の input に optional な `selfNoteId?: NoteId` を追加し、`resolveInternalLinks` に `exceptId` として渡す。解決候補から `id === exceptId` のノートを除外する。saveNote / commitIngestionPreview は対象ノートの既存 id を、createNote は採番済みの新規 id を渡す。
- **理由:** title 照合に変えると、本文に `[[自分のタイトル]]` を含むノートの再保存時に `findActiveByOwnerAndTitle` が自分自身を候補に含み、自分の backlink に自分が現れてしまう（slug 照合時代には無かった新挙動）。一貫した挙動（自己参照は解決しない）に固定する。ADR-005 参照。

### 6. テスト追加

- **対象ファイル:** `app/core/domain/note/__tests__/service.test.ts`（または既存テストファイル）、関連する統合テスト
- **変更内容:**
  - `resolveInternalLinks` 直接ユニットテスト: タイトル完全一致（大小違い含む）でヒット / 無一致で null / `kind=id` 素通し / 同名複数で決定的選択 / `exceptId` で自己参照を除外 / I/O エラー時は握り潰さず伝播する。
  - 統合テスト: `createNote` / `saveNote` / `commitIngestionPreview` で `[[既存ノートタイトル]]` を含む本文を投入し `note_internal_links.resolved_note_id` が埋まることを確認。`findReferrers`（backlink）が解決後にリンク元を返すこと、自己参照が backlink に現れないことを確認。ingestion 経路でも backlink 連動を確認。
  - 回帰: `internalLinkSuggest.test.ts` の `[[title]]` 挿入契約は維持。
- **理由:** 現状 `resolveInternalLinks` の直接テストがゼロ。バグの再発防止と解決経路全体の担保。

### 7. 検証コマンド実行

- **対象:** —
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` と `pnpm test` を実行。
- **理由:** プロジェクト規約。

## 設計判断

詳細は `adr.md` を参照。要点:

- **照合キーはタイトル（slug ではない）** — フロント仕様（ADR-008）が `[[title]]` 固定。slug 挿入に変えるとサジェスト UX が崩れる。
- **case-insensitive は `lower(title)` 関数式** — ADR-004 を踏襲、`title_normalized` 列追加は見送り。
- **同名複数はタイトル昇順・id 昇順で先頭採用** — 「曖昧なので未解決」も選択肢だが UX が悪い。決定的選択を採る。
- **後追いバックフィルはスコープ外** — 作成・改名・削除での再解決という独立機構。follow-up Issue。

## リスクと注意点

- **catch の完全撤去**: slug 照合撤去で VO throw 経路が消えるため `try/catch` 自体を撤去する。解決失敗は候補空配列（null）で表現し、I/O エラー（`SystemError`）は UoW 境界へ伝播させる。中途半端な範囲限定はしない。
- **空白差は問題にならない**: `NoteTitle.create`（valueObject.ts:103,116）も `InternalLinkRef` の target（valueObject.ts:360,373）も両方 trim 済み VO なので、前後空白による完全一致のすれ違いは構造的に起きない。
- **自己参照**: ステップ5で `exceptId` により除外する。createNote は挿入前なのでそもそも自分にヒットしないが、`exceptId` を渡して saveNote / ingestion と挙動を揃える。
- **パフォーマンス**: title-keyed リンクごとに lookup を逐次実行（現状の slug ループと同じ N 回）。リンク数が多い本文では将来 IN 句でまとめ引きを検討（本 Issue ではスコープ外、現状維持）。
- **`lower(title)` は index に乗らない**（ADR-004 既知トレードオフ）。owner + status で絞れる前提。
- **タイトル改名時の古い解決**: 改名で既存リンクの解決状態が古くなる。後追いバックフィルと同根でスコープ外。本 Issue では「保存時点で対応ノートが存在すれば解決される」を満たすことに集中する。
- **同名複数の見え方**: backlink の表示に影響。決定規則をテストで固定する。

## テスト方針

- **ユニット（新規）**: `resolveInternalLinks` を直接テスト（title 完全一致 / 大小違い / 無一致 null / kind=id 素通し / 同名複数の決定的選択 / exceptId で自己参照除外 / I/O エラー伝播）。
- **統合**: createNote / saveNote / commitIngestionPreview で `[[既存タイトル]]` を含む本文を投入し `resolved_note_id` が埋まること、`findReferrers` が解決後に取れること、自己参照が backlink に出ないことを確認。
- **回帰**: `internalLinkSuggest.test.ts` の挿入契約（タイトルのまま）を維持。
- **手動**: 修正前後で `SELECT count(*) FROM note_internal_links WHERE resolved_note_id IS NULL` を比較。ブラウザで `[[既存ノート]]` を本文に書いて保存 → バックリンクが表示されることを確認。

## レビュー履歴

### 1周目: 両視点ともブロッカー（問題点）ゼロで終了

**要件カバレッジ視点**: 問題点ゼロ。後追いバックフィルのスコープ外設定は妥当（Issue は「必要性検討」止まりで受け入れ基準として未確定）と確認。

**アーキ・リスク視点**: 問題点ゼロ（ブロッカーなし）。根本原因の断定・修正方針・ポート追加・アダプタ実装の実現可能性をコードで再確認。

**取り込んだ改善提案**:
- [arch S-001] 自己参照（self-link）の除外を実装ステップ5として追加、ADR-005 に記録。saveNote では title 照合で自分が候補に入りうる新挙動を明示的に除外する。
- [arch S-002] `try/catch` を範囲限定ではなく**完全撤去**する方針に確定（ステップ3 / ADR-001 更新）。
- [arch S-003] 同名複数の決定規則をドメイン側で**明示ソート**してポート順序非依存にする（ステップ4更新、ADR-003 更新）。
- [arch S-004 / req] `[ ] |` を含むタイトルは解決不能のまま（ADR-008 既知制約）をスコープ「含まれないもの」に明記。
- [req S-001] 空白差は両側 trim 済み VO のため起きないことをリスク欄に明記。
- [req S-002] I/O エラー伝播のテストケースを追加。
- [req S-003] ingestion 経路の backlink 連動確認をテストに追加。

**見送った提案**: なし（全提案がスコープ内で妥当だったため反映）。
