# 動作確認計画 — Issue #127: note_internal_links.resolved_note_id が null のまま残るケースの調査

**Issue:** #127
**作成日:** 2026-05-29

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm dev
```

ローカル開発サーバー（vite + Cloudflare Workers）が起動する。

ローカル D1 への SQL は別ターミナルから次の形で実行する（DB 名は `wrangler.toml` の binding 名 `hollow-local-d1`）:

```bash
wrangler d1 execute hollow-local-d1 --local --command "<SQL>"
```

### デプロイ方法

検証環境のみで確認可能。ステージング・本番へのデプロイは不要。

## 確認項目

### 1. 既存ノートを指す内部リンクが解決される（タイトル完全一致）

- **目的:** `[[既存ノートのタイトル]]` を本文に書いて保存すると `note_internal_links.resolved_note_id` がリンク先ノートの id で埋まることを確認する（修正前は null のまま）。
- **手順:**
  1. `pnpm dev` でサーバー起動 → サインアップ / ログイン
  2. ノート A を作成（タイトル例: `My First Note`、大文字・空白を含む通常のタイトル）して保存
  3. ノート B を作成し、本文に `[[My First Note]]` を入力して保存
  4. 別ターミナルで:
     ```bash
     wrangler d1 execute hollow-local-d1 --local --command "SELECT ref_kind, ref_target, resolved_note_id FROM note_internal_links ORDER BY rowid DESC LIMIT 10"
     ```
- **期待結果:** ノート B の `[[My First Note]]` に対応する行で `ref_kind = 'title'`、`ref_target = 'My First Note'`、`resolved_note_id` がノート A の id（NOT NULL）になっている。
- **確認ポイント:** 修正前は `resolved_note_id` が NULL のままだった行が、NOT NULL に解決されること。

### 2. 日本語・大小違いタイトルでも解決される

- **目的:** `NoteSlug` の pattern 違反で従来 null に落ちていた日本語・大文字タイトルが解決されることを確認する。
- **手順:**
  1. タイトル `無題メモ` のノートを作成して保存
  2. 別ノートの本文に `[[無題メモ]]` を入力して保存
  3. 確認項目1と同じ SQL で `note_internal_links` を確認
  4. さらに大小違い（リンク先タイトル `Hello`、本文 `[[hello]]`）でも保存して確認
- **期待結果:** `無題メモ` のリンク行、`hello`（リンク先 `Hello`）のリンク行とも `resolved_note_id` が NOT NULL。case-insensitive で解決される。
- **確認ポイント:** 日本語・大文字・大小違いいずれも解決される。

### 3. バックリンクが表示される

- **目的:** 解決された内部リンクが、リンク先ノートのバックリンク（`findReferrers`）として表示されることを確認する。
- **手順:**
  1. 確認項目1のノート A（リンクされる側）を画面で開く
  2. バックリンク表示領域を確認する
- **期待結果:** ノート A のバックリンクとして、`[[My First Note]]` を含むノート B が表示される。
- **確認ポイント:** 解決が直ったことで backlink も連動して表示されること（修正前は resolved_note_id が null のため backlink も空だった）。

## エッジケース・異常系

### 1. 対応するノートが存在しないリンクは未解決のまま（broken link 維持）

- **目的:** 存在しないタイトルへのリンクは `resolved_note_id = null` のまま残る（broken link として扱われる）ことを確認する。
- **手順:**
  1. 本文に `[[存在しないノート名XYZ]]` を入力して保存
  2. 確認項目1の SQL で該当行を確認
- **期待結果:** 該当行は `ref_kind = 'title'`、`resolved_note_id IS NULL`。エラーにはならず保存は成功する。

### 2. UUIDv7 を直接書いた内部リンク（kind=id）が解決される

- **目的:** `kind=id`（`[[<uuid>]]`）が、対象が active かつ同一 owner のとき `resolved_note_id` に解決されることを確認する（ADR-007 の修正点）。
- **手順:**
  1. 既存ノート（同一ユーザー・active）の id（UUIDv7）を控える
  2. 別ノートの本文に `[[<その UUID>]]` を入力して保存
  3. SQL で `ref_kind = 'id'` の行を確認
- **期待結果:** `ref_kind = 'id'`、`resolved_note_id` がその id（NOT NULL）。
- **補足:** 存在しない UUID を書いた場合は `resolved_note_id IS NULL`（broken link 維持）となり、保存は FK 違反で失敗しないこと。

## 既存機能への影響確認

- **内部リンクサジェスト（`[[` 補完）**: 候補選択で `[[タイトル]]` が挿入される従来の挙動が維持されていること（挿入仕様は変えない）。
- **ノート編集での再解決**: 既存ノートの本文を編集して保存したとき、内部リンクが再解決されること。
- **ingestion 経由のノート作成**: ファイル取り込みで作成されたノートの内部リンクも解決されること（同じ `assembleFromInputs` 経路）。

## 確認チェックリスト

- [ ] `[[既存タイトル]]` で `resolved_note_id` が NOT NULL に解決される
- [ ] 日本語タイトル・大文字・大小違いでも解決される
- [ ] 解決後にバックリンクが表示される
- [ ] 存在しないタイトルは null のまま（broken link 維持、エラーにならない）
- [ ] `kind=id`（UUID 直貼り）は従来どおり解決される
- [ ] `[[` サジェストの挿入仕様（タイトル挿入）が維持されている
- [ ] ノート編集・ingestion 経由でも解決される
