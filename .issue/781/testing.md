# 動作確認計画 — Issue #781: データ駆動 RSC ルートの roving radiogroup で連続矢印キー時にフォーカスが脱落する（#776 follow-up）

**Issue:** #781
**作成日:** 2026-06-27

---

## 確認環境

このIssueの変更（フロントエンドの a11y / キーボードフォーカス挙動）を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm db:migrate        # ローカル D1 にマイグレーション適用（初回 / スキーマ未適用時のみ）
pnpm seed:dev-admin    # 動作確認用の管理ユーザー + サンプルノート/タグを投入
pnpm dev               # vite dev サーバー（Cloudflare runtime）を起動
```

起動後、ブラウザで以下を開く:

- ホーム（認証アプリ）: `http://localhost:5173/`（`pnpm dev` の出力する URL に合わせる）
- タグ管理（本Issueの対象画面）: `http://localhost:5173/tags`

並び替え軸 segmented（radiogroup）は `/tags` のツールバー（`TagListToolbar`）に表示される。タグが複数件あり並び替えの効果が分かる状態にしておく（`seed:dev-admin` のサンプルで不足する場合はホームからタグを数件追加する）。

### デプロイ方法

ステージング反映が必要な場合のみ:

```bash
pnpm deploy:staging
```

（本Issueは表示層のみの変更で、検証環境のみで確認できる。デプロイは必須ではない。）

### 自動テスト

```bash
pnpm test:unit         # 復元・連続操作・後方互換・フック直叩き3分岐の各テスト
pnpm typecheck         # discriminated union への ?: boolean / ?: never 追加で型崩れがないこと
```

## 確認項目

> Issue 指示により、復元挙動の最終判断は**実ブラウザ（Chrome / Safari）の手動操作**で行う。agent-browser はセッション不安定で偽陽性リスクがあるため切り分けが必要（`.issue/776/manual-test/report.md` 参照）。

### 1. 連続矢印キーでフォーカスが保持される（コア）

- **対応する受け入れ基準:** AC-1
- **目的:** 矢印キーの連続押下で2回目以降も選択・URL 反映され、フォーカスが選択中 radio に保持されることを確認する。
- **手順:**
  1. `/tags` を開く。
  2. Tab キーで並び替え軸 segmented（radiogroup）にフォーカスを移し、選択中の radio にフォーカスがある状態にする。
  3. マウス・再フォーカス操作を一切せず、`ArrowRight`（または `ArrowDown`）を**2回連続**で押す。
- **期待結果:** 1回目・2回目とも選択が1つずつ移動し、その都度 URL の `sort` クエリが更新される。2回目の矢印が無視されない。各押下後、フォーカスが新しく選択された radio に保持されている（`<body>` に脱落しない）。
- **確認ポイント:** 修正前は2回目が無視され、押下後に `document.activeElement` が `<body>` になる（DevTools で確認可）。修正後は常に選択中 radio がフォーカスを保つ。`ArrowLeft` / `ArrowUp` の逆方向、`Home` / `End` でも同様に連続操作できること。

### 2. データ駆動ナビゲーション完了後のフォーカス復元

- **対応する受け入れ基準:** AC-2
- **目的:** 単発の矢印選択でも、loader 再実行 → RSC 再レンダーが完了したあとにフォーカスが選択中 radio へ復元されることを確認する。
- **手順:**
  1. `/tags` を開き、並び替え軸 radio にフォーカスを置く。
  2. `ArrowRight` を1回押す。
  3. 一覧の再描画（loader 再取得）が落ち着くまで待つ。
- **期待結果:** 並び順が変わり URL `sort` が更新され、再レンダー完了後もフォーカスが新しく選択された radio に残る。スクロール位置が復元 focus で飛ばない（`preventScroll`）。
- **確認ポイント:** 再描画の一瞬フォーカスが `<body>` に落ちても、effect による復元で選択中 radio に戻ること。続けて矢印を押せる状態であること。

### 3. client-only consumer の後方互換（表示モード segmented）

- **対応する受け入れ基準:** AC-3
- **目的:** オプトインしていない既存 segmented（`DisplayModeSwitch` / 公開トップの表示形式）の挙動・キーボード操作・フォーカス保持が一切変化しないことを確認する。
- **手順:**
  1. ホーム `http://localhost:5173/` のツールバーにある表示モード segmented（list / tile / calendar）にフォーカスを移す。
  2. 矢印キーで連続切替する。
  3. 公開トップ `http://localhost:5173/u/{seed のユーザー名}` の表示形式 segmented でも同様に操作する。
- **期待結果:** 従来どおり矢印で切替でき、フォーカスは操作中の radio に保持される（client-only スワップのため元々保持されている）。挙動に差分なし。
- **確認ポイント:** 復元コードパスが非オプトイン consumer の挙動に副作用を与えていないこと（焦点の横取り・チラつきが無い）。

### 4. 編集モード Tabs（manual activation）の後方互換

- **対応する受け入れ基準:** AC-3
- **目的:** manual variant（`EditorModeSwitch`）に復元オプションが影響しないことを確認する。
- **手順:**
  1. ノート編集画面を開き、編集モード Tabs にフォーカスを移す。
  2. 矢印で focus 移動 → Enter/Space で activate する APG Tabs 挙動を確認する。
- **期待結果:** 従来どおり矢印で focus のみ移動し、明示的 activate で切替。復元による割り込みは無い。

## エッジケース・異常系

### 1. 非オプトイン automatic が焦点を横取りしない（AC-4）

- **目的:** オプトインしていない automatic consumer で、操作と無関係に `activeElement` が `<body>` になった局面（初期ロード直後・ウィンドウ blur 後・別 island 操作後）に、segmented が焦点を奪い返さないことを確認する。
- **手順:**
  1. ホームを開いた直後（表示モード segmented を一度も操作していない状態）にページ内の別要素やアドレスバーへフォーカスを移す。
  2. ウィンドウを別アプリへ切り替えて戻る。
- **期待結果:** 表示モード segmented が勝手にフォーカスを奪わない。フォーカスは直前の場所に留まる。

### 2. 矢印操作後に別要素へ意図的に移動したケース

- **目的:** `/tags` で矢印選択直後（再レンダー進行中）にユーザーが Tab で別要素へ移動した場合、復元が割り込んで radiogroup へ引き戻さないことを確認する。
- **手順:**
  1. `/tags` で並び替え軸 radio にフォーカスを置き `ArrowRight` を押す。
  2. 再描画が完了する前後で素早く Tab を押して次の操作要素へ移る。
- **期待結果:** フォーカスは Tab で移動した先に留まり、radiogroup へ戻されない（`activeElement === body` ガードにより横取りしない）。

## 既存機能への影響確認

- **`/tags` の他操作:** order トグル（昇順/降順）、タグ検索、click による並び替え選択が従来どおり動くこと（フォーカス復元が click 経路に副作用を与えないこと）。
- **共有プリミティブ `useRovingTablist` の全 consumer:** `DisplayModeSwitch`（ホーム）/ `PublicTopControls`（公開トップ表示形式）/ `EditorModeSwitch`（編集）/ `TagListToolbar`（タグ）。デフォルト off の3者は無変更で、`pnpm test:unit` の既存テストが無改変 PASS すること。
