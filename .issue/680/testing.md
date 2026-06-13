# 動作確認計画 — Issue #680: 編集中フォームが routerInvalidate でフォーカスを失う（入力値は保持／再マウントではない）

**Issue:** #680
**作成日:** 2026-06-13

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。

本 Issue は focus/caret の喪失と復元のみが対象。invalidate コミットによる focus の `<body>` 落ち
→ 復元フックでの refocus + caret 復元という挙動を実機ブラウザで before/after 観測する。
#670 testing.md / `.issue/670/step0-results.md` と同手法（`pnpm dev` + agent-browser + local D1）。

### 検証環境の起動

`pnpm dev`（vite dev / workerd）で起動する。README 記載のデフォルトポートは `http://localhost:3000`。

```bash
pnpm dev
```

ポート競合時は vite が空きポートに自動でフォールバックする（起動ログの "Local: http://localhost:<port>" を確認し、以降の手順の `<port>` に使う）。固定したい場合は `pnpm dev --port <port>` で明示指定する。

スキーマ未適用なら先に適用する:

```bash
pnpm db:migrate
```

> `/_app/settings/prompts`（AC-4）の loader は `staleTime: DEV ? 0 : Infinity`。`pnpm dev` は DEV なので `staleTime: 0`、すなわち invalidate で loader が必ず再実行され RSC ペイロードがコミットされる。本 Issue が観測したい focus 落ち経路は DEV（`pnpm dev`）で再現するため、本検証は `pnpm dev` で行う（本番 `staleTime: Infinity` では loader 再実行されず focus 落ちが起きないので非対象）。

### シードデータ

認証必須ルート（`/_app/views`・`/_app/settings/prompts`・`/admin/prompts`）の検証には管理者ユーザー + セッションが要る。実在する seed コマンドで投入する:

```bash
pnpm seed:dev-admin
```

このコマンドは `scripts/seed-dev-admin.mjs`（package.json `scripts` に実在）を実行し、local D1 に決定論的な admin ユーザーと有効なセッション（token: `dev-admin-session-token`）を upsert する（冪等。再実行可）。

セッション cookie（`__Host-session`）は Secure 属性付きで `document.cookie` から設定できないため、agent-browser の cookie 設定で CDP 経由で注入する（seed コマンドの出力にも案内あり）:

```bash
agent-browser cookies set "__Host-session" "dev-admin-session-token" \
  --url http://localhost:<port> --path / --secure --sameSite Lax
```

各画面の loader 由来表示データの状態:

- **`/admin/prompts`（AC-3）**: `PromptsForm` は `promptDefaults` を持つため、追加 SQL 投入なしで text `<textarea>` と variables `<input type="text">` が描画される（`app/components/admin/PromptsForm/Page.tsx`）。空でも各カードのフィールドは存在するので、そこへ直接タイプして caret 配置できる。
- **`/_app/views`（AC-2 / AC-5 / AC-6 / AC-7）**: inline rename は既存の保存ビューが1件以上ないと開始できない。保存ビューが無ければ、画面の新規ビュー作成 UI から1件作るか、`pnpm db:execute:local <file>` で `saved_views` に dev-admin（`user_id = '01950000-0000-7000-8000-000000000001'`）所有のレコードを1件投入してから、その行の rename を開始する。
- **`/_app/settings/prompts`（AC-4）**: text `<textarea>` は override 未設定でも空欄で描画され、そこへタイプできる（`useState(override?.text ?? "")`）。既存値を表示した状態で確認したい場合は、prompt override を1件投入する。

> 上記 SQL 投入が必要な場合の正確なテーブル/カラムは未確定。**要確認: `saved_views` / prompt override の挿入 SQL（テーブル名・必須カラム・dev-admin の user_id 紐付け）は実 schema を `app/core/adapters` または migrations で確認のうえ用意する。** 投入なしでも、views は新規作成 UI 経由で、settings/prompts と admin/prompts は空フィールドへの直接入力で AC-2/3/4/5 の focus・caret 観測は実施可能。

### デプロイ方法

なし（検証環境のみで確認できる）。

## 確認項目

各項目は agent-browser で操作し、invalidate は **focus を動かさない** `page.evaluate` 経由で発火する（クリック等で focus を移動させると交絡するため）。本命 `routerInvalidate(router)` の忠実再現フィルタは、対象3ルートに対してエディタールート除外が恒等なので（`.issue/670/step0-results.md` で実証済み）次を使う:

```js
window.__TSR_ROUTER__.invalidate({ filter: m => m.routeId !== '/_app' })
```

caret/selection の実測は、発火前後で対象要素の `document.activeElement`・`selectionStart`・`selectionEnd`・`selectionDirection`、および `document.activeElement === document.body` を `page.evaluate` で読み取り、before/after を testing.md（本ファイルの実行記録）に残す（#670 Step 0 の観測精度に倣う）。

### 1. 修正前（フック無し）で focus → body / caret 喪失を再現（AC-1）

- **対応AC:** AC-1
- **目的:** 「RSC ペイロードコミットで focus 中 subtree が detach され focus が `<body>` に落ちる」を実機で裏付け、修正の前提を確証する。
- **手順:**
  1. フック適用前のコミット（または一時的にフック呼び出しを無効化したビルド）で `/_app/views` の inline rename `<input>` を開き、文中にタイプして caret を配置する。
  2. `page.evaluate` で発火前の `activeElement`（= 当該 input）・`selectionStart`/`End` を記録。
  3. `window.__TSR_ROUTER__.invalidate({ filter: m => m.routeId !== '/_app' })` を発火。
  4. 発火後の `activeElement` を記録。
- **期待結果（修正前）:** 発火後 `document.activeElement === document.body` になり focus が落ちる（caret は当該要素から失われる）。
- **確認ポイント:** 入力 value 自体は保持される（#670 で no-repro 確定済み）。本 Issue が対象とするのは focus/caret の喪失のみであることを実機で確認する。

### 2. `/_app/views` inline rename の focus・caret 保持（AC-2）

- **対応AC:** AC-2
- **目的:** inline rename `<input>` に focus・caret 配置した状態で本命相当 invalidate が起きても focus と caret 位置が保持される。
- **手順:**
  1. `/_app/views` で既存ビューの inline rename を開始（`autoFocus` で input に focus）。
  2. 文中（末尾以外）に caret を置き、`page.evaluate` で before の `activeElement`・`selectionStart`/`End`/`Direction` を記録。
  3. `window.__TSR_ROUTER__.invalidate({ filter: m => m.routeId !== '/_app' })` を発火。
  4. after の `activeElement`・`selectionStart`/`End`/`Direction` を記録。
- **期待結果:** after で `activeElement` が同じ rename input に戻り、`selectionStart`/`End`/`Direction` が before と一致する。
- **確認ポイント:** before/after の caret 値を実測記録し、「focus は戻ったが caret が末尾に飛んだ（退避できていない）」を成功と誤判定しない。

### 3. `/admin/prompts` text フィールドの focus・caret 保持（AC-3 / text）

- **対応AC:** AC-3
- **目的:** text `<textarea>` に focus・caret 配置した状態で本命相当 invalidate が起きても focus と caret が保持される。
- **手順:**
  1. `/admin/prompts` で任意の prompt カードの text `<textarea>` に focus し、文中に caret を配置。
  2. before の `activeElement`・selection を記録。
  3. 本命相当 invalidate を発火。
  4. after の `activeElement`・selection を記録。
- **期待結果:** after で同じ `<textarea>` に focus が戻り、caret 位置（start/end/direction）が一致する。
- **確認ポイント:** variables フィールドと混同せず、text 単独で個別確認する（片方だけの取りこぼし防止）。

### 4. `/admin/prompts` variables フィールドの focus・caret 保持（AC-3 / variables）

- **対応AC:** AC-3
- **目的:** variables `<input type="text">` に focus・caret 配置した状態で本命相当 invalidate が起きても focus と caret が保持される。
- **手順:** 項目3と同じ手順を、同カードの variables `<input>` に対して実施する。
- **期待結果:** after で同じ variables `<input>` に focus が戻り、caret 位置が一致する。
- **確認ポイント:** text と variables の両フィールドそれぞれで個別に成立することを確認（AC-3 の検証単位）。

### 5. `/_app/settings/prompts` text フィールドの focus・caret 保持（AC-4）

- **対応AC:** AC-4
- **目的:** DEV（`staleTime: 0`）の text `<textarea>` に focus・caret 配置した状態で本命相当 invalidate が起きても focus と caret が保持される。
- **手順:**
  1. `/_app/settings/prompts` で text `<textarea>` に focus し、文中に caret を配置。
  2. before の `activeElement`・selection を記録。
  3. 本命相当 invalidate を発火。
  4. after の `activeElement`・selection を記録。
- **期待結果:** after で同じ text `<textarea>` に focus が戻り、caret 位置が一致する。
- **確認ポイント:** 同ファイルの `PreviewPanel.sample` `<textarea>` はスコープ外（配線対象外）。本項目は loader 由来の text `<textarea>` のみを対象にする。

### 6. raw `router.invalidate()` でも復元が効く（発生源非依存・AC-5）

- **対応AC:** AC-5
- **目的:** UploadDialog 由来に限らず、コミットで focus が `<body>` に落ちる invalidate 経路全般に復元が効く。
- **手順:**
  1. `/_app/views` inline rename `<input>` に focus・caret 配置（項目2と同じ状態）。
  2. before の `activeElement`・selection を記録。
  3. フィルタ無しの raw 発火: `window.__TSR_ROUTER__.invalidate()`。
  4. after の `activeElement`・selection を記録。
- **期待結果:** after で rename input に focus が戻り caret が保持される（本命フィルタ経路と同じ復元結果）。
- **確認ポイント:** views inline `<input>` を代表に1ケースで確認する（発生源非依存の裏取り）。

### 7. 文中 caret での invalidate（末尾に飛ばない・S-002）

- **対応AC:** AC-2 / AC-3 / AC-4（caret 整合の横断確認）
- **目的:** caret を文中（末尾以外）に置いた状態で invalidate しても、caret が打鍵位置に留まり末尾へ飛ばない（`setSelectionRange` の clamp が reconcile 後の最新 value と整合）。
- **手順:**
  1. いずれかのフォーム入力に複数文字をタイプし、caret を文字列の途中（例: 先頭から数文字目）に明示移動。
  2. before の `selectionStart`/`End`（途中位置）を記録。
  3. 本命相当 invalidate を発火。
  4. after の `selectionStart`/`End` を記録。
- **期待結果:** after の caret 位置が before の途中位置と一致し、末尾（value.length）になっていない。
- **確認ポイント:** 1ケースで足りる。caret が文字列長に clamp されず元位置に戻ることを確認。

### 8. IME 変換中の invalidate で未確定文字が壊れない（S-003）

- **対応AC:** AC-2 / AC-3 / AC-4（IME ガードの横断確認）
- **目的:** composition 中（`compositionstart`〜`compositionend`）に invalidate が重なっても、`setSelectionRange` で変換セッションが破壊されず未確定文字が確定/消失しない。
- **手順:**
  1. いずれかのフォーム入力で日本語 IME 変換を開始し、未確定（変換候補表示中）の状態にする。
  2. その状態で本命相当 invalidate を発火。
  3. 未確定文字列・変換セッションの状態を観測する。
- **期待結果:** 未確定文字が消えたり強制確定されたりせず、変換を継続できる（composition 中は復元が抑制される）。
- **確認ポイント:** agent-browser での IME 駆動が困難な場合は `compositionstart`/`compositionupdate` イベントを `page.evaluate` で dispatch して composition フラグを立てた状態を再現し、その間 `setSelectionRange` が呼ばれないことを確認する。再現の限界は実行記録に残す。

### 9. caret スナップショットの保持を before/after で実測（S-001 観測ゲート）

- **対応AC:** AC-2 / AC-3 / AC-4（復元成否のゲート判定根拠）
- **目的:** 「復元は走ったが caret は退避できておらず末尾に飛んだ」を成功と誤判定しないよう、退避値の有無と復元後 selection を実測する。
- **手順:** 項目2〜5の各観測で、(a) 発火前に当該要素が focus を持ち caret 位置が記録されていたこと、(b) 発火後の `selectionStart`/`End` が (a) と一致すること、を数値で記録する。
- **期待結果（フォールバック発火条件 / S-003）:** 3フォームのいずれかで以下が1つでも起きたら ADR-001 フォールバック（描画構造見直し）を Issue 起票する:
  - (a) 復元後に focus が当該要素へ戻らない（`activeElement` が当該要素でも body でもない、または body のまま）。
  - (b) focus は戻るが、スナップショットが存在したのに `setSelectionRange` 後の `selectionStart` が退避値と一致しない。
- **確認ポイント:** この実測は項目2〜5の before/after 記録を流用する（独立した追加操作は不要）。

## エッジケース・異常系

### E-1. スナップショット未取得（操作前 invalidate）で focus のみ復元

- **目的:** `autoFocus` で開いた直後に1文字も操作せず invalidate が重なる等、selection イベントが一度も発火していないケースで、caret を末尾/先頭にジャンプさせず focus のみ復元する。
- **手順:** views inline rename を開いた直後（タイプ・クリック・キー操作を一切せず）に本命相当 invalidate を発火する。
- **期待結果:** focus は rename input に戻るが、`setSelectionRange` による caret 強制移動は起きない（caret が末尾/先頭に飛ばされない＝ブラウザ既定のまま）。
- **確認ポイント:** スナップショット未取得時に caret を強制設定しないフック仕様（S-001 フォールバック）が効いていること。

### E-2. ユーザーが別要素へ focus 移動した場合は復元しない

- **目的:** invalidate と同時にユーザーが意図的に別要素へ focus を移した場合、フックが focus を奪い返さない。
- **手順:** フォーム入力に focus・caret 配置 → `page.evaluate` で別の要素（例: 別の input やボタン）に `.focus()` → その状態で本命相当 invalidate を発火。
- **期待結果:** focus は移動先の別要素に留まり、元のフォーム入力へ戻らない（`activeElement === body` ガードに合致しないため復元が走らない）。
- **確認ポイント:** focus を意図せず奪うリスク（plan.md リスク欄）が顕在化しないこと。

### E-3. IME 変換中（E-1/E-2 と重なるケース）

- 項目8で扱う。composition 中は復元抑制が効くこと。

## 既存機能への影響確認

### R-1. 自分の保存 → invalidate → 最新値再表示の非退行（AC-6）

- **目的:** 各フォームの「自分の保存 → invalidate → 最新値再表示」既存挙動が退行しない（invalidate 経路を変えないこと）。
- **手順:** `/_app/views`（最も配線が単純な inline input）で rename を編集 → 保存 → 画面に留まったまま最新値が反映されることを確認。
- **期待結果:** 保存後は loader 最新値が表示される（フック追加が invalidate セマンティクス・最新値再表示を壊していない）。
- **確認ポイント:** 復元フックは focus/caret のみを扱い、value 反映・invalidate 発火経路には介入しないこと。

### R-2. 入力 value 保持の非退行（AC-7）

- **目的:** 追加した selection 記録用イベントハンドラが既存 `onChange` と干渉せず、入力 value が保持される。
- **手順:**
  1. `/_app/views` inline rename に入力 → 本命相当 invalidate → value が保持されることを確認（代表確認）。
  2. `/admin/prompts`（onChange と新規イベントハンドラが同居する新規配線箇所）の text・variables にも入力 → invalidate → value が保持されることを軽く確認。
- **期待結果:** invalidate 後も入力中の value が保持される（#670 で実証済みの挙動を壊さない）。
- **確認ポイント:** admin の新規配線で `onChange` と `onSelect`/`onKeyUp`/`onMouseUp` 等が共存しても value 更新が壊れないこと。

### R-3. 品質ゲート（AC-8）

- `pnpm typecheck && pnpm lint:fix && pnpm format` が通ること。一時プローブ（あれば）を削除済みであること。
