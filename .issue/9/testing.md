# 動作確認計画 — Issue #9: P12 本格 WYSIWYG エディタ導入 (TipTap)

**Issue:** #9
**作成日:** 2026-05-17

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
# ステージング dry-run（バンドル混入チェック含む）
pnpm deploy:staging:dry

# ステージング適用（必要時のみ、ユーザー確認後）
pnpm deploy:staging
```

---

## 確認項目

### 1. WYSIWYG タブが enabled になっている（受入条件 1）

- **目的:** `EditorModeSwitch` の WYSIWYG タブがクリック可能で disabled でないことを確認
- **手順:**
  1. ログイン → サイドバーまたはヘッダーから「新規ノート」を開く（`/notes/new`）
  2. エディタ画面の `EditorModeSwitch`（HTML / FrontMatter / WYSIWYG タブ）を見る
  3. WYSIWYG タブをクリック
- **期待結果:**
  - WYSIWYG タブが `disabled` 表示でなく、tooltip も「WYSIWYG モードは別 Issue で対応予定」と出ない
  - クリックで WYSIWYG モードに切り替わり、TipTap エディタが表示される（ツールバー + 編集エリア）
- **確認ポイント:** タブのスタイルが他の HTML / FrontMatter タブと同等であること

### 2. WYSIWYG モードで文字入力・書式設定ができる

- **目的:** TipTap StarterKit の基本機能が動くことを確認
- **手順:**
  1. WYSIWYG モードで「テスト見出し」と入力 → ツールバーの H2 ボタンをクリック
  2. Enter で改行し「本文テキスト」と入力 → 一部を選択し B（Bold）と I（Italic）と Strike を適用
  3. 新しい段落で「項目1」と入力 → UL ボタンで箇条書きに → 「項目2」を追加
  4. 新しい段落で「コード行」と入力 → Quote、Code 各ボタンも試す
  5. URL（例: `https://example.com`）を入力 → 選択して Link ボタンでリンク化
- **期待結果:**
  - すべての書式が UI 上で反映される
  - HTML モードに切替えると対応する `<h2>` / `<strong>` / `<em>` / `<s>` / `<ul><li>` / `<blockquote>` / `<code>` / `<a>` が見える
- **確認ポイント:** WYSIWYG モードの表示と HTML モードの本文が双方向で同期している

### 3. WYSIWYG モードで明示保存し、サニタイザを通過して詳細画面に反映される（受入条件 2）

- **目的:** 受入条件 (2)「保存後の HTML が既存サニタイザを通過」を確認
- **手順:**
  1. WYSIWYG モードでタイトル「TipTap 動作確認」、本文に上記 #2 の入力を済ませた状態にする
  2. 「作成」ボタンをクリック
  3. ノート詳細画面（`/notes/<id>`）へ遷移したら本文の表示を確認
- **期待結果:**
  - エラーなく保存され、詳細画面で見出し / 太字 / リスト / リンクなどが正しく描画される
  - リンクは `target="_blank" rel="noopener noreferrer"` 等が付与されている（サニタイザ仕様）
- **確認ポイント:** ブラウザ DevTools で要素を見て `<h2>`, `<strong>`, `<ul>`, `<a>` 等のタグが期待どおり残っていること

### 4. 自動保存が WYSIWYG モードでも動く（受入条件 3）

- **目的:** 受入条件 (3)「自動保存と互換」を確認
- **手順:**
  1. 既存ノートを `/notes/<id>/edit` で開く
  2. WYSIWYG タブに切り替え
  3. 本文に文字を追加（例: 末尾に「(autosave check)」）
  4. AutosaveIndicator の状態を観察（dirty → saving → saved の遷移）
  5. ~4 秒待つ（AUTOSAVE_DEBOUNCE_MS）
- **期待結果:**
  - AutosaveIndicator が「保存しました」になる
  - DevTools の Network タブで `saveNoteDraft` が呼ばれている
  - ページリロード後も追加した文字が残る
- **確認ポイント:** Autosave エラーが出ない、`dirty` フラグの遷移が HTML モードと同等

### 5. WYSIWYG モードでのメディア挿入

- **目的:** `MediaUploader` から TipTap エディタ内のカーソル位置に画像が挿入されることを確認
- **手順:**
  1. WYSIWYG モードで本文の中ほどにカーソルを置く（例: 段落の途中）
  2. `MediaUploader` から画像ファイルを選択
  3. アップロード完了を待つ
- **期待結果:**
  - `<img src="/media/<id>" alt="" />` がカーソル位置に挿入される（末尾追記ではなく）
  - エディタ表示にも画像が出る
  - 保存して詳細画面で画像が見える
- **確認ポイント:** ノート詳細画面で画像が orphan purger に削除されず残ること（`MediaService.reconcileRefs` 経由）。DB の `note_media_refs` に該当 `media_id` のレコードがある

### 6. HTML モードでのメディア挿入が壊れていない（既存挙動非破壊）

- **目的:** HTML モードのメディア挿入が従来どおり末尾追記されること
- **手順:**
  1. HTML モードで本文に何か入力
  2. `MediaUploader` から画像をアップロード
- **期待結果:**
  - HTML モードの本文末尾に `<p><img src="/media/<id>" alt="" /></p>` が追記される（既存挙動）
- **確認ポイント:** 既存テスト `mediaInsert.test.ts` が緑のままであること

### 7. HTML ↔ WYSIWYG モード切替ラウンドトリップ

- **目的:** 双方向切替で内容が保持されることを確認
- **手順:**
  1. HTML モードで `<p>Hello <strong>world</strong></p><h2>Heading</h2><ul><li>A</li><li>B</li></ul>` を入力
  2. WYSIWYG タブに切替
  3. 表示が正しいことを確認 → HTML タブに戻る
  4. WYSIWYG タブで編集を加える → HTML タブで反映確認 → WYSIWYG タブに戻る
- **期待結果:**
  - StarterKit + Link + Image 範囲の HTML は双方向で情報を失わない
- **確認ポイント:** モード往復で見出し・太字・リストの構造が崩れない

---

## エッジケース・異常系

### 1. StarterKit が解さないタグを含む既存ノートを WYSIWYG で開く

- **目的:** Plan のリスク「サイレントデータロス」を実機で確認し、ユーザー注意事項として動線を確かめる
- **手順:**
  1. HTML モードで `<table><tr><td>cell</td></tr></table>` または `<figure><img src="/media/x"/><figcaption>caption</figcaption></figure>` または `<mark>marked</mark>` を含む本文を保存
  2. 詳細画面でその要素が表示されることを確認
  3. 再度編集画面を開き、WYSIWYG タブに切替
  4. WYSIWYG モードで何か別の編集を加える
  5. 4 秒待って autosave → リロード or HTML タブで本文を確認
- **期待結果（現状の実装での挙動）:**
  - WYSIWYG タブ切替時点では `state.contentHtml` は変わらない（`emitUpdate: false` の挙動）
  - WYSIWYG モードで編集を加えた瞬間に `editor.getHTML()` が新しい contentHtml となり、StarterKit 範囲外のタグが落ちる
  - autosave で永久にロスト
- **確認ポイント:** これは既知のリスクとして文書化済み。将来 Issue で diff 警告 banner を追加予定。**マニュアルテストでは動線を確認するだけ（バグ扱いしない）**

### 2. 不正な media id でのカーソル挿入

- **目的:** TipTap `setImage({ src })` が不正な src でも安全に処理されること
- **手順:**
  1. 通常のアップロード経路のみ確認（手動 URL 入力経路は本 Issue で追加しないため対象外）
- **期待結果:** アップロード経路では `presignMediaUpload` → `finalize` で id バリデーション済みなので不正 id は発生しない
- **確認ポイント:** スコープ外として確認スキップ可

### 3. WYSIWYG モードで巨大な本文を扱う

- **目的:** ProseMirror のパフォーマンス確認
- **手順:**
  1. ~5000 文字程度のテキストを WYSIWYG モードで入力 or 貼り付け
  2. autosave / 保存ができるか確認
- **期待結果:** 編集レイテンシが極端に悪化しない、autosave が完了する
- **確認ポイント:** 受入条件外だが、致命的に重ければ別 Issue として起票

---

## バンドルサイズ・RSC 互換性チェック

### 1. クライアントバンドル増分計測

```bash
# 導入前: git stash で本 Issue の変更を退避
git stash
pnpm build
du -sh dist/client/_build/assets/
# 結果を記録

# 導入後: git stash pop で変更を戻す
git stash pop
pnpm build
du -sh dist/client/_build/assets/
# 結果を記録、差分を PR description に転記
```

### 2. Workers バンドルに TipTap が混入していないこと

```bash
pnpm deploy:staging:dry
# 終了後、dist/worker/ 配下を確認
grep -r "prosemirror" dist/worker/ 2>/dev/null | head -5
grep -r "@tiptap" dist/worker/ 2>/dev/null | head -5
```

- **期待結果:** どちらも出力ゼロ。`"use client"` 境界が機能している証拠

### 3. RSC ハイドレーション

- **目的:** `immediatelyRender: false` 設定が効いて hydration mismatch が出ないこと
- **手順:**
  1. ブラウザで `/notes/new` を開く
  2. DevTools のコンソールを観察
- **期待結果:** "Hydration failed" / "did not match" 等の React 警告が出ない

---

## 既存機能への影響確認

- **HTML モードのテキスト編集**: textarea で従来どおり編集できる
- **FrontMatter モード**: 切替・編集が壊れていない
- **Autosave**: 4 秒 debounce、backoff、saved 表示が両モードで動く
- **EditLock**: 編集ロック acquire / extend / release が両モードで影響なし
- **Submit (作成 / 保存)**: 両モードから保存できる
- **既存ノート閲覧**: 詳細画面の HTML 表示は本 Issue で触っていないので無影響

---

## 確認チェックリスト

- [ ] WYSIWYG タブが enabled で、ツールチップなく押せる（#1）
- [ ] WYSIWYG モードで H2 / Bold / Italic / Strike / UL / OL / Quote / Code / Link が機能する（#2）
- [ ] WYSIWYG モードで保存後、詳細画面でサニタイズ後の HTML が表示される（#3）
- [ ] WYSIWYG モードで autosave が走り「保存しました」になる（#4）
- [ ] WYSIWYG モードで MediaUploader 経由の画像がカーソル位置に挿入される（#5）
- [ ] HTML モードの MediaUploader が末尾追記の従来挙動を維持（#6）
- [ ] HTML ↔ WYSIWYG モード切替で StarterKit 範囲の内容が双方向保持される（#7）
- [ ] table / figure / mark など範囲外タグの既存ノートを WYSIWYG で編集すると要素が落ちる挙動を確認（既知リスク、エッジ #1）
- [ ] `dist/worker/` に prosemirror / @tiptap が混入していない
- [ ] クライアントバンドル増分を計測し PR description に記録
- [ ] React hydration mismatch 警告が出ない
- [ ] FrontMatter モード、editLock、submit が影響を受けない
