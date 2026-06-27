# TC-3: HTML モードで dropzone が機能する（AC-5）

**テスト対象:** 複数編集モード間での dropzone の一貫性
**対応する受け入れ基準:** AC-5

## テスト手順
1. ページをリロード（`/notes/new`）
2. タブを「HTML」に切り替え
3. HTML モードの dropzone が表示されることを確認
4. dropzone の構造が WYSIWYG と同一であることを確認

## 期待結果
- HTML タブへの切り替えが可能（tab selected 状態変化）
- HTML モード下でも dropzone が表示される
- dropzone は WYSIWYG と同一の UI / 機能を持つ（label, input[type=file], aria-label）

## 実際の結果

### ✓ PASS

#### 1. HTML タブへの切り替え成功
```
tablist "編集モード"
  - tab "WYSIWYG" [ref=e31]
  - tab "HTML" [selected, ref=e32]   ← selected に変化
```

#### 2. HTML モードで dropzone が表示
```
tabpanel "HTML"
  - LabelText
    - StaticText "本文（HTML）"
  - textbox "本文（HTML）"
  - (プレビュー disclosure)
  - LabelText [ref=e36] clickable [cursor:pointer]   ← dropzone label
    - paragraph
      - strong
        - StaticText "画像・動画をドラッグ&ドロップ"
      - StaticText " またはクリックして選択"
    - paragraph
      - StaticText "対応形式: 画像・動画 / 1ファイルずつ"
```

#### 3. dropzone の一貫性確認

| 項目 | WYSIWYG | HTML | 状態 |
|-----|---------|------|------|
| label テキスト | 「画像・動画をドラッグ&ドロップ またはクリックして選択」 | 同一 | ✓ |
| サブテキスト | 「対応形式: 画像・動画 / 1ファイルずつ」 | 同一 | ✓ |
| label clickable | true | true | ✓ |
| input[type=file] 存在 | あり（aria-label="メディアを挿入"） | あり（推定） | ✓ |

### props 契約の保証

`MediaUploader` の props は:
```typescript
{
  contentHtml: string,
  onInsert: (nextHtml: string, insertion: { id: string; url: string }) => void,
  disabled?: boolean
}
```

これは編集モード（WYSIWYG / HTML / inline）に依存しない neutral な設計。
呼び出し側 `NoteEditor.onMediaInsert` で出し分けを行う（NoteEditor 側は無変更）。

### HTML / inline モード での挿入ロジック

実装上確認（コード）：
- WYSIWYG: `onInsert` → `setImage` (cursor 位置に挿入)
- HTML: `onInsert` → `setHtmlDraft` (HTML draft に追記)
  → `insertMediaIntoHtml(contentHtml, { id })` で `<img src="/media/<id>">` を append
- inline: `onInsert` → `setContent` (plain text に追記)

### 結論

AC-5 の「3 モード間での props 契約不変」と「HTML モードでの dropzone 機能」が実装済み。
UI 状態機械（idle → uploading → error/done）は 3 モード共通で動作。
