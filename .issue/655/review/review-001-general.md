# Review 001 — General（PR #656）

対象: `app/components/note/editor/MediaUploader.tsx`（コード差分はこの1ファイルのみ）
計画: `.issue/655/plan.md`

## 受け入れ基準の検証

| AC | 判定 | 根拠 |
|----|------|------|
| AC-1 | 満たす | `putWithProgress`（MediaUploader.tsx:46-72）が `XMLHttpRequest` で PUT し、`xhr.upload.onprogress` で進捗取得 |
| AC-2 | 満たす | `progress` が数値のとき `<ProgressBar value={state.progress} decorative />` で determinate 表示、テキストに `（n%）` 併記 |
| AC-3 | 満たす | `runUpload` の catch で `lastFile: file` を保持し `onRetry` で再送（既存ロジック不変） |
| AC-4 | 満たす | 非2xx は `onload` 内で status 判定して reject、`onerror`/`onabort`/`ontimeout` も reject → 従来どおり catch → `RetryableError` 表示。旧 `!putRes.ok` と等価 |

計画の設計（`UploadState.uploading` への `progress: number | null` 追加、null=indeterminate、decorative バー + 隣接テキスト）も実装と一致している。

### General Review

#### Blockers

なし

#### Warnings

- **[W-001]** `aria-live="polite"` のテキストにパーセント値を埋め込んでおり、進捗更新のたびに live region が変化する
  - 場所: `app/components/note/editor/MediaUploader.tsx:143-146`
  - 理由: `xhr.upload.onprogress` は大きいファイルで毎秒複数回発火しうる。`（1%）（2%）…` と live region の内容が変わるたびにスクリーンリーダーがアナウンスを試み、読み上げスパムになる（polite でもキューには積まれる）。ProgressBar の JSDoc が想定する「隣接テキストが状態を伝える」パターンは静的な状態文言を想定しており、高頻度で変化する数値とは相性が悪い
  - 提案: live region は「アップロード中…」の静的文言のみにし、パーセント表記は `aria-live` の外に出す（例: `<p aria-live="polite">アップロード中…</p>` + 別要素で `（n%）`）。あるいはパーセントを `aria-hidden` の span に入れる

#### Notes

- **[N-001]** `xhr.timeout` を設定していないため `ontimeout` は実質発火しない（ブラウザ既定は 0 = 無制限）
  - 場所: `app/components/note/editor/MediaUploader.tsx:69`
  - ハンドラ自体は無害（防御的）だが、タイムアウトを意図するなら `xhr.timeout = ...` の設定が必要。現状は dead code に近い
- **[N-002]** ProgressBar の条件分岐は `value` が optional なので 1 つに畳める
  - 場所: `app/components/note/editor/MediaUploader.tsx:147-151`
  - `<ProgressBar value={state.progress ?? undefined} decorative className="mt-1" />` で同じ挙動（`undefined` → indeterminate）。必須ではない
- **[N-003]** PUT 完了後の finalize（サーバー側処理）中は `100%` のバーが表示され続ける
  - 場所: `app/components/note/editor/MediaUploader.tsx:94-99`
  - 通常 finalize は短時間であり、`100%` + 「アップロード中…」表示は誤解を招かない範囲。計画のスコープ（presign/finalize フェーズの進捗高度化は対象外）どおり
- **[N-004]** アンマウント後 setState の懸念は実質なし
  - `runUpload` は upload 完走/失敗まで setState を続けるが、MediaUploader はノート編集画面に常駐し、React 18+ ではアンマウント後 setState も警告なし・無害。AbortController/cleanup の追加は過剰
- **[N-005]** `putWithProgress` 冒頭のコメントは「なぜ XHR か（fetch は進捗を露出しない）」の why コメントであり、プロジェクト規約に適合
- **[N-006]** 進捗 setState のレースなし: `onprogress` → `onload`/`onerror` の順序は XHR 仕様で保証され、reject 後に progress イベントは来ないため、error 表示が progress で上書きされることはない
