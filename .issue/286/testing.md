# 動作確認計画 — Issue #286: モード切替「破棄」時の in-flight autosave をキャンセル/ロールバックする

**Issue:** #286
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

### 1. `saving` 中にモード切替「破棄」で in-flight な fetch がキャンセルされる

- **目的:** Issue 完了条件のメインケース。confirm OK 後に `saveDraft` が AbortController でキャンセルされ、サーバー側 dirty 永続化を防げることを確認
- **手順:**
  1. 既存ノート編集画面 `/notes/{noteId}/edit` を開く
  2. DevTools の Network タブを開き、フィルタを `saveDraft` または `Fetch/XHR` に絞る
  3. 本文や frontMatter を編集して dirty 化（debounce が 1500ms なので、編集直後は `dirty`、その後 `saving` に遷移する）
  4. AutosaveIndicator が `保存中…` に変わったタイミングで素早くモード切替タブをクリック（例: `inline` → `html`）
  5. `window.confirm("未保存の変更があります。保存せずに切り替えますか？")` が表示されたら「OK」を選択
- **期待結果:**
  - DevTools Network 上で `saveDraft` の fetch が `(canceled)` で終わる
  - AutosaveIndicator が `保存中…` から消えて `idle` 表示に戻る
  - エラーバナーは表示されない（`AbortError` は既存 catch が吸収）
  - サーバー側で書き込みが起きていないことは、別タブで `/notes/{noteId}` を開いて編集内容が反映されていないことで間接確認できる（ベストエフォートのキャンセルなので、abort 直前に fetch が到達済みなら書き込まれることはありうる）
- **確認ポイント:**
  - `(canceled)` ステータスの有無
  - autosave インジケータの状態遷移

### 2. `autosaveError` 状態でモード切替「破棄」を選んだとき、エラーバナーが消える

- **目的:** Issue 検討事項3「`autosaveError` 状態でモード切替『破棄』を選んだケース」を確認
- **手順:**
  1. ノート編集画面を開く
  2. autosave がエラーになる状況を作る（例: DevTools の Network スロットリングを `Offline` にしたり、`saveDraft` server fn が失敗するように事前にコードに一時的なエラーを注入したり）
  3. 本文を編集して autosave をトリガー → `保存に失敗しました` バナーが表示されるのを待つ
  4. モード切替タブをクリック（confirm 発動: `error` も dirty 扱い）
  5. 「OK」を選択
- **期待結果:**
  - エラーバナーが消える
  - AutosaveIndicator が `idle` に戻る
  - モード切替後、ネットワークを通常に戻して編集を続けると autosave が再開する（`dirtyKeys` 保持の確認）
- **確認ポイント:**
  - エラーバナーの dismiss
  - モード切替後の autosave 再開

### 3. confirm「キャンセル」では in-flight が維持される

- **目的:** 「キャンセル」を選んだ場合に既存の autosave 経路が破壊されないことを確認
- **手順:**
  1. ノート編集画面で dirty 化 → `saving` 中になる
  2. モード切替タブをクリック → confirm 表示
  3. 「キャンセル」を選択
- **期待結果:**
  - モードは切り替わらない
  - DevTools Network 上で `saveDraft` fetch がキャンセルされず、通常通り完了する
  - autosave インジケータは `保存中…` → `保存しました` の正常遷移を辿る

### 4. WYSIWYG → 他モード切替（ack 未済）の破棄後、新モードで autosave が再開する

- **目的:** リスク欄に明記した「破棄→新モードで autosave 再走」が期待動作であることを目視確認
- **手順:**
  1. unsupported tag を含むノートを開き wysiwyg モードに切替（autosave ゲートが off）
  2. dirty 化（例: 本文編集 — このとき autosave は走らない）
  3. モード切替タブで `html` を選択 → confirm OK
- **期待結果:**
  - モードが `html` に切り替わる
  - 新しい mode で `canFlush` が真に変わり、debounce 後に autosave が走る（インジケータが `保存中…` → `保存しました`）
  - DevTools Network 上で破棄イベント後に新規 `saveDraft` fetch が観測される
- **確認ポイント:**
  - これは「dirty を保持する」設計意図に沿った期待動作

## エッジケース・異常系

### 1. abort 直前に fetch が完了するレース

- **目的:** ベストエフォートの abort 範囲外の挙動を確認
- **手順:**
  1. Network スロットリングを `No throttling` にし、`saveDraft` の応答が極めて速い状態を作る
  2. dirty 化 → saving 中に素早くモード切替 → confirm OK
- **期待結果:**
  - abort 直前に fetch が完了済みの場合、Network 上では `200` で終了する
  - サーバー側にコンテンツが書き込まれることはありうる（仕様内の許容範囲）
  - UI 上は `autosaveDiscarded` が走るので indicator は `idle` に戻る

## 既存機能への影響確認

- `inline` / `wysiwyg` / `html` / `frontMatter` の任意 2 モード間の切替が、autosave が動いていない状態（idle）でも従来通り動くこと
- AutosaveIndicator の通常遷移（`idle` → `dirty` → `saving` → `saved`）が変わっていないこと
- Issue #233 で実装された confirm 順序（blur → dirty 再評価 → confirm → dispatch）が保たれていること
- ノート保存ボタン（手動 save）と autosave の競合が変わっていないこと

## 確認チェックリスト

- [ ] saving 中にモード切替「破棄」で fetch が `(canceled)` になる
- [ ] 破棄後に AutosaveIndicator が `idle` に戻る
- [ ] `autosaveError` 状態で「破棄」OK するとエラーバナーが消える
- [ ] confirm「キャンセル」で in-flight が維持される
- [ ] wysiwyg ack 未済 → 他モード切替で新モードの autosave が走る
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` がエラーなく通る
- [ ] `pnpm test:unit` がエラーなく通る
- [ ] 既存の autosave 通常遷移（idle → dirty → saving → saved）が変わっていない
