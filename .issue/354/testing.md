# 動作確認計画 — Issue #354: P10 ノート一覧 モバイル対応 + 選択モード/絞り込み UX 刷新

**Issue:** #354
**作成日:** 2026-05-30

---

## 確認環境

このIssueの変更は P10（ノート一覧）周辺の React コンポーネント（FilterBar / BulkActionBar / ListView / TileView / CalendarView / SelectionContext / NoteCheckbox / NoteListToolbar）と app-shell 層のサイドバードロワー化（AppShellFrame / AppShellDrawer / Header / layout styles）が中心。レスポンシブ・インタラクション主体のため、**ユニットテスト（selectionReducer の mode 遷移）＋ ブラウザ実機確認** で検証する。確認には複数のノート・タグが存在するアカウントが必要。

### 検証環境の起動

```bash
pnpm dev   # vite dev (workerd via @cloudflare/vite-plugin) on http://localhost:3000
```

ノート一覧（P10）は `/`（`_app/index.tsx`）。タグファセットのモバイル溢れを確認するため、タグが多数（12件超）付与されたノートが望ましい。なければアプリ上でノート作成・タグ付与してデータを整える。

### 検証コマンド

```bash
pnpm typecheck       # 型チェック
pnpm test:unit       # selectionReducer の mode 遷移テスト等を実行
pnpm lint:fix        # Biome lint
pnpm format          # Biome format
```

### デプロイ方法

なし（フロントエンドのレスポンシブ／インタラクション変更のみで、検証環境で確認できる）。

## 確認項目

### 1. selectionReducer の mode 遷移ユニットテスト

- **目的:** 選択モードの不変条件（enter / exit→ids clear / toggle）がコードで担保されることを確認。
- **手順:**
  1. `pnpm test:unit` を実行
  2. `app/components/note/list/__tests__/listSelectors.test.ts` の mode 遷移ケースが PASS することを確認
- **期待結果:** `enterSelectMode` で `mode=true`、`exitSelectMode` で `mode=false` かつ `ids` が空、`toggleSelectMode` の往復が正しい。既存の selection ケース（toggle / selectMany / selectAll / clear）も維持。
- **確認ポイント:** `exitSelectMode` が ids を確実に clear すること。

### 2. サイドバードロワー化（lg 境界 = 1024px）

- **目的:** lg 未満でサイドバーがオフキャンバスドロワーになり、ハンバーガーで開閉できることを確認。本文上部への縦積みが解消されていること。
- **手順:**
  1. `pnpm dev` で起動し `/` を開く
  2. DevTools のレスポンシブモードで幅を 1023px 以下（例: 375px）にする
  3. ヘッダー左にハンバーガーが表示され、サイドバー本体は画面外（本文上に縦積みされていない）であることを確認
  4. ハンバーガーをタップ → ドロワーが左からスライドイン、backdrop が出る
  5. backdrop をタップ → ドロワーが閉じる。Esc キーでも閉じる
  6. 幅を 1024px 以上にする → ハンバーガーが消え、サイドバーが従来どおり sticky で常時表示に戻る
- **期待結果:** lg 未満はドロワー、lg 以上は sticky。本文上への縦積みは発生しない。
- **確認ポイント:** ドロワー展開中に背面がスクロールロックされること。ディレクトリツリー / ライブラリ / タグのナビがドロワー内で機能すること。

### 3. ヘッダー / ツールバー CTA のアイコン化（sm 境界 = 640px）

- **目的:** sm 未満で「新規作成」「アップロード」CTA がアイコンのみに圧縮され、タッチターゲットと aria-label が保たれることを確認。
- **手順:**
  1. 幅 375px でヘッダーの新規作成・アップロード、および P10 ツールバーの新規作成 / アップロード / ビュー保存 CTA を確認
  2. 幅 640px 以上に広げてラベルが表示されることを確認
  3. アイコンのみ状態で各ボタンをホバー / フォーカスし、aria-label（ツールチップ相当）を確認
- **期待結果:** sm 未満でアイコンのみ（44px タッチターゲット）、sm 以上でラベル付き。機能（新規作成・アップロード起動・ビュー保存）は従来どおり動く。
- **確認ポイント:** aria-label が常時付与され、アイコンのみでも操作意図が伝わること。

### 4. FilterBar のモバイル最適化 + タグ折りたたみ

- **目的:** タグが多数でもモバイルで溢れず、件数制限 +「もっと見る」で展開できることを確認。
- **手順:**
  1. タグが 12 件超付与された状態で `/` を 375px で開く
  2. FilterBar のタグファセットが上限件数で打ち切られ「もっと見る (+N)」が出ることを確認
  3. 「もっと見る」をタップ → 残りのタグが展開、「閉じる」で再び折りたたみ
  4. 期間 / 公開状態 / 内部リンク参照の各コントロールがモバイル幅で折り返し、画面外に溢れないことを確認
  5. active なタグ chip がデザイン準拠（`bg-ink` の濃色 + 白文字）で表示されることを確認
- **期待結果:** タグが制限され「もっと見る」で展開。全フィルタがモバイル幅に収まる。
- **確認ポイント:** 横スクロールバーが本文に出ない。active chip の色がデザイン準拠。

### 5. 明示的な選択モード

- **目的:** 選択モード OFF 時はチェックボックス非表示・行クリックで詳細遷移、ON 時のみチェックボックスと BulkActionBar が出ることを確認。List / Tile / Calendar 各 view で。
- **手順:**
  1. `/` を開く（選択モード OFF が初期状態）
  2. List 表示でチェックボックスが見えないこと、ノート行クリックで詳細へ遷移することを確認
  3. ツールバーの「選択」トグルを ON → チェックボックスが表示、BulkActionBar が出現
  4. ノートを複数選択 → BulkActionBar に件数が反映、移動 / 公開設定 / エクスポート / 削除 / 選択解除（×）が動作
  5. BulkActionBar の × で選択モードが終了（ids clear + mode OFF）することを確認
  6. 表示形式を Tile / Calendar に切り替え、同様に選択モード ON/OFF と選択操作を確認
     - Tile: mode ON 時にカード全面タップで選択トグル、mode OFF 時はカードタップで遷移
     - List / Calendar: mode ON 時に行タップで選択トグル、タイトルリンクが遷移を奪わない
- **期待結果:** mode OFF は閲覧、mode ON は選択。チェックボックス / BulkActionBar は mode ON のみ。一括操作は従来どおり成功。
- **確認ポイント:** mode ON 時のリンク遷移と選択トグルが競合しない。mode OFF で選択がクリアされる。

### 6. デザイン準拠チェックボックス

- **目的:** ネイティブ input から `spec/design/pages/P10-home.html` の `.note-check` 準拠スタイル付きチェックボックスに置き換わったことを確認。
- **手順:**
  1. 選択モード ON で List / Tile / Calendar のチェックボックスを目視
  2. 未選択（リング）/ 選択（accent 背景 + 白チェック）の見た目を確認
  3. キーボードで checkbox にフォーカスし Space / Enter でトグルできること、focus-visible リングが出ることを確認
  4. モバイル幅で 44px のタッチターゲットが確保されていることを確認
- **期待結果:** デザイン準拠のスタイル付きチェックボックス。キーボード操作とフォーカス可視化が機能。
- **確認ポイント:** List / Tile / Calendar で同一の `NoteCheckbox` が使われ見た目が統一されていること。

### 7. 絞り込みの即時反映

- **目的:** フィルタ選択がサーバ応答を待たず即座に UI へ反映され、結果リストは pending 表示になることを確認。
- **手順:**
  1. `/` を開き、タグ chip をクリック
  2. クリック直後に chip の active 状態が**即座に**反映されることを確認（サーバ往復を待たない）
  3. 結果リストが pending（`aria-busy` / 半透明）表示になり、サーバ確定後に実データへ更新されることを確認
  4. pending 中に別のタグ chip / 公開状態 / 期間を**連続で**操作し、取りこぼしなく全て反映されることを確認
  5. クリアボタン、保存ビュー復元を操作し、optimistic 状態と URL / loader 確定値が整合することを確認
- **期待結果:** フィルタ選択は即時反映、結果は pending → 確定。連続操作で取りこぼしなし。
- **確認ポイント:** pending 中もコントロールが操作可能（`disabled` で固まらない）。最終的に URL と表示が一致。

### 8. BulkActionBar のデザイン準拠（dark sticky-bottom pill）

- **目的:** BulkActionBar がデザイン準拠の濃色 sticky-bottom pill になり、モバイルでアクションが横スクロールで収まることを確認。
- **手順:**
  1. 選択モード ON で複数ノートを選択
  2. BulkActionBar が画面下部に sticky な濃色 pill として表示されることを確認
  3. 幅 375px でアクションが溢れず横スクロールで操作できることを確認
  4. スクロール・コンテンツ最下部でバーがコンテンツと干渉しないことを確認
- **期待結果:** dark sticky-bottom pill。モバイルでアクション横スクロール。
- **確認ポイント:** sticky 位置が top→bottom に変わったことで他レイアウトと干渉しないこと。

## エッジケース・異常系

### 1. 選択モード中の表示形式切り替え

- **目的:** mode ON のまま List ↔ Tile ↔ Calendar を切り替えても選択状態 / mode が破綻しないことを確認。
- **手順:**
  1. mode ON で List で数件選択
  2. Tile / Calendar に切り替え
- **期待結果:** mode と選択 ids が保持され、各 view でチェックボックスと BulkActionBar が一貫表示。

### 2. ドロワー展開中の画面回転 / リサイズ

- **目的:** ドロワーを開いたまま lg 以上にリサイズしたとき表示が破綻しないことを確認。
- **手順:**
  1. 375px でドロワーを開く
  2. 幅を 1024px 以上に広げる
- **期待結果:** sticky サイドバーに自然に戻り、backdrop が残らない。

### 3. 0 件選択時の BulkActionBar

- **目的:** mode ON だが 0 件選択のときの挙動を確認。
- **手順:**
  1. mode ON にして何も選択しない、または全選択解除する
- **期待結果:** BulkActionBar は mode 中マウントされ、件数 0 表示・アクション disabled。× で mode 終了。

## 既存機能への影響確認

- **app-shell 全ルート:** ドロワー化は `_app` 配下全ページに波及。P10 以外（タグ / ゴミ箱 / ノート詳細など）でもモバイルでサイドバーがドロワーとして正しく開閉し、デスクトップで従来どおり sticky 表示になることを確認。
- **保存ビュー / URL-driven フィルタ:** `searchToViewQuery` / `viewQueryToSearch` は不変。フィルタ操作後の URL 同期、保存ビュー作成・復元が従来どおり動くことを確認。
- **一括操作（移動 / 公開設定 / エクスポート / 削除）:** 選択モード経由で従来どおり成功すること。
- **AppShell.tsx（デッドコード）:** 変更していないこと。

## 確認チェックリスト

- [ ] `pnpm typecheck` が成功する
- [ ] `pnpm test:unit` で selectionReducer の mode 遷移テストが PASS する
- [ ] `pnpm lint:fix` でエラーなし / `pnpm format` 適用済み
- [ ] lg 未満でサイドバーがドロワー化、ハンバーガーで開閉、backdrop / Esc で閉じる（本文縦積みが解消）
- [ ] lg 以上でサイドバーが sticky に戻る
- [ ] sm 未満でヘッダー / ツールバー CTA がアイコンのみ（44px / aria-label）
- [ ] FilterBar がモバイル幅に収まり、タグが件数制限 +「もっと見る」で展開
- [ ] active chip がデザイン準拠（bg-ink）
- [ ] 選択モード OFF で checkbox 非表示・行クリックで遷移、ON で checkbox + BulkActionBar 表示
- [ ] List / Tile / Calendar 各 view で選択モードと選択操作が動く
- [ ] チェックボックスがデザイン準拠・キーボード操作可・44px タッチターゲット
- [ ] フィルタ選択が即時反映、結果が pending → 確定、連続操作で取りこぼしなし
- [ ] BulkActionBar が dark sticky-bottom pill でモバイル横スクロール
- [ ] P10 以外のルートでドロワー化が破綻しない
- [ ] 保存ビュー / URL フィルタ / 一括操作の既存挙動が維持される
