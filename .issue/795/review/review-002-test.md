# PR #797 テストレビュー — Issue #795: refactor(note): polish the editor's media-upload UI

**レビュー対象:** PR #797  
**ブランチ:** issue/795/polish-editor-media-upload → main  
**レビュー観点:** Test  
**レビューラウンド:** 2（ブロッカー解決確認 + フレッシュなゼロベースレビュー）  

---

## レビュー概要

**前ラウンド Blocker 解決: 3/3 ✓**
- [B-001] validateMediaFile unsupported sizeLabel テスト → ✓ 実装済み
- [B-002] MediaUploader コンポーネントテスト → ✓ 新規作成済み
- [B-003] putWithProgress XHR モック戦略 → ✓ 実装済み

**新規発見 Blocker: 2**  
**Warnings: 4**  
**Notes: 3**

---

## Blockers

### [B-004] Promise.resolve() 連打による非同期フロー検証の脆さ

**説明:**  
MediaUploader.test.tsx の成功フローテストで、`await Promise.resolve()` を複数回実行してマイクロタスク全体の完了を待っている。これは実装の非同期タイミングに強く依存し、実装が変わると失敗する脆いテスト。

**場所:**  
`app/components/note/editor/__tests__/MediaUploader.test.tsx:269-271` (presign 検証)  
`app/components/note/editor/__tests__/MediaUploader.test.tsx:310-313` (finalize 検証)  
`app/components/note/editor/__tests__/MediaUploader.test.tsx:350-354` (onInsert 検証)

**理由:**  
テストが以下のタイミング順序に依存：
1. renderUploadFile → state.kind = "uploading" に遷移（microtask）
2. presignMediaUpload 呼び出し（Promise）
3. XHR mock の send が queueMicrotask（L222）でオブジェクト.onload を発火
4. putWithProgress が完了（Promise）
5. finalizeMediaUpload 呼び出し（Promise）
6. 結果で setState（microtask）

テスト内で `Promise.resolve()` の呼び出し回数を固定（3 回）しているため、実装内の非同期ジャンプが増減すると失敗する。さらに、テストで非同期フロー全体を待つ確実な方法がないため、hidden race condition の可能性がある。

**現在のコード:**
```typescript
await uploadFile(imageFile);
await act(async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();  // ← magic number, 実装に依存
});
```

**提案:**  
`vi.waitFor` を使用するか、モック側で Promise チェーンを同期的に制御する：

```typescript
// 選択肢 1: vi.waitFor で状態確定を待つ
await uploadFile(imageFile);
await vi.waitFor(() => {
  expect(presignMediaMock).toHaveBeenCalled();
});
await vi.waitFor(() => {
  expect(finalizeMediaMock).toHaveBeenCalled();
});

// 選択肢 2: モック側でタイミング制御
presignMediaMock.mockImplementation(async (arg) => {
  // 同期処理後に Promise resolve
  const result = { mediaId: "m1", uploadUrl: "...", ... };
  return Promise.resolve(result);
});
```

---

### [B-005] エラーハンドリングフロー（presign/finalize 失敗、XHR エラー、onRetry）が完全に欠落

**説明:**  
実装で以下のエラーシナリオが存在するにもかかわらず、テストでカバーされていない：
1. presignMediaUpload が例外を throw
2. putWithProgress が XHR エラー（network, abort, timeout）で reject
3. finalizeMediaUpload が例外を throw
4. error 状態からの onRetry による再試行フロー

**場所:**  
`app/components/note/editor/MediaUploader.tsx:160-189` (try-catch)  
`app/components/note/editor/__tests__/MediaUploader.test.tsx` (テスト側：欠落)

**理由:**  
実装は try-catch で error 状態を処理：
```typescript
} catch (e) {
  setState({
    kind: "error",
    error: extractSerializedError(e),
    lastFile: file,
    lastKind: validation.kind,
  });
}
```
また、onRetry コールバック（L219-222）で error → uploading への遷移をサポート。しかし以下のテストがない：
- presignMediaUpload が失敗する場合の error 状態検証
- XHR が network error / abort / timeout で失敗する場合
- finalize が失敗する場合
- error 状態から onRetry で再試行する場合

これはハッピーパスとバリデーション失敗のみをカバーする不完全なテスト。

**提案:**  
新規テストスイート `describe("error handling", ...)` を追加：

```typescript
describe("error handling", () => {
  it("displays error banner when presignMediaUpload fails", async () => {
    presignMediaMock.mockRejectedValueOnce(new Error("Network error"));
    const onInsert = vi.fn();
    await act(async () => {
      root.render(
        <MediaUploader contentHtml="<p>x</p>" onInsert={onInsert} />,
      );
    });
    const file = new File(["data"], "test.jpg", { type: "image/jpeg" });
    await uploadFile(file);
    await vi.waitFor(() => {
      expect(container.querySelector('[role="alert"]')).not.toBeNull();
    });
  });

  it("retries upload after error", async () => {
    presignMediaMock
      .mockRejectedValueOnce(new Error("First failure"))
      .mockResolvedValueOnce({
        mediaId: "m1",
        uploadUrl: "https://example.com/put",
      });
    finalizeMediaMock.mockResolvedValueOnce({
      mediaId: "m1",
      url: "/media/m1",
    });
    // ... XHR mock
    
    const onInsert = vi.fn();
    await act(async () => {
      root.render(
        <MediaUploader contentHtml="<p>x</p>" onInsert={onInsert} />,
      );
    });
    const file = new File(["data"], "test.jpg", { type: "image/jpeg" });
    await uploadFile(file);
    
    // First attempt fails
    await vi.waitFor(() => {
      const alert = container.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain("エラーが発生しました");
    });
    
    // Retry button click
    const retryBtn = container.querySelector(
      '[role="alert"] button:has-text("再試行")',
    );
    await act(async () => {
      retryBtn?.click();
    });
    
    // Second attempt succeeds
    await vi.waitFor(() => {
      expect(onInsert).toHaveBeenCalled();
    });
  });
});
```

---

## Warnings

### [W-006] 複数回アップロードフロー（done → idle → uploading）のテストが欠落

**説明:**  
実装では done 状態で dropzone が常に表示され、done 状態から新規ファイル選択で新たに uploading に遷移する。この複数回アップロードシナリオがテストされていない。

**場所:**  
`app/components/note/editor/MediaUploader.tsx:224-226` (コメント: 複数回アップロード対応)  
`app/components/note/editor/__tests__/MediaUploader.test.tsx` (テスト側：欠落)

**理由:**  
AC-4「成功フィードバック + 複数回アップロード対応」の振る舞いが不完全にテストされている。成功バナー表示までは検証（L365-400）されているが、その後 dropzone が表示され、再度ファイル選択で新たなアップロード開始までの流れが確認されていない。

**提案:**  
```typescript
it("supports multiple uploads: success → dropzone still visible → new file", async () => {
  presignMediaMock.mockResolvedValue({
    mediaId: "m1",
    uploadUrl: "https://example.com/put",
  });
  finalizeMediaMock.mockResolvedValue({
    mediaId: "m1",
    url: "/media/m1",
  });
  // ... XHR mock

  const onInsert = vi.fn();
  await act(async () => {
    root.render(
      <MediaUploader contentHtml="<p>x</p>" onInsert={onInsert} />,
    );
  });

  // First upload
  const file1 = new File(["data1"], "image1.jpg", { type: "image/jpeg" });
  await uploadFile(file1);
  await vi.waitFor(() => {
    expect(findStatusBanner()).not.toBeNull();
  });

  // Dropzone still visible after done
  expect(findDropzone()).not.toBeNull();

  // Second upload
  presignMediaMock.mockClear();
  finalizeMediaMock.mockClear();
  const file2 = new File(["data2"], "image2.jpg", { type: "image/jpeg" });
  await uploadFile(file2);
  await vi.waitFor(() => {
    expect(presignMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ byteSize: 5 }), // data2 size
      }),
    );
  });
});
```

---

### [W-007] 進捗表示（progress bar）と画像サムネイルの描画テストが欠落

**説明:**  
uploading 状態で progress と thumbnail が表示されることが実装に記述されているが、テストで視覚的に確認されていない。

**場所:**  
`app/components/note/editor/MediaUploader.tsx:335-374` (uploading UI)  
`app/components/note/editor/__tests__/MediaUploader.test.tsx` (テスト側：欠落)

**理由:**  
実装で以下が rendering されているが、テストでは presign/finalize mock を確認しているだけで、UI 側での progress 表示確認がない：
```typescript
<ProgressBar
  {...(state.progress !== null ? { value: state.progress } : {})}
  decorative
  ariaLabel="アップロード進捗"
/>
```
また、image/video によって表示が異なる（L338-348）も確認されていない。

**提案:**  
```typescript
it("displays progress bar during uploading for images", async () => {
  presignMediaMock.mockResolvedValueOnce({
    mediaId: "m1",
    uploadUrl: "https://example.com/put",
  });

  let triggerProgress: ((percent: number) => void) | null = null;
  
  // Mock XHR to capture progress callback
  const originalXHRClass = globalThis.XMLHttpRequest;
  class MockXHRWithProgressCapture {
    // ... standard mock properties ...
    send() {
      queueMicrotask(() => {
        // Capture progress callback for manual trigger
        if (this.upload?.onprogress) {
          triggerProgress = (percent: number) => {
            this.upload.onprogress(
              new ProgressEvent("progress", {
                lengthComputable: true,
                loaded: percent * 1024, // simulate bytes
                total: 1024,
              }),
            );
          };
        }
      });
    }
  }
  vi.stubGlobal("XMLHttpRequest", MockXHRWithProgressCapture as any);

  const onInsert = vi.fn();
  await act(async () => {
    root.render(
      <MediaUploader contentHtml="<p>x</p>" onInsert={onInsert} />,
    );
  });

  const imageFile = new File(["img"], "pic.jpg", { type: "image/jpeg" });
  await uploadFile(imageFile);

  // Progress should be displayed
  await vi.waitFor(() => {
    const progress = container.querySelector('[aria-label="アップロード進捗"]');
    expect(progress).not.toBeNull();
  });

  // Simulate progress update
  if (triggerProgress) {
    await act(async () => {
      triggerProgress?.(50);
    });
    expect(container.textContent).toContain("50%");
  }
});
```

---

### [W-008] 無効な MIME type（空、text/plain など）での検証バナーバリエーションが不完全

**説明:**  
validateMediaFile テストで empty MIME type（L37-41）と audio MIME（L31-35）はカバーされているが、MediaUploader コンポーネントテストでは unsupported（PDF）のみ検証、oversized（L169-191）も検証。ただし、より多くの unsupported バリエーション（text/plain, application/json など）がテストされていない。

**場所:**  
`app/components/note/editor/__tests__/MediaUploader.test.tsx:100-192` (validation rejection テスト)

**理由:**  
validateMediaFile のテストは thorough だが、コンポーネント層での「複数の unsupported type で同じバナーが表示される」という振る舞い確認がない。PDF のみテストは表現力不足。

**提案:**  
```typescript
describe("validation rejection banner (various unsupported types)", () => {
  const unsupportedFiles = [
    { name: "doc.pdf", type: "application/pdf" },
    { name: "script.js", type: "text/javascript" },
    { name: "data.json", type: "application/json" },
    { name: "audio.mp3", type: "audio/mpeg" },
  ];

  unsupportedFiles.forEach(({ name, type }) => {
    it(`rejects ${type} and displays error banner`, async () => {
      await act(async () => {
        root.render(
          <MediaUploader
            contentHtml="<p>x</p>"
            onInsert={vi.fn()}
            disabled={false}
          />,
        );
      });
      const file = new File(["data"], name, { type });
      await uploadFile(file);
      const alert = findAlertBanner();
      expect(alert).not.toBeNull();
      expect(alert?.textContent).toContain("対応していない形式です");
      expect(alert?.textContent).toContain(name);
    });
  });
});
```

---

### [W-009] formatMegabytes 重複（ingestion UploadForm.tsx）の解決なし

**説明:**  
[W-004] から継続。MediaUploader.tsx は media/validation.ts の formatMegabytes を import して使用（正しい）。しかし、ingestion/UploadForm.tsx にはローカル定義（L48）が残ったまま。

**場所:**  
`app/components/ingestion/UploadForm.tsx:48-50`（ローカル定義）

**理由:**  
本 PR は issue #795（editor の media upload UI）なので、ingestion の既存重複を直す範囲外。ただし、formatter が 2 箇所（validation.ts の export + UploadForm.tsx のローカル）にまたがって管理コスト が上昇。

**評価:**  
許容範囲。マージ後に別途改善として整理する推奨。

---

## Notes

### [N-003] validateMediaFile テストの実装品質が高い

**説明:**  
validation.test.ts の実装は以下の点で thorough：
- 境界値テスト（BYTE_SIZE_MAX ちょうど、+1）
- unsupported sizeLabel undefined の明示的確認（L43-50）
- empty MIME type（L37-41）
- 0-byte ファイル許容（L97-102）
- 優先順位検証（format → size）（L104-113）
- 複数 MIME type の kind 導出確認（L117-133）

**評価:**  
良い。前ラウンド指摘が反映されており、ドメイン層ロジックテストとして十分。

---

### [N-004] XHR モック戦略の実装（MockXHR クラス）が適切

**説明:**  
MediaUploader.test.tsx の beforeEach で MockXHR クラスを定義（L200-228）し、以下を実装：
- status, upload.onprogress, onload, onerror, onabort, ontimeout
- queueMicrotask で onload を非同期発火
- requestUrl, requestHeaders, requestBody の記録

**評価:**  
合理的。happy-dom 環境で XHR をシミュレートする適切な方法。ただし、Promise.resolve() 連打（[B-004]）との組み合わせで脆さがある。

---

### [N-005] disabled state テストが存在し、データ属性経由での状態制御が確認

**説明:**  
L443-475 で disabled=true の場合の dropzone と input の挙動が検証：
- input.disabled === true
- dropzone の data-disabled 属性設定

**評価:**  
良い。a11y の視点から disabled 状態の適切な伝播が確認されている。

---

## サマリー

### ブロッカー解決の状況

| ブロッカー | 前ラウンド | 現ラウンド | 状態 |
|-----------|----------|----------|------|
| [B-001] unsupported sizeLabel | 指摘 | ✓ 実装済み | 解決 |
| [B-002] MediaUploader コンポーネントテスト | 指摘 | ✓ 新規作成 | 解決 |
| [B-003] XHR モック戦略 | 指摘 | ✓ 実装済み | 解決 |
| [B-004] Promise.resolve() 連打（脆さ） | 新規発見 | — | 新規 Blocker |
| [B-005] エラーハンドリングテスト | 新規発見 | — | 新規 Blocker |

### 新規発見の重要度

**[B-004] [B-005] は品質リスク**
- [B-004]：実装変更時のテスト脆弱性 → 将来の変更で失敗する可能性
- [B-005]：エラー経路が untested → production での edge case に対応できない

ただし、PR 単位のブロッカーとするか、マージ後改善に回すかは判断次第。

---

## 推奨アクション

### マージ前必須
1. [B-004] を解決: `vi.waitFor` または同期的なモック制御で Promise.resolve() 連打を排除
2. [B-005] を解決: presign/finalize 失敗、XHR エラー、onRetry のテストを追加

### マージ前推奨（スコープ内）
3. [W-006] [W-007] を追加: 複数回アップロード、progress/thumbnail 表示

### マージ後改善（スコープ外）
4. [W-009] を改善: ingestion UploadForm の formatMegabytes をリモート化

---

## 総合評価

**前ラウンド Blocker 3 件は完全に解決** — validateMediaFile テスト、MediaUploader コンポーネントテスト、XHR モック戦略が実装済み。

**新規発見 Blocker 2 件に対応が必須** — Promise.resolve() の脆さとエラーハンドリング untested が品質リスク。実装は正しく、テストの堅牢性・網羅性の向上が要。

