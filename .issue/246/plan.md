# 実装計画 — Issue #246: spec/design: アップロードモーダルの HTML モックを追加

**Issue:** #246
**作成日:** 2026-05-27
**複雑度:** 小規模

---

## 目的

Issue #220 でアップロード動線をモーダル化したが、`spec/design/pages/` にモーダル単体のビジュアルモックが残されていない。Issue #220 完了条件④「spec/design 配下のデザインモック・ページ設計に新しい動線を反映」を厳密に満たすため、`spec/design/pages/P13-upload-modal.html` を新規追加してモーダル UI を可視化する。

## スコープ

### 含まれるもの

- `spec/design/pages/P13-upload-modal.html` の新規作成（単一ファイル・依存なしでブラウザ表示可能）
- 背景は P10（すべてのノート）のレイアウトを薄く重ねる（モーダル表示時の見え方を再現）
- モーダル内容: タイトル「アップロード」/ 説明テキスト / dropzone（破線枠・「ドラッグ&ドロップ or クリック」「複数選択にも対応」）/ フッターリンク「取り込みキューを見る」 / 右上 × クローズボタン
- backdrop（半透明黒 + blur）・モーダルの余白・角丸・色は既存 P14-publish-settings.html と同一トークン体系
- レスポンシブ: モバイル（< 640px）と デスクトップで自然に見えるよう padding を調整
- `spec/design/index.md` セクション9のアップロードモーダル記述を更新（「専用 HTML モックは置かず」→「P13-upload-modal.html を参照」）

### 含まれないもの

- React コンポーネント実装（既存 `UploadDialog.tsx` で完了済み）
- P13-upload.html（フォールバックページ）の編集
- Dialog primitive 自体の変更
- 他ページのモック修正

## 実装ステップ

### 1. `spec/design/pages/P13-upload-modal.html` の新規作成

- **対象ファイル:** `spec/design/pages/P13-upload-modal.html`（新規）
- **変更内容:**
  - `:root` に `spec/design/tokens.md` 準拠のトークン一式を貼り付ける（他ページと同じ「ルート定義の最終形」）
  - グローバルリセット・モバイル fix（review 001 由来）・focus-visible スタイルは他ページと統一
  - ヘッダー（ロゴ・検索・新規・アップロード・アバター）・サイドバー・main の薄表示（filter: blur + opacity）を P14-publish-settings.html と同じ構造で配置
  - 背景の main 領域は P10 のリスト風（ページタイトル「すべてのノート」+ 数件のノート行）を薄く描く
  - `.modal-backdrop`（fixed inset:0, rgba(0,0,0,0.32), blur(6px), z-index: 200, flex center）
  - `.modal`（max-width 480px, background var(--color-bg), radius var(--radius-xl), shadow-md）
  - `.modal-header`: タイトル「アップロード」+ × クローズボタン（`aria-label="閉じる"`、`pill` 風 32×32 円形）
  - `.modal-body`:
    - 説明 `<p>` 「ファイルから新規ノートを作成します。HTML / Markdown / Office / PDF / 画像 / 音声に対応しています。」
    - dropzone: `<label>` で `border: 2px dashed var(--color-hairline-strong)`, radius var(--radius-xl), padding (24px / 48px), bg var(--color-surface-elevated)。中央に「**ファイルをドラッグ&ドロップ** またはクリックして選択」と「複数選択にも対応」
  - `.modal-footer`: 右寄せ `pill-btn` で「取り込みキューを見る」リンク
  - モバイルメディアクエリ（< 640px）で padding と dropzone サイズを縮小
- **理由:** Issue 完了条件をすべて満たす単一ファイルのモック。既存 P14-publish-settings.html のモーダル構造と整合させることで、コードでの実装（`UploadDialog.tsx` + `Dialog` primitive）と1対1で対応する。

### 2. `spec/design/index.md` セクション9の記述を更新

- **対象ファイル:** `spec/design/index.md`
- **変更内容:**
  - L139 の「専用の HTML モックは置かず、…モーダル UI のビジュアル定義は Dialog primitive の token 利用に委譲」を、「モーダルのビジュアルモックは [`P13-upload-modal.html`](./pages/P13-upload-modal.html)、フォールバックページは [`P13-upload.html`](./pages/P13-upload.html) として並列に置く。実装は `app/components/common/Dialog.tsx` primitive と既存 `MoveNoteDialog` / `SaveViewDialog` 等のパターンに準拠する」に書き換える
- **理由:** ドキュメントと実態の同期。本 Issue で「モックを置かない」前提自体を覆すので、参照先を更新しないと矛盾が残る。

## 設計判断

- **モーダル幅:** `max-width: 480px`。P14-publish-settings.html は 560px だがフォーム要素が多い。アップロードは dropzone + 説明 + フッターのみと内容が薄いため、視覚的バランスを取って一段狭くする。
- **背景シーン:** P10（すべてのノート）を採用。アップロードは「ノート一覧の上から呼び出される」のが主動線（NoteListToolbar・Header）であり、ユーザーが最も多く目にする状況を再現する。
- **footer リンクのスタイル:** `pill-btn`（既存 `app/components/common/styles.ts` の `pillBtn` 相当）。実装側で `<Link className={pillBtn}>取り込みキューを見る</Link>` としているので、見た目を一致させる。

## リスクと注意点

- **デザインの設計言語ずれ:** トークン定義（`spec/design/tokens.md`）を `:root` にそのまま貼ること。色・余白・radius・shadow に独自値を入れない。
- **背景の主張過多:** 背景に置く P10 のリストはあくまで「モーダルがどこに重なるか」を示すためのもの。`filter: blur(2px); opacity: 0.55; pointer-events: none;` で十分に後退させる（P14-publish-settings.html の `.main` と同じ手法）。
- **モバイル時の縦長化:** dropzone の padding を縮める（py 32px 程度）。

## テスト方針

- ブラウザで `spec/design/pages/P13-upload-modal.html` を直接開いて、デスクトップ幅とモバイル幅（DevTools の Responsive 表示）で意図通り見えることを確認
- `spec/design/index.md` の更新箇所が壊れていない（リンクが正しく解決する）
- 既存ページモックには変更を加えない
