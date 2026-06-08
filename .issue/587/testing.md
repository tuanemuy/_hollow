# 動作確認計画 — Issue #587: モバイルモック(#536)の実装追従 ① 共通基盤

**Issue:** #587
**作成日:** 2026-06-08

---

## 確認環境

このIssueはバックエンド変更を伴わない**横断的なモバイル基盤の UI 追従**。共通コンポーネント（drawer / Dialog ボトムシート / Popover / 下部固定CTAバー frame / タッチ床44px / フォーム1カラム）を 320〜430px の狭幅で確認する。実機確認はローカル開発サーバで行う。

### 検証環境の起動

```
pnpm dev
```

`vite dev`（Cloudflare ランタイム）でローカルサーバが起動する。表示された URL をブラウザで開いて確認する。

アプリシェル（P10 等）や設定シェル（P21 等）は認証が必要。D1 ローカルにシードが無い場合はマイグレーション適用 → シード投入を行う:

```
pnpm db:migrate
pnpm seed:dev-admin
```

`seed:dev-admin` は dev 用の管理ユーザー＋有効なセッションを投入する。認証済みアクセスは agent-browser に session cookie を注入して行う（`docs/test.md` 参照）:

```
agent-browser cookies set "__Host-session" "<token>" \
  --url http://localhost:<port> --path / --secure --sameSite Lax
```

注入後、アプリ/設定シェル系ルートに認証済みでアクセスできる。確認用データが不足する場合は UI からアカウント作成するか、`pnpm db:execute:local --file <SQLファイル>` で補う。

### デプロイ方法

なし（検証環境のみで確認できる。ステージング反映が必要な場合は `pnpm deploy:staging`）。

---

## 確認項目

### 1. アプリシェルの横スクロール無し（受け入れ基準1・4）

- **目的:** 320〜430px でアプリシェル（P10 home）に横スクロールが発生しないこと。
- **手順:**
  1. 認証済みで P10（home）を開く。
  2. ビューポート幅を 320 / 375 / 390 / 430px に順に変える。
  3. 各幅で `document.documentElement.scrollWidth <= document.documentElement.clientWidth` を確認（横スクロール無し = overflow 0）。
- **期待結果:** いずれの幅でも横スクロールが発生しない。390px が受け入れ基準の代表値。
- **確認ポイント:** ヘッダー（`APP_HEADER`）・サイドバー領域・メインコンテンツが幅内に収まる。`APP_HEADER` で overflow が出る場合は `max-sm:px-4 max-sm:gap-2.5` 適用後に再確認し、適用有無を実装メモに残す。

### 2. サイドバー drawer（オーバーレイ + バックドロップ）

- **目的:** base〜md（< lg）でサイドバーが drawer 化し、開閉・フォーカストラップ・スクロールロックが効くこと。
- **手順:**
  1. 390px で P10 を開き、メニューボタン（`MENU_BTN`、`lg:hidden`）をタップして drawer を開く。
  2. backdrop（`SIDEBAR_BACKDROP`、`bg-black/20`）が表示され、本文側がうっすら覗くこと（drawer 幅 `max-w-[86vw]`）を確認。
  3. Tab でフォーカスが drawer 内に閉じ込められること、背後がスクロールしないことを確認。
  4. Escape / backdrop タップ / lg 幅到達で drawer が閉じることを確認。
- **期待結果:** drawer がオーバーレイ表示され、focus trap・scroll lock・各クローズ導線が動作する。
- **確認ポイント:** 320px でも本文側に覗き幅が残る（`max-w-[86vw]`）。lg（≥1024px）では drawer ではなく in-flow の2カラムに戻る。

### 3. Dialog のボトムシート化（最重要）

- **目的:** 狭幅で Dialog が下端シート（フルワイド・上端のみ角丸・grabber・safe-area 下余白）になり、`sm` 以上で従来の中央モーダルに戻ること。
- **手順:**
  1. 390px で Dialog を開く操作を行う（例: ノート一覧で move-note ダイアログ、または ConfirmDialog を誘発する削除操作）。
  2. パネルが画面下端に吸着し、横フルワイド・上端のみ角丸・先頭に grabber（つまみ）が表示されることを確認。
  3. パネル先頭の grabber 上下の余白が過密／過疎でないこと（panel 上パディングと grabber の二重感）を目視。
  4. ビューポートを `sm`（≥640px）以上に広げ、中央モーダル（全周角丸・`max-w-[480px]`）に戻ることを確認。
- **期待結果:** 狭幅=下端シート、`sm`以上=中央モーダル。grabber は狭幅のみ表示。
- **確認ポイント:** 長いフォーム/リストを持つ Dialog（move-note, note-picker）で `max-h-[calc(100%-…)]` + 内部スクロールが効き、はみ出さない。ConfirmDialog（alertdialog）でも grabber + シートになる。

### 4. Dialog の focus / safe-area

- **目的:** ボトムシート化後も focus trap が壊れず、safe-area 下余白が確保されること。
- **手順:**
  1. 390px で Dialog を開き、初期フォーカスが従来通り最初の意味ある control（× ボタン等）に当たることを確認。
  2. Tab 巡回が grabber を素通りし（grabber は非 focusable）、パネル内に閉じ込められることを確認。
  3. （iOS Safari 実機/エミュレートがあれば）下端に safe-area の余白が確保されることを確認。
- **期待結果:** focus trap 維持、grabber はフォーカス対象外、下端に safe-area 余白。
- **確認ポイント:** `focusables[0]` が close button のまま（grabber 追加の影響なし）。

### 5. 下部固定CTAバー frame の継承点（受け入れ基準2）

- **目的:** 共通 `BottomActionBar` frame が children を差し込んで描画でき、各画面が継承できる土台になっていること。
- **手順:**
  1. `BottomActionBar` に CTA ボタンを差し込んだ最小サンプルを 390px でレンダリングする。
  2. 下端固定・`--header-bg`/blur 背景・`border-top`・safe-area 下余白・`lg:hidden`（desktop 非表示）を確認。
  3. children（CTA ボタン）が枠内に描画されることを確認。
- **期待結果:** frame が下端固定で表示され、children が差し込まれて描画される。lg では非表示。
- **確認ポイント:** 各画面の CTA 内容配置は #588 のため、本Issueでは frame の見え + children 描画の確認まで。

### 6. Popover の共通 panel 定数（狭幅フルワイド土台）

- **目的:** Popover 用の共通 panel 定数が狭幅フルワイドシートを表現でき、非モーダル（backdrop 無し）を維持すること。
- **手順:**
  1. 共通 panel 定数を当てた Popover を 390px で開く（最小サンプルまたは共通定数の見え確認）。
  2. パネルがフルワイド・`rounded-lg`・`border-hairline`・`shadow-md` で表示され、backdrop が出ないことを確認。
- **期待結果:** 狭幅でフルワイドシート、非モーダル維持。
- **確認ポイント:** FilterBar 等への実適用は #588。本Issueは共通定数の見えまで。

### 7. タッチ床44px・フォーム1カラム

- **目的:** 狭幅で共通 pill/icon/フォーム control が 44px 床を満たし、フォームが1カラムで畳まれること。
- **手順:**
  1. 390px で各種ボタン（`pillBtn`/`ICON_BTN`/`MENU_BTN`/`dialogCloseButton`）の最小高さが 44px 以上であることを確認。
  2. 設定/auth フォームの input（`fieldControl`）が狭幅で 44px 以上であることを確認。
  3. フォームが狭幅で1カラム縦積み（`FIELD_ROW` が base 1カラム）、`md` 以上で2カラムになることを確認。
- **期待結果:** タッチ主体要素が 44px 床、フォームは狭幅1カラム。
- **確認ポイント:** admin の `FIELD_INPUT` は密度優先で据え置き（44px 化しない）。

## エッジケース・異常系

### 1. drawer 開いた状態でのリサイズ

- **目的:** drawer 開状態で lg 幅に広げたときの破綻が無いこと。
- **手順:** 390px で drawer を開き、そのまま ≥1024px に広げる。
- **期待結果:** drawer が自動で閉じ in-flow 2カラムに戻る。scroll lock が解除される。

### 2. ボトムシート内に長コンテンツ

- **目的:** シート内が画面高を超えるときの内部スクロール。
- **手順:** note-picker 等、項目の多い Dialog を 320px で開く。
- **期待結果:** シートが `max-h-[calc(100%-…)]` で頭打ちになり、内部がスクロールする。下端 safe-area 余白が残る。

## 既存機能への影響確認

- **既存ユニットテスト:** `pnpm test:unit`（`common/__tests__/{Dialog,ConfirmDialog,Popover}.test.tsx`・`layout/__tests__/UserMenu.test.tsx`）が grabber DOM 追加・class 変更で退行しないこと。`focusables[0] === closeBtn` 前提が維持されること。
- **desktop（≥sm/≥lg）:** Dialog は中央モーダルのまま、drawer は in-flow のまま、CTAバー frame は非表示で、デスクトップ表示に変化が無いこと。
- **全 Dialog consumer:** `dialogBackdrop`/`dialog` の一括変更が ConfirmDialog・アップロードモーダル・各 P10-*-dialog で破綻しないこと（狭幅シート / desktop 中央）。

## 確認チェックリスト

- [ ] P10 を 320/375/390/430px で開き横スクロール無し（overflow 0）
- [ ] サイドバー drawer の開閉・focus trap・scroll lock・Escape/backdrop/lg クローズ
- [ ] drawer 幅 `max-w-[86vw]` で 320px でも本文側に覗き幅
- [ ] Dialog が狭幅で下端シート（フルワイド・上端角丸・grabber・safe-area）、sm 以上で中央モーダル
- [ ] Dialog の focus trap 維持・grabber 非 focusable・`focusables[0]` 不変
- [ ] `BottomActionBar` frame が children を差し込んで下端固定描画、lg で非表示
- [ ] Popover 共通 panel が狭幅フルワイド・非モーダル維持
- [ ] タッチ床44px（pill/icon/MENU/close/fieldControl）、フォーム狭幅1カラム
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` が通る
- [ ] `pnpm test:unit` が通る（既存テスト退行なし）
- [ ] desktop 表示に変化が無い（中央モーダル・in-flow drawer・CTAバー非表示）
