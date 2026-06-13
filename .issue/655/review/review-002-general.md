# Review 002 — General（PR #656, Round 2）

対象: `app/components/note/editor/MediaUploader.tsx`（コード差分はこの1ファイルのみ）
計画: `.issue/655/plan.md` / 前ラウンド: `review-001-general.md`

## 前ラウンド指摘の確認

- **[W-001] 修正確認: OK** — `aria-live="polite"` は静的文言「アップロード中…」のみを含む span（MediaUploader.tsx:144）に限定され、パーセント表記は別の `aria-hidden="true"` span（145-147）に分離された。進捗更新で live region の内容は変化せず、読み上げスパムは解消。提案どおりの修正で、視覚ユーザーには % が見え、SR には静的状態文言のみが伝わる構成として妥当。
- [N-001]〜[N-006] は参考情報のため対応不要（変化なし）。

## 受け入れ基準の検証（ゼロベース再確認）

| AC | 判定 | 根拠 |
|----|------|------|
| AC-1 | 満たす | `putWithProgress`（MediaUploader.tsx:46-72）が `XMLHttpRequest` で PUT し、`xhr.upload.onprogress`（`lengthComputable` 時のみ）で進捗取得。マニュアルテスト TC-1 でも network 上の resource type XHR を確認済み |
| AC-2 | 満たす | `progress !== null` のとき `<ProgressBar value={state.progress} decorative />`（150）で determinate 表示。`ProgressBar` 側で 0-100 に clamp、`transition-[width]` 付き |
| AC-3 | 満たす | catch 節で `lastFile: file` を保持（106-110）、`onRetry`（121-124）で同一 File を `runUpload` に再投入。TC-2 で同一 byteSize の再送を HAR 確認済み |
| AC-4 | 満たす | 非2xx は `onload` 内 status 判定で reject（60-66）、`onerror`/`onabort`/`ontimeout` も reject → catch → `extractSerializedError` → `RetryableError`。旧 `!putRes.ok` と等価 |

計画の設計（`UploadState.uploading` への `progress: number | null` 追加、null=indeterminate、decorative バー + 隣接テキスト、presentation 層のみの変更）と実装は一致。

### General Review

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** （前ラウンド N-001 の継続）`xhr.timeout` 未設定のため `ontimeout` ハンドラは実質発火しない防御的コード。無害であり対応不要
- **[N-002]** （前ラウンド N-002 の継続）ProgressBar の二分岐（149-153）は `value={state.progress ?? undefined}` で 1 つに畳めるが、現状の明示的分岐も可読で問題なし
- **[N-003]** % 表記が `aria-hidden` のため SR ユーザーには具体的な進捗率が伝わらないが、これは W-001 で提示された 2 案のうちの一方を採用した意図的なトレードオフ。決め打ちの進捗率読み上げが必要になったら throttle した別 live region か非 decorative progressbar への切替を検討すればよく、現時点では過剰
- **[N-004]** 規約適合の再確認: state 表示は判別共用体で illegal state を排除、`try/catch` は server-function 境界相当のクライアント側集約 1 箇所のみ、スタイルは Tailwind ユーティリティのみ、コメントは why コメント 1 件のみ。CLAUDE.md の規約に適合

## 結論

Blockers: 0 / Warnings: 0。W-001 修正は正しく適用済み。APPROVED。
