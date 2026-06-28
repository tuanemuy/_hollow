# PR #797 テストレビュー — Issue #795: refactor(note): polish the editor's media-upload UI

**レビュー対象:** PR #797  
**ブランチ:** issue/795/polish-editor-media-upload → main  
**レビュー観点:** Test  
**実装計画:** `.issue/795/plan.md` のテスト方針に基づく  

---

## レビュー概要

**Blockers: 3 / Warnings: 5 / Notes: 2**

---

## Blockers

### [B-001] validateMediaFile の戻り値型安全性が不完全

**説明:**  
unsupported 理由の場合に `sizeLabel` が undefined であることを明示的にテストしていない。戻り値型は `{ ok: false, reason: "unsupported" | "oversized"; sizeLabel?: string }` と定義されているが、実装で `sizeLabel` は oversized の場合のみ付与される。テストが unsupported ケースで `sizeLabel` の有無を検証しないと、戻り値の型制約が緩んだまま。

**場所:**  
`app/components/media/__tests__/validation.test.ts:19-23`

**理由:**  
unsupported と oversized で異なる戻り値構造（sizeLabel の有無）。実装では unsupported に sizeLabel が付与されないため、テストで明示的に確認することで型安全性を担保する。現在のテストは `{ ok: false, reason: "unsupported" }` を全マッチで検証しているが、`sizeLabel` が存在しないことを明示的にアサートしていない。

**提案:**  
unsupported テストケースに以下を追加：
```typescript
it("rejects unsupported MIME types without sizeLabel", () => {
  const file = new File([], "test.pdf", { type: "application/pdf" });
  const result = validateMediaFile(file);
  expect(result).toEqual({ ok: false, reason: "unsupported" });
  expect((result as any).sizeLabel).toBeUndefined();
  // または TypeScript の narrowing を活用して:
  if (result.ok === false && result.reason === "unsupported") {
    expect("sizeLabel" in result).toBe(false); // narrowed type では sizeLabel がないことを検証
  }
});
```

---

### [B-002] MediaUploader コンポーネントテストが完全に欠けている

**説明:**  
実装に複雑な状態遷移（idle → uploading → done/error）、XMLHttpRequest ハンドリング、ObjectURL 生成・破棄、二重起動ガード、検証バナー表示、presign/put/finalize の非同期フロー、onInsert 発火があるが、コンポーネント層テストが存在しない。

**場所:**  
`app/components/note/editor/MediaUploader.tsx` — テストファイル不在

**理由:**  
Plan のテスト方針（L173-178）で明示的に「コンポーネント（happy-dom）」テストを要求している：

> **コンポーネント（happy-dom）:** `MediaUploader` — ドロップ/選択で検証バナー表示、検証通過で presign→put→finalize モックが順に呼ばれ `onInsert` が発火、失敗で `RetryableError` + 再試行、成功で success 状態。

実装の状態遷移が複雑（idle で validationRejection state を持つ、uploading で progress/thumbnailUrl を管理、error/done 状態切り替え）なのに対し、コンポーネントテストで振る舞いが検証されていない。Plan では「PUT 経路の実ネットワーク到達が困難な場合は put フェーズは手動/ブラウザ検証に委ねる線引きでもよい」としているが、**最低限 validationRejection（検証バナー表示）と onInsert 発火（成功時）の 2 つのカバレッジは必須。**

**提案:**  
`app/components/note/editor/__tests__/MediaUploader.test.tsx` を新規作成。最低限以下のテストケースを追加：

1. **検証バナー表示**
   - unsupported MIME 選択時、error banner が表示される
   - oversized ファイル選択時、warning banner が表示される
   - バナーがクリアされることなく dropzone が再利用可能であることを確認

2. **成功時 onInsert 発火**
   - valid image/video ファイルを選択→presignMediaUploadFn のモック呼び出し→putWithProgress モック（XHR のモック）→finalizeMediaUploadFn のモック呼び出し→onInsert が正しい nextHtml と insertion 引数で呼ばれる

3. **error 状態と再試行**
   - presign/put/finalize で error が throw された場合、RetryableError が表示され、再試行で再度アップロードが開始される

実装が `serverFnMock` (ingestion の UploadForm.test.tsx と同パターン) と happy-dom で可能であることは、UploadForm.test.tsx が示している。

---

### [B-003] 実装で `putWithProgress` の XHR モック戦略が未定義

**説明:**  
`MediaUploader.tsx` の `putWithProgress` 関数は `new XMLHttpRequest()` を直接生成し、upload.onprogress / onload / onerror を直接利用している。happy-dom でのコンポーネントテストを行う場合、global.XMLHttpRequest のモックが必須だが、テストコードに実装されていない。

**場所:**  
`app/components/note/editor/MediaUploader.tsx:74-101` (putWithProgress 実装)  
テストファイル不在のため検証不可

**理由:**  
happy-dom では XHR がネイティブに実装されないため、vi.mock or global stub が必要。Plan のテスト方針で「`putWithProgress` はモジュール内で `new XMLHttpRequest()` を直接生成する private 関数のため `global.XMLHttpRequest` のフェイク（`onload`/`onprogress`/`onerror` を手動発火）が要る」と記載されているが、実装テストでそれがカバーされていない。

**提案:**  
B-002 の MediaUploader.test.tsx を作成する際、以下のモック戦略を含める：
```typescript
// happy-dom では XMLHttpRequest が undefined のため、global にスタブ
globalThis.XMLHttpRequest = vi.fn(() => ({
  open: vi.fn(),
  setRequestHeader: vi.fn(),
  upload: {
    onprogress: null as any,
  },
  onload: null as any,
  onerror: null as any,
  onabort: null as any,
  ontimeout: null as any,
  send: vi.fn(function() {
    // テスト内で手動で this.onload() / this.onerror() を発火
  }),
  status: 200,
})) as any;

// URL.createObjectURL / revokeObjectURL のスタブ
global.URL.createObjectURL = vi.fn(() => "blob:test-url");
global.URL.revokeObjectURL = vi.fn();
```

---

## Warnings

### [W-001] validateMediaFile テストで empty MIME type ケースが欠落

**説明:**  
File API では、ユーザーがファイル選択ダイアログで MIME type を明示しない場合、`file.type` が空文字列になることがある。実装は `!file.type.startsWith("image/") && !file.type.startsWith("video/")` で unsupported として扱うが、テストが不足。

**場所:**  
`app/components/media/__tests__/validation.test.ts:6-36` (format validation セクション)

**理由:**  
ingestion の validateUploadFiles はファイル拡張子フォールバック (L108-114 in UploadForm.test.tsx) を持つが、media はシンプルに MIME type チェックのみ。実装の意図は確認済みだが、テストで明示的に empty type が unsupported として扱われることを記録すると保守性が上がる。

**提案:**  
```typescript
it("rejects empty MIME type", () => {
  const file = new File([], "test.jpg", { type: "" });
  const result = validateMediaFile(file);
  expect(result).toEqual({ ok: false, reason: "unsupported" });
});
```

---

### [W-002] validateMediaFile テストで 0 bytes ファイルの許容を明示していない

**説明:**  
size validation は BYTE_SIZE_MAX 超過のみ検査し、下限を設けていない。ただし 0 bytes ファイルがアップロードされるシナリオは low-likelihood だが、テストで意図を明示すると保守性が上がる。

**場所:**  
`app/components/media/__tests__/validation.test.ts:38-80` (size validation セクション)

**理由:**  
実装は `if (file.size > BYTE_SIZE_MAX)` のみなので 0 bytes は受理される。CLAUDE.md の「Make illegal states unrepresentable」に従い、テストで「0 bytes は受理される」という意図を明示することは保守性を高める。

**提案:**  
```typescript
it("accepts 0-byte files", () => {
  const file = new File([], "empty.jpg", { type: "image/jpeg" });
  Object.defineProperty(file, "size", { value: 0 });
  const result = validateMediaFile(file);
  expect(result).toEqual({ ok: true, kind: "image" });
});
```

---

### [W-003] validateMediaFile テストで unsupported と oversized の優先順位が検証されていない

**説明:**  
実装は format check を先に行い、その後 size check を行う。両方失敗するファイル（例：application/pdf かつ 10 GB）の場合、unsupported が返される。テストで両方失敗するケースを明示的に確認することで、チェック順序の意図を記録できる。

**場所:**  
`app/components/media/__tests__/validation.test.ts` 全体

**理由:**  
優先順位が implicit のまま。テストで明示することで、仕様意図が不明確になるのを防ぐ。

**提案:**  
```typescript
it("returns unsupported when both format and size are invalid", () => {
  const file = new File([], "test.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "size", { value: 10 * 1024 * 1024 * 1024 }); // 10 GB
  const result = validateMediaFile(file);
  // format check が先に行われるため unsupported が返される
  expect(result).toEqual({ ok: false, reason: "unsupported" });
});
```

---

### [W-004] formatMegabytes が 3 箇所に重複定義されている

**説明:**  
validation.ts、MediaUploader.tsx、UploadForm.tsx (ingestion) に同一の `formatMegabytes` 関数が定義されている。DRY 原則に違反。

**場所:**  
- `app/components/media/validation.ts:23-25`
- `app/components/note/editor/MediaUploader.tsx:103-105`
- `app/components/ingestion/UploadForm.tsx` (既存)

**理由:**  
重複した関数は保守性を低下させ、フォーマット変更時に複数箇所を修正する必要がある。validation.ts で定義して export し、MediaUploader.tsx で import するのが正しい。UploadForm.tsx はこの PR で変更されないため、別途整理の対象にできるが、少なくとも MediaUploader.tsx は validation.ts の export を使うべき。

**提案:**  
validation.ts で formatMegabytes を export：
```typescript
export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

MediaUploader.tsx で import：
```typescript
import { validateMediaFile, formatMegabytes } from "@/components/media/validation";
```

その後 MediaUploader.tsx 内の formatMegabytes 関数定義を削除。

---

### [W-005] ingestion テスト（UploadForm.test.tsx / UploadDialog.test.tsx）の DROPZONE 移設による回帰確認が不明

**説明:**  
DROPZONE 定数が ingestion の UploadForm.tsx と UploadDialog.tsx から削除され、`common/styles.ts` から import するように変更された。UploadForm.test.tsx と UploadDialog.test.tsx は import 경로 변경に対応しているか不明。テストが緑のまま実行されているか確認が必要。

**場所:**  
PR の diff で ingestion テストファイルが変更されていないようだが、import 경로 변更が自動では反映されない可能性がある

**理由:**  
DROPZONE 정의 제거 / import 추가는 ingestion 테스트 실행 시점에 モック/import path 변경을 요구한다. PR 단계에서 これが CI で確인されているはずだが、レビュー時点で明시적 확인이 필요.

**提案:**  
PR 前に以下を実行して确认：
```bash
pnpm test:unit -- app/components/ingestion/__tests__/UploadForm.test.tsx
pnpm test:unit -- app/components/ingestion/__tests__/UploadDialog.test.tsx
```

両方が緑であることを確認。

---

## Notes

### [N-001] validateMediaFile テストの良い点：境界値カバレッジが thorough

**説明:**  
BYTE_SIZE_MAX ちょうど（L47-52）と +1（L54-67）の両方がテストされている。実装で `>` 比較を使っているため、境界値テストが適切。

**評価:**  
良い。Test plan のテスト方針「境界値」要件を満たしている。

---

### [N-002] kind 導出テストで複数 MIME type を確認

**説明:**  
kind 導出テスト（L83-100）で、image/jpeg, image/png, image/webp、video/mp4, video/quicktime, video/webm など複数の MIME type を実装確認している。startsWith 判定の正確さが検証されている。

**評価:**  
良い。`file.type.startsWith("video/")` の判定ロジックが複数 prefix で確認されている。

---

## サマリー

**Blockers: 3 件**
- [B-001] unsupported ケースで sizeLabel undefined を明示的にテスト
- [B-002] MediaUploader コンポーネントテスト（happy-dom）が完全に欠落
- [B-003] putWithProgress の XHR モック戦略が未実装

**Warnings: 5 件**
- [W-001] empty MIME type ケースのテスト欠落
- [W-002] 0 bytes ファイルの許容を明示していない
- [W-003] unsupported vs oversized の優先順位テスト不足
- [W-004] formatMegabytes が 3 箇所に重複定義
- [W-005] ingestion テスト（DROPZONE 移設後）の回帰確認が不明

**Notes: 2 件**
- [N-001] validateMediaFile テストの境界値カバレッジが thorough
- [N-002] kind 導出テストで複数 MIME type を確認

---

## 推奨アクション

1. **マージ前必須**: [B-002] MediaUploader.test.tsx を新規作成し、最低限「検証バナー表示」と「成功時 onInsert 発火」をテスト
2. **マージ前推奨**: [B-001] [B-003] の修正を validateMediaFile テストと新規 MediaUploader テストに反映
3. **マージ前確認**: [W-005] ingestion テストが CI で緑であることを確認
4. **マージ後改善**: [W-001] [W-002] [W-003] [W-004] を整理
