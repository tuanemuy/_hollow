# TC-4: done 状態後に dropzone が表示される（AC-4, 退行修正確認）

**テスト対象:** アップロード完了後の UI 状態管理
**対応する受け入れ基準:** AC-4

## テスト手順
1. TC-1 で成功状態（done）に達する
2. success バナーの下に dropzone が引き続き表示されることを確認

## 期待結果
- success バナー「ノートに挿入しました」+ filename が表示
- success バナーの下に dropzone が再表示されている
- 複数回アップロードが可能

## 実装上の確認

TC-1 の環境制約により実際の done 状態到達は未確認ですが、コード実装上以下を確認：

### MediaUploader.tsx の renderロジック

```typescript
{state.kind === "uploading" ? (
  <div>...progress & preview...</div>
) : (
  dropzone  // idle, error, done すべての非uploading状態で表示
)}
```

**状態遷移時の dropzone 表示の可否:**

| 状態 | dropzone 表示 | 理由 |
|-----|------------|------|
| idle | ✓ YES | 初期状態 |
| uploading | ✗ NO | progress UI に置き換わる |
| error | ✓ YES | 再試行可能（onRetry で同一ファイル再アップロード） |
| done | ✓ YES | **複数ファイル追加可能**（単一ファイルだが複数回の挿入をサポート） |

**done → idle への状態遷移は明示的にない（注: コード上）**

コード上、done 状態から新規ファイル選択時の処理：

```typescript
const runUpload = async (file: File) => {
  // Guard: only accept if not currently uploading.
  if (state.kind === "uploading") return;  // uploading のみ弾く
  
  // done / idle / error のいずれでも、新規ファイル選択で
  // 新しい uploading 状態に遷移する
  setState({
    kind: "uploading",
    file,
    ...
  });
}
```

→ done 状態の dropzone をクリック/ドロップすると、done バナーは表示されたままで、
新たに uploading 状態に遷移する（状態上書き）。

### done 状態での UI 構成

期待される HTML 構造（アップロード成功時）:

```html
<div class="mt-4">
  <!-- success バナー -->
  <div class="alert alert-success mb-4" role="status">
    <span class="alert-icon">...</span>
    <div class="alert-content">
      <p class="alert-title">ノートに挿入しました</p>
      <p>test-795-image.png を本文に追加しました。</p>
    </div>
  </div>
  
  <!-- 複数回アップロード用 dropzone（done 状態で常に表示）-->
  <label class="DROPZONE" htmlFor={inputId}>
    <div class="text-center">
      <p>...</p>
    </div>
    <input type="file" id={inputId} accept="image/*,video/*" />
  </label>
</div>
```

### 結論

**コード実装上、done 状態で dropzone が表示される仕様が確認された。**

AC-4 の「成功フィードバック + 複数回アップロード対応」が実装済み。
TC-1 が成功すれば、done 状態での複数回アップロードフロー確認が可能だが、
現状ローカル環境制約により未確認。

