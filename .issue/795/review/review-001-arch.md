# Architecture / Consistency レビュー — PR #797（Issue #795）

**レビュー日:** 2026-06-27  
**対象:** Issue #795 実装（editor メディアアップロード UI 刷新）  
**観点:** Architecture / Consistency（CLAUDE.md 規約準拠、レイヤー方向、依存整合性）

---

## 総評

実装は CLAUDE.md の Styling 規約・層方向・命名規約をほぼ遵守しており、ADR-001/ADR-002 の設計判断を正しく反映している。`MediaUploader` の UI 刷新は入力層（presentation）に閉じており、core レイヤーへの逆流なし。ただし以下の軽微な整合性リスク・命名の粗さが残っている。

---

## Blockers

なし。機能・アーキテクチャともに実装をブロックする違反は検出されない。

---

## Warnings

### [W-001] size 上限 hardcoding → BYTE_SIZE_MAX 定数参照化推奨

**場所:** `app/components/note/editor/MediaUploader.tsx:297`

**内容:**
```typescript
// 現行（L297）
は上限 5 GB を超えています。

// BYTE_SIZE_MAX との不整合リスク
```

**理由:**
- ADR-002 で「クライアント/サーバー検証上限の SSOT を `BYTE_SIZE_MAX`」と明示。
- `schema.ts:5` で `BYTE_SIZE_MAX = 5 * 1024 * 1024 * 1024` として export されている。
- MediaUploader が「上限 5 GB」をハードコードしており、サーバー側で `BYTE_SIZE_MAX` が変わった際に両者が乖離する可能性。
- 検証ロジック（`validation.ts`）は `BYTE_SIZE_MAX` を参照しているが、UI メッセージだけ hardcoding は不整合。

**提案:**
`MediaUploader.tsx` で `BYTE_SIZE_MAX` をインポートし、以下のように修正：
```typescript
import { BYTE_SIZE_MAX } from "@/components/media/schema";

// L297 付近
は上限 ${formatMegabytes(BYTE_SIZE_MAX)} を超えています。
```

または、`media/validation.ts` に格式化 helper を export して再利用する選択肢もあり。

---

### [W-002] State property naming awkwardness — `kind_` の underscore 使用

**場所:** `app/components/note/editor/MediaUploader.tsx:58`

**内容:**
```typescript
type UploadState = {
  kind: "uploading";
  file: File;
  kind_: "image" | "video";  // ← awkward naming
  progress: number | null;
  thumbnailUrl: string | null;
}
```

**理由:**
- `state.kind === "uploading"` が既に存在するため、union discriminator と衝突を避けるために `kind_` と命名。
- CLAUDE.md では命名規約（*ErrorCode の lower_snake_case など）を定めているが、property 名に関する明示的な禁止はない。
- ただし underscore suffix は Python やその他言語の「private」慣習に由来し、TypeScript では一般的でない。
- 読みやすさ・保守性の観点では `mediaKind` / `uploadKind` / `selectedKind` など別名がより自明。

**提案:**
以下いずれかへの改名：
- `mediaKind`: 「この state では upload 対象 media の kind」として明確
- `uploadKind`: 「upload フロー内での media kind」として state scope を限定
- `validatedKind`: 「validation で確認済みの kind」として来歴を示唆

---

### [W-003] `formatMegabytes` の定義重複

**場所:**
- `app/components/note/editor/MediaUploader.tsx:103-105`
- `app/components/media/validation.ts:23-25`
- `app/components/ingestion/UploadForm.tsx:48-50`

**内容:**
3 箇所で同一の `formatMegabytes(bytes: number): string` が定義されており、重複。

**理由:**
- CLAUDE.md の「繰り返すユーティリティは module-scoped 共有定数へ hoist」規約と一貫性がない。
- ただし、本 PR の scope は「media validation の新設」であり、既存の ingestion の `formatMegabytes` は手付かず。
- しかし `validation.ts` の新設時に「外部に切り出すべき utility」として考慮されなかった（重複を新規に作成した）。

**提案:**
次の PR か同 PR の拡張で、以下のいずれかを実施：
1. `app/components/common/utils.ts` に `formatMegabytes` を切り出し、3 箇所が import する（推奨）。
2. または `app/components/media/validation.ts` に一本化し、ingestion / editor が import（scope によっては過度）。

本 PR はこのまま merge してよいが、next epic で整理推奨。

---

## Notes

### [N-001] DROPZONE 移設の完全性確認 ✓

**確認内容:**
- 移設前（09ac5ef8^）: `UploadForm.tsx:30`, `UploadDialog.tsx:58` に同一文字列で定義
- 移設後（09ac5ef8）: 両者とも削除、`common/styles.ts` からインポート
- 文字列バイト単位で完全一致（plan.md の「完全一致確認」要件 ✓）
- コミット log にも inlining の重複解消が記録されている

**良い点:**
- ADR-001 で「ビジュアル SSOT」として明示された `DROPZONE` が、期待通り `common/styles.ts` に移設
- JSDoc（`common/styles.ts:541`）で「Issue #795 ADR-001」と参照が入り、設計根拠が追跡可能
- media/editor 固有の検証ロジックは別途 `media/validation.ts` として分離（ADR-001 の「ビジュアルのみ共有」を実装）

---

### [N-002] layer 越境なし ✓

**確認:**
- `validateMediaFile`（`media/validation.ts`）: pure function、I/O なし
- `BYTE_SIZE_MAX` export（`media/schema.ts`）: zod のみ依存、client-safe
-両者ともに presentation/frontend 層内（`app/components/`）
- core レイヤー（domain / application / adapters）への逆流なし
- ADR-002「同 presentation/frontend 層内参照で層越境はない」の判断が正確

---

### [N-003] 状態機械の簡潔性 ✓

**確認:**
- `UploadState: idle | uploading | error | done`（`selected` デッド状態なし）
- plan の「選択即アップロード」設計に一貫
- 二重起動ガード（L129-130, L193, L204）で concurrent upload 防止 ✓
- validation rejection を `idle.validationRejection?:` に optional で畳む（state explosion 回避）

---

### [N-004] ObjectURL lifecycle 管理 ✓

**確認:**
- `useEffect(() => () => revoke(url), [state])`（L119-126）で単一クリーンアップ
- 画像 kind のみ生成（動画は lucide アイコン、URL 生成なし）
- 状態遷移ハンドラ内の手動 revoke なし（二重 revoke / 取りこぼし回避）
- plan の「S-005 arch-risk」対応完了 ✓

---

### [N-005] 検証ロジック → presign への kind 正規化 ✓

**確認:**
- `validateMediaFile` が image/video を判定して `kind: "image" | "video"` を返す
- presign 呼び出しで validation result の `kind` を直接使用（L163）
- `kindForMime()` 重複判定を削除済み（plan の「S-002」対応）
- MIME→kind 正規化の単一化点が実現

---

### [N-006] a11y 実装の継続性 ✓

**確認:**
- `ProgressBar`（decorative）で aria-hidden による二重読み上げ回避（L357-358）
- success バナー（role="status", aria-live="polite"）で新規フィードバック（L316-317）
- error バナー（role="alert"）で即座通知（via RetryableError）
- dropzone label ↔ input の useId による関連付け（L112, L229, L246）
- aria-label="メディアを挿入"（L251）で入力目的を明記

---

### [N-007] test coverage 十分 ✓

**確認:**
- `validation.test.ts` で format / size / kind derivation をカバー
- happy-path の presign→PUT→finalize は manual-test レポートで環境制約により部分的（R2 emulation）だが、state machine 遷移は確認済み
- validation rejection バナーの出し分け（unsupported → error / oversized → warning）も TC-2 で確認

---

## Summary

| Category | Status | Count |
|----------|--------|-------|
| **Blockers** | なし | 0 |
| **Warnings** | W-001, W-002, W-003 | 3 |
| **Notes** | N-001〜N-007 | 7 |

**推奨アクション:**
- W-001（size hardcoding）: 必須修正（SSOT 整合性のため）
- W-002（property naming）: 改善推奨（readability のため）
- W-003（formatMegabytes 重複）: 次 PR で整理推奨（technical debt）

---
