# 動作確認計画 — Issue #37: P12 WYSIWYG モード切替時に未対応タグの損失を警告する

**Issue:** #37
**作成日:** 2026-05-19

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
# D1 マイグレーション適用（ローカル、本 Issue ではマイグレーション追加なしだが既存実行のため）
pnpm db:apply:local

# 開発サーバー起動（Vite + Cloudflare 開発モード）
pnpm dev
```

ブラウザで dev サーバーが表示する URL を開く（通常 `http://localhost:5173`）。

### デプロイ方法

```bash
# ステージング dry-run
pnpm deploy:staging:dry

# ステージング適用（必要時のみ、ユーザー確認後）
pnpm deploy:staging
```

---

## 確認項目

### 1. 未対応タグを含むノートを WYSIWYG タブで開くと警告 banner が表示される（受入条件 1）

- **目的:** 元 HTML に `<table>` / `<mark>` / `<figure>` 等の StarterKit 範囲外タグが含まれているとき、警告 banner が表示されることを確認
- **手順:**
  1. ログイン → `/notes/new` で新規ノートを作成
  2. HTML モードで本文に以下を入力:
     ```
     <h2>未対応タグ混在テスト</h2>
     <table><tr><td>cell-A</td><td>cell-B</td></tr></table>
     <p><mark>marked</mark> text</p>
     <figure><figcaption>caption</figcaption></figure>
     <kbd>Cmd</kbd>+<kbd>K</kbd>
     ```
  3. タイトル「TC-001 unsupported tags」を入力して「作成」ボタンで保存
  4. 詳細画面が表示されたら `/notes/{id}/edit` を開く（編集画面）
  5. HTML モードであることを確認後、WYSIWYG タブをクリック
- **期待結果:**
  - WYSIWYG タブに切替えた直後、エディタ上部に警告 banner が表示される
  - banner 文言に「この本文には WYSIWYG モードで編集できない要素 …」「<table>, <td>, <tr>, <mark>, <figure>, <figcaption>, <kbd> 」（または同等の集合）が含まれる
  - 「了解した」ボタンが表示されている
  - banner の `role="alert"` 属性が DOM 上に存在する
- **確認ポイント:** WYSIWYG タブを開いた**瞬間**に banner が出ること。クリックなどユーザー操作を起点にしない

### 2. 警告 ack 前は autosave が抑止される（受入条件 2）

- **目的:** 「了解した」ボタン押下前に WYSIWYG モードで編集を加えても autosave が走らないことを確認
- **手順:**
  1. テスト 1 の続き（banner 表示状態）
  2. 「了解した」を押さずに、エディタ本文末尾にカーソルを置いて 1 文字（例「X」）入力
  3. 5 秒以上待機（autosave debounce より長く）
  4. AutosaveIndicator を観察
- **期待結果:**
  - AutosaveIndicator が「保存しました」にならない（"編集中" など dirty 状態が維持される、または変化なし）
  - Network パネルで `saveNoteDraft` の呼出が行われない
- **確認ポイント:** 5 秒待っても autosave が走らない＝確認ガードが効いていること

### 3. ack 後は autosave が再開する

- **目的:** 「了解した」を押すと autosave 抑止が解除されることを確認
- **手順:**
  1. テスト 2 の続き（dirty 状態）
  2. banner 内の「了解した」ボタンをクリック
  3. 5 秒以内に AutosaveIndicator を観察
- **期待結果:**
  - autosave が走り、AutosaveIndicator に「保存しました」が表示される
  - Network パネルで `saveNoteDraft` の呼出が成功する（200 OK）

### 4. ack 後も控えめなインライン文言で残る（受入条件 2 — UX 明示）

- **目的:** ack 後も「以下の要素は WYSIWYG モードでは保持されません」のような文言が控えめに残ることを確認
- **手順:**
  1. テスト 3 の続き
  2. エディタ上部を観察
- **期待結果:**
  - banner は強調表示（赤背景・大きい）ではなく、控えめなインラインメッセージで「以下の要素は WYSIWYG モードでは保持されません: table, td, tr, mark, figure, figcaption, kbd」と表示される
  - 「了解した」ボタンは消えている
  - DOM 上で `role="note"` 属性に変わっている
- **確認ポイント:** 失われたタグの一覧が引き続き確認可能であること

### 5. WYSIWYG → HTML → WYSIWYG タブ往復で警告が再表示される

- **目的:** タブ切替で WysiwygEditor が unmount/remount されるとき、再度警告が表示されることを確認
- **手順:**
  1. テスト 1〜3 のノート (`/notes/{id}/edit`) を開いた状態
  2. HTML タブに切替（banner が消える）
  3. HTML タブの textarea を確認 — 元 HTML（`<table>` 等が残ったまま）であること
  4. 再度 WYSIWYG タブに切替
- **期待結果:**
  - WYSIWYG タブに戻った瞬間に banner が再表示される
  - banner は ack 状態に応じて警告/控えめどちらかが表示される（ack 済みなら控えめ、未 ack なら警告）

### 6. StarterKit 範囲内のみのノートでは banner が出ない（偽陽性なし）

- **目的:** `<p>` / `<h2>` / `<strong>` / `<ul>` 等のみで構成されたノートでは banner が表示されないことを確認
- **手順:**
  1. `/notes/new` で新規ノートを作成
  2. HTML モードで以下のみを入力:
     ```
     <h2>普通の見出し</h2>
     <p><strong>太字</strong>と<em>斜体</em>。</p>
     <ul><li>項目1</li><li>項目2</li></ul>
     <p><a href="https://example.com">リンク</a></p>
     ```
  3. 保存 → 詳細画面 → `/notes/{id}/edit` → WYSIWYG タブに切替
- **期待結果:** banner が表示されない（DOM 上に `role="alert"` も `role="note"` も「以下の要素は…」の文言も存在しない）
- **確認ポイント:** `<div>` / `<span>` / `<b>` / `<i>` / `<u>` のみのノートでも警告が出ないこと（追加テストとして`<div><b>X</b></div>` パターンも確認）

## エッジケース・異常系

### 1. HTML タブで未確認警告状態のまま編集 → autosave が走る（ADR-002 の動線確認）

- **目的:** HTML モードでは autosave 抑止しない仕様の確認
- **手順:**
  1. テスト 1 のノート (`/notes/{id}/edit`) を開く
  2. WYSIWYG タブに切替 → banner が出る（ack せず）
  3. HTML タブに戻す
  4. HTML タブの textarea で `<p>HTML タブ編集</p>` を末尾に追加
  5. 5 秒待機
- **期待結果:**
  - HTML モードでは autosave が通常通り走り、AutosaveIndicator が「保存しました」になる
  - ページリロードしても HTML タブの内容に「HTML タブ編集」が反映されており、かつ `<table>` 等の未対応タグも保持されている

### 2. ノート新規作成時 — 空 HTML で WYSIWYG タブを開く

- **目的:** `value === ""` で偽陽性が起きないことを確認
- **手順:**
  1. `/notes/new` を開く
  2. HTML タブ・本文未入力のまま WYSIWYG タブに切替
- **期待結果:** banner が表示されない

## 既存機能への影響確認

- WYSIWYG モードの通常操作（書式適用、リスト、リンク挿入、メディア挿入）が今まで通り動作する（Issue #9 TC-001〜TC-007 相当の正常系）
- HTML モードの autosave が今まで通り動作する（dirtyKeys / frontMatter エラー時の抑止が引き続き効く）
- FrontMatter モードの動作に影響しない（mode === "wysiwyg" 以外では新ガードが発動しない）

## 確認チェックリスト

- [ ] 1. 未対応タグを含むノートを WYSIWYG タブで開くと banner が表示される
- [ ] 2. ack 前は autosave が抑止される
- [ ] 3. ack 後は autosave が再開する
- [ ] 4. ack 後も控えめなインライン文言で残る
- [ ] 5. WYSIWYG → HTML → WYSIWYG タブ往復で警告が再表示される
- [ ] 6. StarterKit 範囲内のみのノートでは banner が出ない（偽陽性なし）
- [ ] EC-1. HTML タブで未確認警告状態のまま編集 → autosave が走る
- [ ] EC-2. 空 HTML で WYSIWYG タブを開いても banner は出ない
- [ ] 既存 WYSIWYG モードの書式操作が動作する
- [ ] HTML モードの autosave が動作する
- [ ] `pnpm typecheck && pnpm lint && pnpm test:unit` が PASS する
