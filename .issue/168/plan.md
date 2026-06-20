# 実装計画 — Issue #168: perf: D1NoteRevisionRepository.countByNoteId should use SQL count(*) instead of materialising all rows

**Issue:** #168
**作成日:** 2026-06-21
**複雑度:** 小規模

---

## 目的

`D1NoteRevisionRepository.countByNoteId` が対象 note の全 revision 行を `select({ id })` で取得して JS 側で `.length` を取っている実装を、SQL の集計関数で件数だけを取得する形に変える。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `countByNoteId` が全行を materialise せず、SQL の `count` 集計で件数を返す | Issue 本文「提案」 | 1 |
| AC-2 | 既存 integration test「countByNoteId reflects the number of stored revisions」がそのまま通る | Issue 本文「影響範囲」 | 1 |
| AC-3 | `pnpm typecheck && pnpm lint && pnpm test` が通る | プロジェクト規約 | 1 |

## スコープ

### 含まれないもの
- `findByNoteId` / `deleteOldestForNote` など他メソッドの変更（本Issueは `countByNoteId` のみ）
- `deleteOldestForNote` 内の `select({ id })` フル取得（プルーニングには実 id が必要なため別問題。スコープ外として Phase 4 で扱う）

## 調査結果

- 関連ファイル: `app/core/adapters/d1/repositories/noteRevisionRepository.ts:130-142`（`countByNoteId`）
- あるべきアーキテクチャ: CLAUDE.md「既存コードと理想形が一致している箇所では、確立されたパターンを尊重する」。本リポジトリでは Drizzle の typed `count()` helper（`import { count } from "drizzle-orm"`）が `noteRepository` / `userRepository` / `shareLinkRepository` / `publicationStateRepository` など多数で確立済み。`.select({ value: count() })` + `Number(rows[0]?.value ?? 0)` が定型。
- 既存実装の状態: Issue 提案は raw `sql\`count(*)\`` だが、リポジトリの確立パターンは typed `count()` helper。意図（フル取得を避け SQL 集計にする）は同じで、より型安全かつ既存と一貫するため `count()` を採用する。
- 依存関係: 呼び出し元は SaveNote の上限判定と history 一覧の total。戻り値の型・意味（revision 件数の `number`）は不変なので呼び出し元に影響なし。

## 設計

### ドメインモデルへの影響
なし（アダプター層の SQL 発行方法のみの変更。ポートシグネチャ `countByNoteId(noteId): Promise<number>` は不変）。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
`D1NoteRevisionRepository.countByNoteId` の SELECT を `select({ id })` 全行取得 + `.length` から `select({ value: count() })` の集計に置き換える。誤読を招く既存コメント（「`count(*)` would be cheaper, but ...」）は削除する。

### UI / プレゼンテーション
なし。

## 実装ステップ

### 1. countByNoteId を count() 集計に変更

- **対象ファイル:** `app/core/adapters/d1/repositories/noteRevisionRepository.ts`
- **変更内容:**
  - import に `count` を追加（`import { and, asc, count, desc, eq, inArray } from "drizzle-orm";`）
  - `countByNoteId` を `.select({ value: count() })` に変更し、`return Number(rows[0]?.value ?? 0);` で受ける
  - 旧実装の前提を説明していたコメントを削除
- **理由:** Issue の目的（全行 materialise を避け SQL 集計で件数取得）を、リポジトリの確立パターンに沿って実現する。

## リスクと注意点

- `count()` は SQLite/D1 で integer を返すが、Drizzle の型上 `number` として安全に受けられる。念のため他リポジトリ同様 `Number(...)` で wrap する。
- 機能上の振る舞い（戻り値）は変わらないため回帰リスクは低い。

## テスト方針

- 既存 integration test「countByNoteId reflects the number of stored revisions」で件数が正しく返ることを確認（変更後もパスする）。
- `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test` を実行。
