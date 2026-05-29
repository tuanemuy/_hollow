# 実装計画 — Issue #319: アップロードモーダル: 既存ジョブ起点（再生成/将来のretry）の waiting ポーリング fatal 時はキュー誘導する

**Issue:** #319
**作成日:** 2026-05-29
**複雑度:** 小規模（`UploadDialog.tsx` ＋ その test に閉じたフロントエンドのみの変更）

---

## 目的

`UploadDialog` の `waiting` ポーリングで fatal error が発生したとき、起点に応じて遷移先を出し分ける。

- **初回アップロード起点** → 従来通り `select` view（やり直し導線）。
- **既存ジョブ起点（再生成 / failed retry）** → `select` に戻さず、ジョブがキューに残っていることを伝えてキューへ誘導する。

#253（ADR-003）で再生成後は `editing → waiting` へ再遷移し既存ポーリングに乗せる設計にしたが、`waiting` ポーリングの fatal error 時は一律 `select`（最初のドロップゾーン）へ戻る（`UploadDialog.tsx:251-254`）。既存ジョブを編集中のコンテキストでは編集対象を見失うため、これを起点別に出し分ける。

## スコープ

### 含まれるもの

- `waiting` view に「起点（初回アップロード / 既存ジョブ）」を表す情報を持たせる
- fatal error 時（および transient 上限超過時）の遷移先を起点別に出し分ける
- 既存ジョブ起点の terminal poll 失敗用に「キュー誘導」view を追加
- `UploadDialog.test.tsx` に起点別の遷移テストを追加

### 含まれないもの

- バックエンド（usecase / domain / adapter）の変更 — 本 Issue はナビゲーション（UI 遷移）のみ
- `select` view・初回アップロード導線の見た目変更
- ジョブ永続化・キュー機構そのものへの変更（既に永続化済み）

## 実装ステップ

### 1. `waiting` view に起点フラグを追加

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`
- **変更内容:** `View` 判別共用体の `waiting` バリアントに `origin: "upload" | "existingJob"` を追加する。
  - `"upload"` … 初回アップロード（`submitFiles` の単一ファイル経路）
  - `"existingJob"` … 既存ジョブの再生成 / failed retry（`onRegenerated` 経由。retry は `FailedView.onRetry → onRetried = onRegenerated` で同経路）
- **理由:** fatal 時の遷移先を決めるための起点情報を view machine に持たせる。`onRegenerated` は再生成・retry 双方の単一入口なので、ここに `"existingJob"` を1箇所設定すれば両方カバーできる。

### 2. キュー誘導 view を追加

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`
- **変更内容:** `View` に `{ kind: "queueGuidance" }` を追加し、対応するプレゼンテーション（`QueueGuidanceView`）を実装する。内容は「待機中にエラーが発生したが、ジョブはキューに残っており `/upload` から続行できる」旨 ＋ 発生したエラーの `displayError` ＋ キュー画面リンク（既存 `timedOut` view と同じ導線様式）。
- **理由:** Issue 案の「`/upload` リンク表示」を採用。`failed` view は `job` オブジェクト（`originalFileName`/`errorCode` と retry/discard の serverFn 呼び出し）を要求するが、poll fatal 時に手元にあるのは `jobId` と serialized error のみで `failed` view 相当は再利用できない。詳細は adr.md ADR-001。

### 3. ポーリング effect の fatal / transient-cap 分岐を起点別にする

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`
- **変更内容:**
  - effect が依存する scalar に `origin` を追加（`waitingOrigin`）。effect の依存配列にも追加。
  - fatal 分岐（`isPollFatalError` true）と transient 上限超過分岐の両方で、`setError(serialized)` 後の遷移先を起点別に出し分ける小ヘルパーを用意:
    - `origin === "upload"` → `setView({ kind: "select" })`（従来）
    - `origin === "existingJob"` → `setView({ kind: "queueGuidance" })`
- **理由:** transient 上限超過も「ポーリングを諦めた terminal failure」で、現状一律 `select` へ戻る点は fatal と同じ UX 欠陥を持つ。Issue の意図（既存ジョブ起点で編集コンテキストを見失わせない）は両経路に等しく当てはまるため、両方を起点別にする（adr.md ADR-002）。

### 4. `viewStatusText` と各種派生に新 view を反映

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`
- **変更内容:**
  - `viewStatusText` に `queueGuidance` の case を追加（SR 向けに「ジョブはキューに残っています」等、`role="alert"` のエラーと二重読み上げにならない簡潔な案内文。`select` が `""` を返すのと同じ二重読み上げ回避の方針に倣う）。
  - `queueGuidance` のレンダリング分岐を追加。`isPending`（uploading/waiting/editing）には含めない（`select`/`failed`/`timedOut` と同列の terminal view）。

### 5. テスト追加

- **対象ファイル:** `app/components/ingestion/__tests__/UploadDialog.test.tsx`
- **変更内容:**
  1. **既存ジョブ起点（再生成）の fatal → キュー誘導:** `editing` から再生成 → `waiting`（existingJob）に入り、次の poll で fatal（forbidden/business）→ `queueGuidance` view（ドロップゾーンに戻らない、キュー画面リンク表示）を検証。
  2. **既存ジョブ起点（retry）の fatal → キュー誘導:** `failed` から再試行 → `waiting`（existingJob）→ fatal → `queueGuidance` を検証（少なくとも1ケースは retry 経路でも担保）。
  3. **初回アップロード起点の fatal → select（回帰）:** 既存の「Business-kind error で select へ戻る」テストが初回アップロード起点の挙動維持を担保していることを確認（必要なら明示コメント補強）。
- **理由:** Issue 受け入れ基準。起点別の分岐を view machine レベルで回帰ガードする。

## 設計判断

- **ADR-001:** 既存ジョブ起点の poll fatal は専用「キュー誘導」view（`/upload` リンク）にする（`failed` view 相当は job 不在で再利用不可）。
- **ADR-002:** fatal だけでなく transient 上限超過の terminal failure も起点別に出し分ける（同一 UX 欠陥のため）。

詳細は `.issue/319/adr.md` を参照。

## リスクと注意点

- ポーリング effect は scalar 依存（`waitingJobId`/`waitingStartedAt`）で1セッション1マウントを維持している。`origin` も scalar として追加し、依存配列に含める。`origin` は waiting セッション内で不変なので effect の再マウント挙動は変わらない。
- `viewStatusText` は `default: throw`（網羅性チェック）なので、新 view の case 追加漏れは型・実行時の双方で検出される。
- 二重読み上げ回避: `queueGuidance` のエラーは `role="alert"` で出し、`role="status"` 側は案内文のみにする。
- 既存テスト（初回アップロード fatal → select、timedOut、transient cap → select 等）を壊さないこと。transient cap → select の既存テストは初回アップロード起点なので挙動不変。

## テスト方針

- ユニット: 上記テスト追加（`pnpm test:unit`）。
- ブラウザ: 再生成 → 待機中に fatal を再現するのは困難なため、主に happy path（再生成後 waiting → editing 復帰）と既存ジョブ起点が編集コンテキストを保つ導線を確認。詳細は testing.md。
