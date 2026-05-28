# 動作確認計画 — Issue #221: アップロードのフィードバック改善

**Issue:** #221
**作成日:** 2026-05-28

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm dev
```

`http://localhost:3000` でアプリが起動する。

事前の DB マイグレーション適用が未完なら:

```bash
pnpm db:apply:local
```

型・lint・format の事前確認（CLAUDE.md「After changes」ルール）:

```bash
pnpm typecheck && pnpm lint:fix && pnpm format
```

自動テスト:

```bash
pnpm test:unit
```

### デプロイ方法

ステージング環境への反映:

```bash
pnpm deploy:staging
```

本番環境への反映:

```bash
pnpm deploy:production
```

---

## 確認項目

### 1. ファイル選択〜アップロード〜キュー反映までのフィードバック（モーダル経由）

- **目的:** ヘッダーからアップロードボタンを押した直後の即時 loading、aria-live でのスクリーンリーダー通知、キュー追加の伝達が途切れずに見えることを確認
- **手順:**
  1. ログイン済み状態でホーム（`/`）にアクセス
  2. ヘッダー右上の「アップロード」ボタンをクリックしてモーダルを開く
  3. 小さな Markdown ファイル（例: `test.md`）をドラッグ&ドロップ or クリックで投入
  4. ボタン押下〜推論完了までの UI 変化を観察
- **期待結果:**
  - ボタン押下と同時にドロップゾーンが disabled + skeleton 表示に切り替わる（スピナーではなく skeleton）
  - `select` → `uploading` → `waiting` → `editing` のビュー遷移が `aria-live="polite"` で読み上げられる
  - 推論完了後にプレビュー編集ビューに遷移
  - 「保存」または「破棄」を行うと `/upload` 取り込みキューにも反映される（モーダル外の `/upload` を別タブで開いておけば、自動更新で見える）
- **確認ポイント:** ボタン押下後すぐに視覚的フィードバックが出る（無反応の沈黙時間ゼロ）

### 2. 取り込みキューの自動更新（pending → processing → done）

- **目的:** `/upload` ページがリロードなしでジョブ状態遷移を自動反映することを確認
- **手順:**
  1. `/upload` ページを開いたままにする
  2. 別タブでホーム（`/`）からモーダル経由でアップロード（複数ファイルを一気に投入すると分かりやすい）
  3. `/upload` ページに戻り、ページをリロードせずに観察
- **期待結果:**
  - 4 秒程度の間隔で行が `pending` → `processing` → `previewing`（or `failed`）へと自動遷移していく
  - フルページリロード（白点滅）は発生しない
  - active ジョブが無くなったら、ポーリング間隔が 16 秒に伸びる（DevTools Network タブで確認可能）
- **確認ポイント:** `getIngestionJobsFn` の HTTP リクエストが定期的に飛んでいることを DevTools Network タブで確認

### 3. 失敗ジョブのエラー文言（business code / pipeline 識別子のマッピング）

- **目的:** `IngestionErrorCode` 各値および pipeline 識別子（`llm_failure` / `pdf_parse_failure` 等）が日本語のユーザー向け文言に変換されることを確認
- **手順:**
  1. **対応外形式（unsupported_format）**: `.exe` や `.zip` 等の非対応形式ファイルをアップロード
  2. **サイズ超過（ingestion_byte_size_exceeds_limit）**: 環境変数 / 開発時設定で上限を一時的に下げて、その上限を超えるファイルを投入
  3. **空ファイル（ingestion_invalid_byte_size）**: 0 バイトファイルを投入
  4. **アップロード上限超過（daily_upload_quota_exceeded）**: dev 環境で quota を一時的に下げて連続アップロード
  5. **pipeline 失敗（pdf_parse_failure 等）**: 壊れた PDF ファイル等を投入し `failed` 状態を作る
- **期待結果:**
  - (1) → 「このファイル形式には対応していません。HTML / Markdown / Office / PDF / 画像 / 音声 形式でお試しください」
  - (2) → 「ファイルサイズが上限を超えています。サイズを下げて再度お試しください」
  - (3) → 「ファイルが正しく読み取れませんでした。別のファイルでお試しください」
  - (4) → 「本日のアップロード上限に達しました。明日以降に再度お試しください」
  - (5) → 「PDFを解析できませんでした。ファイルが破損していないかご確認ください」（または該当する pipeline 識別子の文言）
- **確認ポイント:** `IngestionJobRow` の失敗カードと `UploadDialog.FailedView` の両方で同じユーザー向け文言が出ること

### 4. 内部スタック・原文 message の非露出

- **目的:** UI のどこにも英語 errorCode やスタックトレースが見えないことを確認
- **手順:**
  1. 確認項目 3 で発生させた失敗ジョブの UI を確認
  2. `IngestionJobRow` カード、`UploadDialog.FailedView` モーダル、それぞれの DOM を DevTools Elements で確認
- **期待結果:**
  - `unsupported_format` / `llm_failure` / `pdf_parse_failure` 等の生 code 文字列が DOM に存在しない
  - スタックトレース（`at ... ` で始まる行）が UI に出ない
  - 原文 message（英語）が出ない
- **確認ポイント:** DevTools の検索（Ctrl+F / Cmd+F）で `_failure` / `unsupported_format` / `Error:` 等の文字列が UI 要素内に hits しないこと

### 5. モーダルからの楽観的更新（フルリロード回避）

- **目的:** アップロード後にスクロール位置・選択状態・他コンポーネントの local state が保たれることを確認
- **手順:**
  1. ホーム（`/`）でノート一覧を下方向にスクロール
  2. 検索 / 絞り込みフィルタを何か適用しておく
  3. モーダルを開き、小さなファイルをアップロード
  4. モーダルを閉じる
- **期待結果:**
  - 画面全体の白点滅（フルリロード）は発生しない
  - スクロール位置がアップロード前と同じ位置に保たれている
  - 絞り込みフィルタが維持されている
  - 新しいジョブが（previewing 状態に達していれば）リストに反映されている
- **確認ポイント:** DevTools Network タブで full HTML document の再取得が起きていないこと（XHR / fetch のみ）

### 6. タブ非表示時のポーリング抑止 / 復帰時の即時 fetch

- **目的:** `visibilitychange` ハンドリングでバックグラウンドタブの負荷を抑え、visible 復帰で即時更新することを確認
- **手順:**
  1. `/upload` ページを開く
  2. DevTools の Network タブを開いて `getIngestionJobsFn` の HTTP 呼び出しを観察
  3. 別タブに切り替える（`/upload` をバックグラウンドにする）
  4. 30 秒〜1 分待機
  5. `/upload` タブに戻る
- **期待結果:**
  - 手順 3 で別タブに切り替えた瞬間、`getIngestionJobsFn` の呼び出しが止まる（次回 tick がスキップされ、IDLE 間隔で再スケジュール）
  - 手順 5 で `/upload` タブに戻った瞬間に即時 fetch（`getIngestionJobsFn` 呼び出し）が走る
- **確認ポイント:** Network タブの timeline で、別タブ滞在中はリクエストが飛んでいないこと

### 7. fatal エラー（unauthorized 等）でのポーリング停止

- **目的:** セッション切れを模擬してポーリングが停止し、その後復活しないことを確認
- **手順:**
  1. `/upload` ページを開いてポーリングが走っていることを確認
  2. 別タブ等でログアウトする（or DevTools Application タブから session Cookie を削除）
  3. `/upload` タブに戻ってポーリングを観察
  4. しばらく（1 分以上）待機
- **期待結果:**
  - 次回ポーリング tick で `unauthorized` を受け取った瞬間に「進捗の自動更新に失敗しました: ...」のエラーが `aria-live` 領域に表示される
  - その後、`getIngestionJobsFn` の呼び出しは **一切走らなくなる**（fatalRef による恒久停止）
  - jobs 状態の変化等で useEffect が再実行されてもポーリングが復活しない
- **確認ポイント:** Network タブで fatal 検出後にリクエストが完全に止まること

### 8. 可変ポーリング間隔（active 4s / idle 16s）

- **目的:** active ジョブの有無で間隔が切り替わることを確認
- **手順:**
  1. `/upload` ページを開く（最初は active ジョブなし）
  2. DevTools Network タブで `getIngestionJobsFn` のリクエスト間隔を観察（約 16 秒間隔のはず）
  3. 別タブから新しいファイルをアップロードして `pending` / `processing` を発生させる
  4. `/upload` タブの Network タブで間隔を再観察（約 4 秒間隔に短縮されるはず）
  5. 全ジョブが `previewing` / `saved` / `discarded` / `failed` に至るまで待つ
  6. 再び 16 秒間隔に戻ることを確認
- **期待結果:**
  - active ジョブ無し: 約 16 秒間隔
  - active ジョブ有り: 約 4 秒間隔
  - 連続失敗時（手順は別途確認項目 9）: 約 12 秒のバックオフ
- **確認ポイント:** 切り替わりが滑らかで、間隔切り替えのタイミングで余分なリクエストが発生しないこと

### 9. アクセシビリティ（aria-live / role="alert"）

- **目的:** スクリーンリーダーで状態変化と失敗が読み上げられることを確認
- **手順:**
  1. macOS の VoiceOver（Cmd+F5）または NVDA / JAWS を有効化
  2. ホームからモーダルを開き、ファイルをアップロード
  3. `/upload` ページを開いた状態でアップロードを発生させ、行の状態遷移を観察
  4. 確認項目 3 の失敗ケースも観察
- **期待結果:**
  - モーダルの `select` → `uploading` → `waiting` → `editing` 遷移が `aria-live="polite"` で読み上げられる
  - `/upload` ページでジョブ追加・状態遷移が `aria-live="polite"` で読み上げられる
  - 失敗カードのエラー文言が `role="alert"` で割り込み読み上げされる（`IngestionJobRow` / `UploadDialog.FailedView` の両方）
- **確認ポイント:** `prefers-reduced-motion: reduce`（macOS: システム環境設定 → アクセシビリティ → ディスプレイ → 「視差効果を減らす」）を有効化すると skeleton のパルスアニメーションが停止すること

### 10. spec / design 反映の確認

- **目的:** Issue 完了条件「spec/design 配下のドキュメントに新しいフィードバック仕様を反映」が満たされていることを目視確認
- **手順:**
  1. `spec/pages/index.md` の P13 節を開く
  2. `spec/design/index.md` を開く
  3. `spec/scenario/ingest.md` を開く
  4. `spec/manual-tests/ingest.md` を開く
  5. plan.md の Step 7 / Step 8 の追記内容と整合しているか確認
- **期待結果:**
  - `spec/pages/index.md` P13 節に「フィードバックポリシー（#221）」項目が追記されている（ポーリング間隔、aria-live、エラーマッピングの言及）
  - `spec/design/index.md` に「フィードバック・エラー表示原則（#221）」セクションが追加されている
  - `spec/scenario/ingest.md` L69 付近の `FRONT_MATTER_JSON_INVALID` 直書きがユーザー向け文言に置き換わっている
  - `spec/manual-tests/ingest.md` の生 errorCode を期待値にしている箇所が更新されている
- **確認ポイント:** plan.md の記述と spec の記述が文言レベルで整合していること

---

## エッジケース・異常系

### 1. 複数ファイル同時アップロード

- **目的:** 複数ファイルを同時投入した時に各々のフィードバックが独立して見えることを確認
- **手順:**
  1. モーダルを開き、3 〜 5 個のファイル（混在: 対応形式 + 1 〜 2 個の非対応形式）を一度に選択
  2. `multiResult` ビューに集計結果が出ることを確認
  3. `/upload` ページでキューを観察
- **期待結果:**
  - モーダル内で「成功 X 件 / 失敗 Y 件」のような集計が出る
  - 失敗ファイルのエラー文言が個別に日本語で表示される
  - `/upload` のキューで成功ジョブが順次 processing → previewing になる

### 2. ネットワーク断（offline → online）

- **目的:** ネットワーク不調時のバックオフと自動復帰を確認
- **手順:**
  1. `/upload` ページでポーリングが走っていることを確認
  2. DevTools の Network タブで「Offline」に切り替え
  3. ポーリングが失敗し続けることを観察（3 回連続失敗で UI に警告表示）
  4. 「No throttling」に戻す
- **期待結果:**
  - 3 回連続失敗で「進捗の自動更新に失敗しました: ...」が `aria-live` 領域に表示される
  - バックオフ間隔（12 秒）でリトライが続く
  - online 復帰後、次回 tick 成功時に警告メッセージがクリアされる

### 3. ブラウザ戻る / 進む

- **目的:** ブラウザのナビゲーション操作と polling の干渉が無いことを確認
- **手順:**
  1. ホーム → `/upload` ページに遷移
  2. ブラウザ「戻る」ボタンでホームに戻る
  3. ブラウザ「進む」ボタンで `/upload` に戻る
- **期待結果:**
  - 各ナビゲーションで `IngestionQueue` が正しく mount / unmount される
  - 「戻る」で `/upload` を離れた時にポーリング timer が clear される
  - 「進む」で `/upload` に戻った時にポーリングが再開する（initial fetch から）

### 4. リロード復元

- **目的:** `/upload` ページのリロード後も initial data + polling が正しく動くことを確認
- **手順:**
  1. `/upload` を開いてジョブが何件か表示されている状態にする
  2. Cmd+R / F5 でリロード
- **期待結果:**
  - リロード直後に initial data（async server component 経由）でジョブ一覧が即表示される
  - その後 client polling が起動して自動更新が始まる

### 5. router.invalidate と polling の race

- **目的:** 確認項目 5 と関連。`IngestionJobRow` のアクション直後に polling tick が走って古い結果で上書きされないか確認
- **手順:**
  1. `/upload` ページで `previewing` 状態のジョブを 1 件用意
  2. ジョブの「保存」ボタンを押して `router.invalidate` が走るタイミングと polling tick が衝突するように何度か繰り返す
- **期待結果:**
  - アクション結果（`saved` に遷移）が一瞬古い状態（`previewing`）に巻き戻ることが無い、もしくは次回 tick で正しく `saved` に収束する
- **確認ポイント:** plan.md のリスク章にあるように、体感できるレベルの race が発生したら IngestionQueue → IngestionJobRow への即時 tick コールバック注入を検討する

### 6. IngestionJobRow の Confirm dialog 表示中に行が消える

- **目的:** ポーリングで行が削除された時に Confirm dialog が宙に浮かないことを確認
- **手順:**
  1. `/upload` ページで `previewing` 状態のジョブを 1 件用意
  2. 「破棄」ボタンを押して ConfirmDialog を開く
  3. 別タブで（管理 UI などから）当該ジョブを別経路で破棄する（or 環境次第ではこのケースは再現困難）
- **期待結果:**
  - ポーリング tick で当該行が消えた時、行コンポーネントが unmount され、ConfirmDialog も自動で閉じる
  - JavaScript エラーが発生しない

---

## 既存機能への影響確認

- **`/upload` ページの既存機能**: ジョブの「保存（commit）」「破棄（discard）」「再生成（regenerate）」ボタンが従来通り動作するか
- **`UploadDialog` モーダル**: Issue #220 で導入されたモーダルが正しく開閉する、ファイル選択・推論待ち・プレビュー編集・複数結果集計の各ビューが正しく動く
- **`UploadForm`（`/upload` ページ内）**: 既存のドロップゾーンが従来通り動作し、エラー時に Step 1 の新マッピングで文言化された日本語が出る（`unsupported_format` 等）
- **他の Dialog**: `MoveNoteDialog` / `SaveViewDialog` / `ConfirmDialog` 等が引き続き動作する
- **ノート一覧の絞り込み・検索・ページネーション URL state**: モーダル開閉やポーリングに影響されないこと
- **自動テスト全件**: `pnpm test` が緑であること

---

## 確認チェックリスト

- [ ] ヘッダー「アップロード」ボタン押下後の即時 loading / skeleton / aria-live 通知が機能する
- [ ] `/upload` ページが pending → processing → done をリロードなしで自動反映する
- [ ] `unsupported_format` の対応外形式エラーが日本語文言で表示される
- [ ] `ingestion_byte_size_exceeds_limit` のサイズ超過エラーが日本語文言で表示される
- [ ] `daily_upload_quota_exceeded` の上限超過エラーが日本語文言で表示される
- [ ] `llm_failure` / `pdf_parse_failure` 等の pipeline 識別子も日本語文言にマップされる
- [ ] 失敗ジョブの DOM 内に生 errorCode 文字列 / スタックトレース / 英語原文 message が存在しない
- [ ] アップロード後に画面全体のフルリロード（白点滅）が発生せず、スクロール位置・フィルタが保たれる
- [ ] DevTools Network タブで `/upload` を別タブにすると `getIngestionJobsFn` の呼び出しが停止する
- [ ] 別タブから `/upload` に戻った瞬間に即時 fetch が走る
- [ ] `unauthorized` を受けた後はポーリングが完全に停止し、復活しない
- [ ] active ジョブ無し時は約 16 秒間隔、active ジョブ有り時は約 4 秒間隔でポーリングが動く
- [ ] スクリーンリーダーで状態遷移が `aria-live="polite"` で読み上げられる
- [ ] エラー文言が `role="alert"` で割り込み読み上げされる
- [ ] `prefers-reduced-motion: reduce` で skeleton のパルスが停止する
- [ ] `spec/pages/index.md` / `spec/design/index.md` / `spec/scenario/ingest.md` / `spec/manual-tests/ingest.md` の更新内容が plan.md と整合している
- [ ] 複数ファイル同時アップロードで成功 / 失敗が個別に表示される
- [ ] ネットワーク断 → 復帰で 3 回連続失敗警告 → 自動復帰する
- [ ] ブラウザ戻る / 進むで `IngestionQueue` の mount / unmount が正しく行われる
- [ ] `/upload` リロード後に initial data + polling 再開の流れが動く
- [ ] `pnpm typecheck && pnpm lint && pnpm test:unit` がパスする
