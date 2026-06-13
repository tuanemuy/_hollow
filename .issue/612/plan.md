# 実装計画 — Issue #612: 公開プロフィールの publicNoteCount が trashed-but-public を過大カウント

**Issue:** #612
**作成日:** 2026-06-13
**複雑度:** 中〜大規模

---

## 目的

公開プロフィールのヒーローに出す `publicNoteCount` を、relay-lag 中の trashed-but-public ノートを除外した live な公開ノート件数に修正し、同一ページの listing total（#605 経路）と整合させる。あわせて現行 `limit: 1000` による件数頭打ちも解消する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | trash 済み（`notes.status = 'trashed'`）だが公開 `publication_states` 行が残るノートが `publicNoteCount` に含まれない | Issue 本文「期待動作」 | 2, 3 |
| AC-2 | 同一公開トップページで `publicNoteCount`（ヒーロー）と listing `total`（`listUserPublicNotes`）が、デフォルト経路（sort=publishedAt・タグ/期間フィルタ無しの全件比較）でのみ厳密一致する。フィルタ適用時はヒーロー件数（全件 count）≠ listing total（フィルタ後 count）になるのは仕様どおり | Issue 本文「実際の動作」/ #605 整合要件 | 2, 3, 4 |
| AC-3 | 公開ノートが 1000 件を超えても `publicNoteCount` が頭打ちにならず実件数を返す | Issue 補足「limit:1000 頭打ち」 | 2, 3 |
| AC-4 | `listRelatedPublicNotes` / `deleteAccount` の挙動（特に deleteAccount が trashed-but-public 行も private に flip する掃除）が変わらない | Issue 補足「3呼び出し元共有」 | 1（不変更の確認） |
| AC-5 | 新メソッドの active JOIN・visibility・published_at NOT NULL 条件が D1 integration test で検証される | docs/test.md / #605 testing 方針 | 5 |

## スコープ

### 含まれないもの

- `findPublicByOwner` 自体への active JOIN 追加（deleteAccount の掃除を壊すため。ADR-001 参照）。
- `listRelatedPublicNotes` の改変（既に in-memory で active 再フィルタ済みで正しい）。
- `deleteAccount` の改変（trashed-but-public 行を拾う現挙動が正しい）。
- 公開プロフィール以外の画面・集計。

## 調査結果

- 関連ファイル:
  - `app/core/domain/publication/ports/publicationStateRepository.ts` — ポート IF。`findPublicByOwner` / `listPublicNoteIdsByOwnerSorted` 等を定義。
  - `app/core/adapters/d1/repositories/publicationStateRepository.ts` — D1 実装。`findPublicByOwner`（active JOIN なし、L197-222）、`listSortedAll`（active JOIN + count、L251-287）。
  - `app/core/application/publication/getPublicProfile.ts` — `findPublicByOwner({limit:1000}).length` で件数導出（L39-45）。修正対象。
  - `app/core/application/publication/listUserPublicNotes.ts` — listing total を `listPublicNoteIdsByOwnerSorted`（= `listSortedAll`、active JOIN count）から取得。`publicNoteCount` の整合先。
  - `app/core/application/publication/listRelatedPublicNotes.ts` — `findPublicByOwner({limit:1000})` over-fetch 後に in-memory で active 再フィルタ済み（L87-114）。正しい。不変更。
  - `app/core/application/identity/deleteAccount.ts` — `findPublicByOwner` を keyset cursor で全 public 行を walk し private に flip（L56-90）。trashed-but-public 行も拾う必要がある。不変更。
  - `app/components/public/UserPublicTop.tsx` — `publicNoteCount`（ヒーロー L174）と listing `total` を同一ページで並べて表示（L122）。両者の不一致が Issue の症状。
  - `app/core/adapters/d1/__tests__/publicationStateRepository.integration.test.ts` — `listPublicNoteIdsByOwnerSorted` の D1 integration test。`seedNote` が `status: 'active' | 'trashed'` を取れる（L74-105）。新メソッドのテストはここに追加。
- あるべきアーキテクチャ:
  - ヘキサゴナル/DDD。依存は内向き（domain port → adapter、usecase は port に依存）。read-only listing は id 射影 + total を返し、cross-aggregate JOIN は adapter の read-only SQL に限定（CLAUDE.md / port JSDoc）。
  - 件数算出の確立パターン: `listSortedAll`（L251-287）が `innerJoin(notes, eq(notes.id, publicationStates.noteId))` + `eq(notes.status, "active")` で count と page を同一母集合から算出。`listPublicNoteIdsByOwnerInRange`（L347-373）も同 JOIN。これが #605 P-002（trashed-but-public の total 膨張防止）の確立形。
  - 入力検証は transport 境界と値オブジェクト構築の2点。usecase 間は静的型を信頼。
- 既存実装の状態:
  - listing 経路（#605）は active JOIN 済みで正しい。`getPublicProfile` は別経路（`findPublicByOwner`）のまま未修正で、あるべき姿（active 母集合での件数）と乖離。本 Issue で件数専用 count メソッドを追加して是正する。
  - `findPublicByOwner` は 3 呼び出し元で共有。うち 2 つ（listRelatedPublicNotes / deleteAccount）は現挙動が正しいため、共有メソッドを改変せず getPublicProfile だけを新メソッドに切り替える。
- 依存関係:
  - 新メソッド追加は port IF → adapter → usecase の順で内向きに閉じる。presentation（UserPublicTop）は usecase 出力 `publicNoteCount` の型・意味が不変なので変更不要。
  - `D1PublicationStateRepository` 以外に `PublicationStateRepository` の本番実装・fake は存在しない（テストは D1 integration 中心）。port 追加で更新が必要な実装は D1 のみ。

## 設計

### ドメインモデルへの影響

ポート `PublicationStateRepository` に件数専用の読み取りメソッド `countPublicByOwner(ownerId): Promise<number>` を 1 つ追加する。エンティティ・値オブジェクト・不変条件の変更はなし。read-only count 射影なので集約境界（publication 集約が publication_states を、active 判定のための notes JOIN は read-only SQL に限定）は維持される。`listSortedAll` / `listPublicNoteIdsByOwnerInRange` と同じ「公開面の count は active 母集合で数える」契約を JSDoc に明示する。

### ユースケース / アプリケーションロジック

`getPublicProfile` を `findPublicByOwner({limit:1000}).length` から `countPublicByOwner(user.id)` に切り替える。これにより:
- active JOIN 母集合で数えるため trashed-but-public が除外される（AC-1）。
- COUNT クエリに limit は不要なため 1000 件頭打ちが消える（AC-3）。
- listing total（`listSortedAll` の count）と同一の母集合・同一の WHERE 条件（owner + public + published_at NOT NULL + active）で数えるため整合する（AC-2）。ただし厳密一致はデフォルト経路（sort=publishedAt・タグ/期間フィルタ無し）でのみ成立する。フィルタ適用時はヒーロー件数（フィルタ非依存の全件 count）≠ listing total（フィルタ後 count）になるが、これは仕様どおり。

`listRelatedPublicNotes` / `deleteAccount` は `findPublicByOwner` を使い続け、改変しない（AC-4）。

### アダプター / 永続化 / 外部連携

`D1PublicationStateRepository.countPublicByOwner` を `listSortedAll` の count 部分を流用して実装する:

```
SELECT count(*) FROM publication_states
  INNER JOIN notes ON notes.id = publication_states.note_id
  WHERE publication_states.owner_id = ?
    AND publication_states.visibility = 'public'
    AND publication_states.published_at IS NOT NULL
    AND notes.status = 'active'
```

`idx_pubs_owner_visibility_published_at` がそのまま効く。limit/offset/cursor なし。`mapDbError` でラップ。スキーマ変更・マイグレーションは不要。

### UI / プレゼンテーション

なし。`getPublicProfileOutput.publicNoteCount` の型（number）と意味（公開カタログ件数）は不変。`UserPublicTop` は変更不要。

## 実装ステップ

依存方向の順（内側のレイヤーが先）。

### 1. （確認のみ）3 呼び出し元の不変更を確定

- **対象ファイル:** `app/core/application/publication/listRelatedPublicNotes.ts`, `app/core/application/identity/deleteAccount.ts`
- **変更内容:** なし。本 Issue で `findPublicByOwner` を改変しないこと、両者の現挙動が正しいことを計画上で確定する（コード変更は発生しない）。
- **理由:** `findPublicByOwner` に active JOIN を足す案を退ける根拠（ADR-001）の裏取り。deleteAccount は trashed-but-public 行を private に flip する必要があり、active JOIN を足すとその行を取りこぼす。

### 2. ポート IF に `countPublicByOwner` を追加

- **対象ファイル:** `app/core/domain/publication/ports/publicationStateRepository.ts`
- **変更内容:** `countPublicByOwner(ownerId: UserId): Promise<number>` を追加。JSDoc に「owner-scoped の公開ノート件数。`listSortedAll` / `listPublicNoteIdsByOwnerInRange` と同じく `notes.status = 'active'` を INNER JOIN し、relay-lag の trashed-but-public 行を除外する。`findPublicByOwner` の `.length` と異なり active 母集合・limit なしで数えるため listing total と整合する」旨を明記。
- **理由:** 件数の意味（active 母集合）を呼び出し側に保証し、`findPublicByOwner`（active 不問）との違いを型と契約で表現する。

### 3. D1 adapter に `countPublicByOwner` を実装

- **対象ファイル:** `app/core/adapters/d1/repositories/publicationStateRepository.ts`
- **変更内容:** 設計の SQL を `mapDbError` でラップして実装。`count()` を import 済み（L4）。`notes` JOIN・条件は `listSortedAll`（L255-281）と同形。`Number(countRows[0]?.value ?? 0)` を返す。
- **理由:** 確立済み active JOIN count パターンの踏襲。limit/offset/cursor を持たないので 1000 頭打ちが原理的に発生しない。

### 4. `getPublicProfile` を `countPublicByOwner` に切り替え

- **対象ファイル:** `app/core/application/publication/getPublicProfile.ts`
- **変更内容:** `findPublicByOwner(user.id, {limit:1000})` + `.length` を `await publicationStateRepository.countPublicByOwner(user.id)` に置換。関数 JSDoc の「sourced from `findPublicByOwner`」記述を `countPublicByOwner`（active 母集合・listing total と整合）に更新。
- **理由:** AC-1/2/3 の達成。

### 5. D1 integration test を追加

- **対象ファイル:** `app/core/adapters/d1/__tests__/publicationStateRepository.integration.test.ts`
- **変更内容:** `describe("D1PublicationStateRepository.countPublicByOwner ...")` を追加。既存 `seedNote`（`status` / `visibility` / `publishedAt` 指定可）を流用し、以下を**独立したテストケース**として列挙する（除外条件の AND を 1 ケースに混ぜない）:
  - (a) active+public+published_at 複数で正しい件数。
  - (b) **「trashed だが published_at 有り」**（`status='trashed'` + public + published_at NOT NULL）が除外される（active 条件を独立に固定）。
  - (c) **「active だが published_at NULL」**（`status='active'` + public + published_at NULL）が除外される（published_at NOT NULL 条件を独立に固定）。
  - (d) private / unlisted が除外される。
  - (e) 公開行ゼロで 0。
  - (f) 他 owner 行が混入しない。
  - (g) **【必須】** 同一 owner に trashed-but-public 行を混在させた母集団で、`listPublicNoteIdsByOwnerSorted({offset:0,limit:大})` の `total` と `countPublicByOwner` が一致すること（AC-2 の adapter レベル裏取り。trashed-but-public が両者から等しく除外される回帰防止。将来 `listSortedAll` 側の WHERE 変更による drift を検知）。
- **理由:** AC-5。PublicationStateRepository の fake が無く unit では検証不能なため D1 integration で担保（#605 testing 方針に整合）。

## 設計判断

件数専用メソッド `countPublicByOwner` を port/adapter に新設し `getPublicProfile` から使う方向を採用。`findPublicByOwner` への active JOIN 追加（deleteAccount の掃除を壊す）と、呼び出し側 in-memory フィルタ（limit:1000 頭打ち・over-fetch コストが残る）を退けた。詳細は `.issue/612/adr.md` ADR-001。

## リスクと注意点

- `findPublicByOwner` を絶対に改変しない。改変すると deleteAccount が trashed-but-public 行を private に戻せず掃除が不完全になり、keyset cursor の意味（全 public 行の安定 walk）も崩れる。
- 新メソッドの WHERE 条件は `listSortedAll` と完全一致させる（owner + visibility=public + published_at NOT NULL + notes.status=active）。条件がズレるとヒーローと listing total が再び乖離する。
- `published_at IS NOT NULL` を落とさない。`listSortedAll` は `isNotNull(publishedAt)` を持つので、これを欠くと total と不整合になりうる。
- presentation 出力の型・意味は不変だが、ヒーロー件数の値が（trashed-but-public 分）減るのは仕様どおりの変化であることを PR で明記する。
- AC-2 の厳密一致が成立するのはデフォルト経路（sort=publishedAt・タグ/期間フィルタ無し）に限る。タグ/期間フィルタ適用時はヒーロー件数（フィルタ非依存の全件 count）≠ listing total（フィルタ後 count）になるが、これは仕様どおりであり乖離ではない（QA/レビューでの誤検知に注意）。

## テスト方針

- D1 integration（ステップ 5）: active 母集合での件数、trashed-but-public / private / unlisted / published_at NULL 除外（trashed と published_at NULL は独立ケースで固定）、owner 分離、listing total との一致（必須ケース）。
- `pnpm typecheck && pnpm lint:fix && pnpm format` を実行。port 追加に伴う D1 実装の型エラーが出ないこと（実装が唯一の `PublicationStateRepository` 実体）。
- 手動/ブラウザ検証（任意）: #605 manual-test TC-05 相当（公開ノートを 1 件 trash し relay 前に公開トップを開き、ヒーロー件数と一覧件数が一致すること）。

## レビュー履歴

### 1周目

両視点（coverage / arch-risk）とも**問題点ゼロ**で終了。改善提案を反映: AC-2 のデフォルト経路スコープ明記、テストの除外ケース独立化と listing total 突き合わせの必須化。
