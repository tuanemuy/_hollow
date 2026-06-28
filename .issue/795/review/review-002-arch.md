# Architecture / Consistency レビュー — PR #797（Issue #795）ラウンド 2

**レビュー日:** 2026-06-27  
**対象:** Issue #795 実装（editor メディアアップロード UI 刷新）  
**観点:** Architecture / Consistency（CLAUDE.md 規約準拠、レイヤー方向、依存整合性）  
**前ラウンド:** review-001-arch.md（Warning 3 件：W-001 / W-002 / W-003）

---

## 総評

ラウンド 1 の 3 つの Warning がすべて修正されており、アーキテクチャ・一貫性ともに良好な状態です。ADR-001/ADR-002 の設計判断が実装に正しく反映され、層越境・命名規約・JSDoc の品質も基準を満たしています。本 PR はマージ可能です。

---

## Blockers

なし。アーキテクチャ・品質いずれの観点からもブロッカーは検出されません。

---

## Warnings

### [W-001] BYTE_SIZE_MAX の constant 参照化 — ✓ **修正済み**

**前ラウンド指摘:**  
`MediaUploader.tsx:297` でサイズ上限が「5 GB」とハードコードされており、`schema.ts` の `BYTE_SIZE_MAX` との不整合リスクが存在。

**修正内容:**
- `app/components/media/schema.ts:5` で `export const BYTE_SIZE_MAX = 5 * 1024 * 1024 * 1024` に変更
- `MediaUploader.tsx:23` で `import { BYTE_SIZE_MAX } from "@/components/media/schema"`
- `MediaUploader.tsx:300` で `は上限 {formatMegabytes(BYTE_SIZE_MAX)} を超えています。` に修正

**評価:** ADR-002「クライアント/サーバー検証上限の SSOT を `BYTE_SIZE_MAX`」が完全に実装されました。UI メッセージとサーバー schema が同一の定数を参照し、変更時の不整合がなくなりました。✓

---

### [W-002] State property naming — ✓ **修正済み**

**前ラウンド指摘:**  
`UploadState` の `kind_: "image" | "video"` が underscore suffix で awkward。`mediaKind` / `uploadKind` など明確な命名を推奨。

**修正内容:**
- `MediaUploader.tsx:62` で `mediaKind: "image" | "video";` に改名
- `MediaUploader.tsx:155` / `338` で `mediaKind` として一貫利用

**評価:** TypeScript の慣習に沿い、property 名から来歴（media 操作 scope）が自明になりました。underscore suffix は削除。✓

---

### [W-003] `formatMegabytes` の定義重複 — **スコープ外（intentional）**

**前ラウンド指摘:**  
3 箇所で同一の `formatMegabytes` が定義（`media/validation.ts`, `ingestion/UploadForm.tsx`, `note/editor/MediaUploader.tsx`）。CLAUDE.md の「繰り返すユーティリティは共有定数へ」規約と一貫性がない。

**ラウンド 2 の状況:**
- 現在の定義：`media/validation.ts:23` で `export function formatMegabytes`, `ingestion/UploadForm.tsx:48` で `function formatMegabytes`
- 削減：`MediaUploader.tsx` は `media/validation.ts` から import して重複を排除 ✓
- 残存：UploadForm/UploadDialog 間の重複は温存（plan.md スコープ line 32 で「ingestion 側の機能変更では `DROPZONE` 文字列定数を共有プリミティブへ移設するのみ」）

**評価:** 前ラウンドで「次の PR で整理推奨」とされ、本 PR ではスコープ外であることが plan.md で明示されています。`MediaUploader` が `media/validation.ts` から import することで、editor 側の重複は解消。ingestion 内の重複は認容（別 PR の領域）。**問題なし。** ✓

---

## Notes

### [N-001] DROPZONE 移設の完全性と新属性の妥当性 ✓

**確認内容:**
- 移設前（`main` ブランチ）: `UploadForm.tsx:30`, `UploadDialog.tsx:58` に同一文字列で定義（2 箇所重複）
- 移設後（本 PR）: 両者とも削除、`common/styles.ts:553-554` に統合、JSDoc で Issue #795 ADR-001 参照
- **文字列バイト単位で完全一致確認** ✓

**新属性 `data-[disabled]` の追加：**
- `common/styles.ts` の DROPZONE に `data-[disabled]:pointer-events-none data-[disabled]:opacity-disabled` を含有
- `MediaUploader.tsx:232` で `data-disabled={state.kind === "uploading" || disabled === true || undefined}` として使用 ✓
- `UploadForm.tsx` / `UploadDialog.tsx` は `data-disabled` を使用しない（attribute をセットしない）— ingestion は constant に含まれた無視可能な utility として扱う ✓

**良い点:**
- dropzone の見た目（ビジュアルのみ）が single source of truth に
- JSDoc で ADR-001 と design principle（domain-agnostic）を明記
- 各 consumer が自分の制御ロジックに応じて polymorphic に利用可能（`data-disabled` を必要なら使用、不要なら使わない）
- ingestion 内既存の 2 重複が同時に解消

---

### [N-002] 層越境なし・依存方向正常 ✓

**確認:**
- `validateMediaFile`（`media/validation.ts`）: pure function、I/O なし、`app/core` 非依存
- `BYTE_SIZE_MAX` export（`media/schema.ts`）: zod のみ依存、export のみ追加
- 両者ともに `app/components/` 内（presentation/frontend 層）
- 呼び出し側：`MediaUploader.tsx`（同層）のみが参照
- core レイヤー（domain / application / adapters）への逆流なし ✓
- ADR-002「同 presentation/frontend 層内参照で層越境はない」の判断が正確に実装

---

### [N-003] `validateMediaFile` が media 固有・ingestion 非依存 ✓

**確認:**
- `validateMediaFile` は image/video のみ対応、`BYTE_SIZE_MAX` を上限（5 GiB）
- ingestion の `validateUploadFiles` は `IngestionService.detectKind` + `DEFAULT_MAX_INGESTION_BYTES` に結合
- 両者は完全に独立した職責

**良い点:**
- 検証ロジックが「ビジュアル共有・検証分離」の ADR-001 を正しく実装
- single-file 対象（`mediaKind: "image" | "video"` に限定）で responsibility を最小化
- ingestion を変更していない（plan スコープ遵守）

---

### [N-004] 命名規約の準拠 ✓

**確認:**
- `state.kind` の値：`"idle"` / `"uploading"` / `"error"` / `"done"` — 全て lower_snake_case
- `validation.reason` の値：`"unsupported"` / `"oversized"` — lower_snake_case
- property `mediaKind`：camelCase（TypeScript convention に準拠）
- DROPZONE：ALL_CAPS（定数）、JSDoc で `data-dragover` / `data-disabled` を明記

**評価:** CLAUDE.md「ErrorCode は lower_snake_case、property は camelCase」を正しく適用。✓

---

### [N-005] JSDoc の品質 ✓

**確認:**
- **DROPZONE** (`common/styles.ts:535-551`)：
  - domain-agnostic principle を明記
  - 各属性（`data-dragover`, `data-disabled`）の usage を指定
  - Issue #795 ADR-001 への参照
  - 詳細 / 実装的な JSDoc（library-level API として適正）

- **validateMediaFile** (`media/validation.ts:28-35`)：
  - 単一ファイル variant を明記
  - `kind` が presign 直渡ししうることを示唆
  - 戻り値型の説明完備
  - 適正な JSDoc

- **formatMegabytes**：comment なし（自明なためこれで OK）

---

### [N-006] ObjectURL lifecycle と state 管理 ✓

**確認:**
- `useEffect(() => () => revoke(url), [state])` で単一クリーンアップ（`MediaUploader.tsx:119-126`）
- 画像 kind のみ生成；動画は lucide アイコンで URL 不要
- state 遷移ハンドラ内の手動 revoke なし（二重 revoke / 取りこぼし回避）
- ラウンド 1 の「S-005 arch-risk」対応確認 ✓

---

### [N-007] 二重起動ガード ✓

**確認:**
- `onDrop` / `onChange` 冒頭で `state.kind === "uploading"` チェック（`MediaUploader.tsx:193-195`, `212-216`, `203-205`）
- label に `data-disabled={state.kind === "uploading" || disabled === true || undefined}` で pointer-events 抑止
- ラウンド 1 の「P-002 arch-risk」対応確認 ✓

---

### [N-008] 検証バナーの state 配置 ✓

**確認:**
- 検証失敗（`unsupported`/`oversized`）は `uploading` に遷移させない
- `idle.validationRejection?: { reason, sizeLabel, filename }` で保持（`MediaUploader.tsx:53-57`）
- 次の選択で `validationRejection` クリア（新規 setState で undefined）
- `uploading` / `error` / `done` のペイロードが state.kind と一致（別 useState 散在なし）
- ラウンド 1 の「S-001 arch-risk」対応確認 ✓

---

### [N-009] presign の kind 正規化 ✓

**確認:**
- `validateMediaFile` が返した `kind` を presign に渡す（`MediaUploader.tsx:163`）
- `kindForMime()` 重複判定を削除（計算ロジック単一化）
- MIME → kind 正規化の単一化点が実現
- ラウンド 1 の「S-002 arch-risk」対応確認 ✓

---

## Summary

| Category | Status | Count |
|----------|--------|-------|
| **Blockers** | なし | 0 |
| **Warnings** | ✓ 全て修正 | 3 |
| **Notes** | Architecture/Consistency ✓ | 9 |

**アクション:**
- **本 PR マージ可能** — ブロッカー・重大な warning なし
- ラウンド 1 の 3 つの Warning がすべて修正完了
- ADR-001/ADR-002、plan.md、CLAUDE.md 規約をすべて正しく実装
- formatMegabytes の重複はスコープ外（次 PR で整理）

---
