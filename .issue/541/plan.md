# 実装計画 — Issue #541: impl: 領域2「取り込み・書き出し」(P13/P15/P16) のモック実装追従（#514 子）

**Issue:** #541
**作成日:** 2026-06-07
**複雑度:** 中〜大規模

---

## 目的

#510 で確定した領域2「取り込み・書き出し」のデザインモックに実装を追従させる。実態は #539（共通 `.alert` 基盤、PR #547）から本Issueへ委譲された**純新規 UI 2 件**を、既存の `ALERT*` 定数を再利用して実装することに集約される。

1. P13 アップロードのクライアント側「対応外形式」`.alert-error` /「サイズ超過」`.alert-warning` 検証バナーを新設
2. P15 エクスポートの「非同期ジョブを推奨します」`.alert-info` 推奨バナーを選択件数連動ロジック付きで新設

## スコープ

### 含まれるもの
- P13 アップロード（`UploadForm.tsx` / `UploadDialog.tsx` の `SelectView`）へのクライアント検証バナー（未対応形式 = `ALERT_ERROR` / サイズ超過 = `ALERT_WARNING`）
- P15 エクスポート（`ExportForm/index.tsx`）への非同期ジョブ推奨バナー（`ALERT_INFO`、bulk 文脈・件数連動）
- 上記ロジックの単体テスト追加・既存テストの整合更新
- 既存 `ALERT*` 共通定数（`app/components/common/styles.ts`）の再利用

### 含まれないもの
- `ExportForm/index.tsx` 全体のトークン化・フォーム意匠（セグメント/ラジオ/フッター）→ **#509 / #401 の所有領域**
- P15/P16 のジョブ一覧・詳細・`.fail-summary` の意匠 → **#509 / #401**
- アップロード導線の再設計 → **#538**
- `/export`・`/notes/$noteId/export` の AppShell 付与 → **#502**
- admin/Jobs の Wire 境界・DLQ 可視化・errorReason サニタイズ → **#268 / #160 / #84**
- `ALERT*` スタイル定数の新設・変更（#539 で確定済み、重複定義しない）
- **P13 ページの `format-chips`（対応形式チップ群、`P13-upload.html` 948-959行）** → 本Issueは #539 から委譲された `.alert` 箱 2 件に限定する。チップ群は alert ではない別の純新規 UI のため本Issueでは扱わない。エラーバナー本文の「対応形式 (...) のみ取り込めます」は文言内に列挙して自己完結させる（チップ群への依存を作らない）。軽微なため必要なら Phase 4 でスコープ外Issueとして起票を検討する。

## 実装ステップ

### 1. クライアント側検証ヘルパーを切り出す

- **対象ファイル:** `app/components/ingestion/UploadForm.tsx`（ローカル関数として定義し `UploadDialog.tsx` から import）
- **変更内容:** `FileList`（または `File[]`）を受け取り、(a) `IngestionService.detectKind(file.type, file.name)` の throw を `try/catch` で拾って「未対応形式ファイル名の配列」、(b) `file.size > MAX_UPLOAD_BYTES` で「サイズ超過ファイル `{name, sizeLabel}` の配列」を返す純関数を用意。
- **サイズ定数の SSOT（ADR-002 参照）:** `MAX_UPLOAD_BYTES` はドメインの `defaultMaxBytes`（= 50 MB）と二重管理にしない。現状 50 MB リテラルは `valueObject.ts` の `IngestionLimits.defaults()` **メソッド内**（316行付近）にのみ存在し top-level 定数は無い。実装時は `valueObject.ts` に `export const DEFAULT_MAX_INGESTION_BYTES = 50 * 1024 * 1024` を新設し、**`defaults()` 側もこの定数を参照するよう書き換えて**ドメイン内の二重化を防ぐ。クライアント component からはこの定数を import する（`DirectoryPicker.tsx` が `MAX_DIRECTORY_DEPTH` を domain valueObject から import する確立済みパターンと同型。依存方向 presentation → domain で違反なし、バンドルも安全）。
- **理由:** P13 ページとモーダル `SelectView` で同じ検証を二重実装しないため。`detectKind` 再利用でサポート形式判定の SSOT をドメインに残したまま UX ガードを足す。

### 2. P13 アップロードページに `.alert-error` / `.alert-warning` バナーを新設

- **対象ファイル:** `app/components/ingestion/UploadForm.tsx`
- **変更内容:** ファイル選択/ドロップ時、アップロード送信の手前でステップ1のヘルパーを呼ぶ。
  - (a) 未対応形式があれば `ALERT + ALERT_ERROR` の箱（`ALERT_ICON` に Lucide 警告系アイコン `size={20}` `aria-hidden`、`ALERT_TITLE`「対応外の形式が含まれています」、`ALERT_BODY` 内に `<code className={ALERT_BODY_CODE}>{fileName}</code>` +「対応形式 (...) のみ取り込めます。」、`role="alert"`）を表示
  - (b) サイズ超過があれば `ALERT + ALERT_WARNING`（`ALERT_TITLE`「サイズ超過のファイル」、`ALERT_BODY` に `<code>{name} ({sizeLabel})</code>` +「上限 50 MB を超えています。…」、`role="alert"`）
  - 検証で弾いたファイルはアップロード対象から除外し、残りのみ送信。バナー状態は `useState` で保持し、新たなファイル選択でクリア。既存のサーバーエラー `FORM_ERROR` 表示は温存（多重防御）。
  - **除外時の挙動（ページ・モーダル共通）:** 一部のみ弾かれた場合は残りのファイルで `upload` を呼ぶ。全ファイルが弾かれた場合は `upload` を呼ばず（`isPending`/`uploading` に入らず）、バナー表示のみに留める。
- **理由:** #539 から委譲された P13 純新規 UI の本体。`ALERT*` 定数再利用で px・色のリテラル持ち込みを避ける。

### 3. アップロードモーダルの `SelectView` にも同検証バナーを反映

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`
- **変更内容:** `submitFiles` の冒頭でステップ1のヘルパーを通し、弾いたファイルを除外。`SelectView` に検証結果を渡し、既存 `error` の `FORM_ERROR` 表示近傍に `ALERT_ERROR` / `ALERT_WARNING` の箱をレンダー。すべて弾かれた場合は `view` を `select` のまま維持（`uploading` に遷移しない）。
- **理由:** P13 のドロップゾーンはページ・モーダル両方に存在し、検証バナーはユーザーがファイルを与える地点で出るべき。ロジックを共有して挙動を一致させる。
- **注意:** モーダルの状態機械（`view` discriminated union, ポーリング, `cancelledRef`）は既存 ADR で確立済み。検証は `select` ビュー内に閉じ、遷移ロジックそのものは変えない。
- **SSOT 逸脱の明示（ADR-004 参照）:** モーダルモック（`P13-upload-modal.html` / `P13a-upload-modal.html`）には当該検証バナーの「箱」が描かれておらず、バナーが図示されているのはページ側 `P13-upload.html` のみ。それでもモーダルに同バナーを足すのは、(1) #539 委譲メモが委譲対象に `UploadDialog.tsx` を明示的に含めていること、(2) ADR-001 のページ/モーダル挙動一致原則、に基づく意図的な判断（モック外 UI の追加）であることを記録する。

### 4. P15 エクスポートに `.alert-info` 推奨バナーを新設

- **対象ファイル:** `app/components/export/ExportForm/index.tsx`
- **変更内容:** bulk（`noteId === null`）時、`bulkNoteIds` をパースした件数 `ids.length` を導出し、件数が即時 DL 上限（モック「最大 50 件」相当）を超える、または `embedMedia` が ON のとき `ALERT + ALERT_INFO`（`role="note"`、`ALERT_ICON` に Lucide info 系 `size={20}`、`ALERT_TITLE`「非同期ジョブを推奨します」、`ALERT_BODY` に「選択中の N 件は…非同期ジョブを推奨します。完了通知は…<code className={ALERT_BODY_CODE}>エクスポートジョブ一覧</code> に送られます。」）を表示。single 文脈では出さない。バナーは推奨表示のみで送信を阻害しない。
- **理由:** #539 から委譲された P15 純新規 UI。`ALERT_INFO`（無彩色グレー、青を足さない）で index.md の info 原則を守る。
- **既定発火の明示:** 実コードの `embedMedia` 初期値は `true`。発火条件が「件数 > 50 **または** `embedMedia` ON」のため、bulk 画面を開いた瞬間に既定で推奨バナーが表示される。これはモック代表例（embedMedia ON で発火）と整合する意図的挙動。即時上限 50 はモック `P15-export.html` 713行「最大 50 件まで」が出所であり、名前付き定数化する際はコメントで参照根拠を残す。
- **「メール」文言の扱い:** モック文言は「完了通知はメールと `エクスポートジョブ一覧` に送られます」。実装時にエクスポート完了のメール通知が実在するか（usecase/adapter/notification）を確認し、**未実装なら「メール」を文言から落とす**（例: 「完了したら `エクスポートジョブ一覧` から確認できます」）。未実装機能を約束する UI にしない。
- **スコープ注意:** ここで触るのは `.alert-info` の箱追加のみ。素 `<p role="alert">` のエラー群やフォーム全体のトークン化は #509/#401 の所有につき変更しない。

### 5. テストの追加・更新

- **対象ファイル:** `app/components/ingestion/__tests__/UploadForm.test.tsx`（既存）、必要に応じ `UploadDialog.test.tsx`、`ExportForm` 用の新規テスト
- **変更内容:**
  - (a) 未対応形式（例: `archive.zip`）投入時に `.alert-error`「対応外の形式が含まれています」が出てアップロードが呼ばれない
  - (b) 50 MB 超ファイルで `.alert-warning`「サイズ超過」が出る
  - (c-1) bulk で件数 > 50 のとき `.alert-info`「非同期ジョブを推奨します」が出る
  - (c-2) bulk・件数 50 以下・`embedMedia` ON（= モック代表例の 12 件 + メディア）でも `.alert-info` が出る（embedMedia 単独条件の回帰）
  - (c-3) single では `.alert-info` が出ない / bulk でも textarea が空（0 件）なら出ない
  - (d) `file.type === ""` の両分岐: `detectKind("", "photo.png")` は拡張子フォールバックで通過、`detectKind("", "archive")`（拡張子なし）は弾かれる
  - 既存の「サーバーエラー `unsupported_format` を素テキスト表示」テストはクライアント検証導入後の挙動に合わせて更新（クライアント検証を通過する入力に調整、または期待挙動を更新）
- **理由:** 委譲ロジック（検証・推奨）の回帰防止。

### 6. 仕上げ

- **対象ファイル:** 変更全体
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format`。未使用 import 整理。残存課題があれば `.issue/541/progress.md` に記録。

## 設計判断

詳細は `adr.md` を参照。

- **ADR-001:** クライアント検証ヘルパーの置き場所（`UploadForm.tsx` ローカル + `UploadDialog` から import）
- **ADR-002:** サイズ上限値の出所（UX ガードは 50 MB 名前付き定数、最終判定はサーバーに委ねる二段構え）
- **ADR-003:** P15 推奨バナーの発火条件（bulk かつ 件数 > 50 または `embedMedia` ON、single では非表示）

## リスクと注意点

- **スコープ侵食が最大リスク。** `ExportForm/index.tsx` は素 HTML で全面トークン化したくなるが #509/#401 の所有。本Issueは `.alert-info` の箱追加のみに厳格に限定する。
- `UploadDialog.tsx` は既存 ADR で確立した複雑な状態機械（ポーリング・`cancelledRef`・`view` union）を持つ。検証ガードは `select` ビュー内に閉じ、遷移ロジックは変えない。
- `detectKind` のクライアント判定はサーバーと同一純関数だが、ブラウザが `file.type` を空で返すケースは拡張子フォールバックに依存。`detectKind` は既に拡張子フォールバックを持つので挙動一致するが、テストで `file.type === ""` ケースも確認。
- info は無彩色グレー維持（`ALERT_INFO`）。青を足さない原則を崩さない。
- 既存 `UploadForm.test.tsx` の「`evil.exe` でサーバーエラー表示」テストは、クライアント検証導入後に `.exe` がクライアントで弾かれて `upload` が呼ばれなくなる可能性がある。テスト入力を調整するか期待挙動を更新する（見落とすと既存テストが赤くなる）。

## テスト方針

- **単体（happy-dom / vitest）:** 未対応形式 → `.alert-error`、サイズ超過 → `.alert-warning`、bulk 件数超 → `.alert-info`、single では非表示、`upload` server-fn が弾いたファイルに対して呼ばれないこと。
- **型/リント:** `pnpm typecheck && pnpm lint:fix && pnpm format`。
- **ブラウザ確認（manual-test）観点:**
  - `/upload` で `archive.zip` ドロップ → `.alert-error` に `archive.zip` が `<code>` 表示、アップロード非開始。対応形式のみ通る
  - 50 MB 超ファイルで `.alert-warning` にファイル名 + サイズが `<code>` 表示
  - ヘッダー「アップロード」モーダルでも同じ検証バナー
  - `/export`（bulk）で 51 件以上入力 or「メディアを埋め込む」ON → `.alert-info`「非同期ジョブを推奨します」が無彩色グレー、`<code>エクスポートジョブ一覧</code>` が mono。`/notes/$noteId/export`（single）では非表示
  - 各アラートの配色がモック（白地 + セマンティックヘアライン枠 + `shadow-xs`）と一致、リテラル px 混入なし
  - SR: error/warning は `role="alert"`、info は `role="note"`

## レビュー履歴

### 1周目
**修正した点**:
- **[P-001]（要件カバレッジ）** モーダル `SelectView` への検証バナー追加がモックに裏付けが無い件 → ステップ3に SSOT 逸脱の明示的根拠を追記し、**ADR-004** として「#539 委譲メモの `UploadDialog.tsx` 明示 + ADR-001 のページ/モーダル一致原則に基づくモック外 UI の意図的追加」を記録。

**取り込んだ改善提案**:
- **[S-003要件]** `format-chips`（対応形式チップ群）をスコープ「含まれないもの」に明記。エラー文言は自己完結させチップ群に依存しない方針に。
- **[S-001要件]** P15 テストに `embedMedia` 単独条件（モック代表例 12 件 + メディア）の回帰ケース (c-2) を追加。bulk 0 件・single 非表示も (c-3) に明記。
- **[S-002要件]** P15「メール通知」文言の扱いをステップ4に追記（実装時に実在確認、未実装なら「メール」を落とす）。
- **[S-001アーキ]** サイズ定数 `MAX_UPLOAD_BYTES` の SSOT をステップ1に明記（ドメインの軽量定数を import / リテラル再定義しない）。
- **[S-002アーキ]** `file.type === ""` の両分岐テスト (d) を追加。
- **[S-003アーキ]** 全除外/一部除外の挙動（ページ・モーダル共通）をステップ2に明文化。

**見送った提案とその理由**:
- なし（視点2は問題点ゼロ。改善提案はすべてスコープ内で妥当だったため取り込み）。

### 2周目: 両視点とも問題点ゼロで終了
**取り込んだ改善提案**:
- **[S-001アーキ]** 50 MB リテラルが `defaults()` メソッド内のみに存在する件 → ステップ1に「`defaults()` 側も新定数を参照するよう書き換えてドメイン内二重化を防ぐ」を明記。`DirectoryPicker.tsx` の `MAX_DIRECTORY_DEPTH` import が同型の確立済みパターンであることも確認。
- **[S-002要件]** `embedMedia` 既定 `true` により bulk 画面で既定バナー表示される挙動が意図的である旨をステップ4に明記。即時上限 50 の出所（モック713行）も追記。
- **[S-001要件]** 50 の名前付き定数化時にモック713行を参照コメントで残す方針をステップ4に反映。

**見送った提案とその理由**:
- なし。

両視点ともに「問題点ゼロ」を報告し収束。レビューループ終了。
