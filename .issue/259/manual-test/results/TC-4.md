# TC-4: 編集による AI 提案キャプションの消去 / 復活

**判定**: PASS
**実施日**: 2026-05-28
**実施者**: agent-browser 自動検証

## 目的
フィールドを編集すると当該フィールドのキャプションが消え、元の LLM 提案値に戻すと復活することを確認する。フィールド間が独立に動くことも確認。

## 手順と結果

### Step 1: タイトル編集 → キャプション消失

| # | 操作 | 期待 | 実際 |
|---|---|---|---|
| 1 | タイトル `sample-259` → `sample-259-edited` に変更 | タイトル横の "✨ AI 提案" が消える、他は残る | OK |

snapshot 抜粋:
```
LabelText
  StaticText "タイトル"                  ← "✨ AI 提案" が消えた
textbox "タイトル" [ref=e29]: sample-259-edited
StaticText "本文プレビュー（読み取り専用）"
StaticText "✨ AI 提案"                  ← 残っている
...
group "ディレクトリ ✨ AI 提案"          ← 残っている
...
textbox "タグ（カンマ区切り） ✨ AI 提案" ← 残っている
DisclosureTriangle "FrontMatter（JSON） ✨ AI 提案"  ← 残っている
```

### Step 2: タイトルを元の値 `sample-259` に戻す → キャプション復活

| # | 操作 | 期待 | 実際 |
|---|---|---|---|
| 2 | タイトルを `sample-259` に戻す | "✨ AI 提案" が復活 | OK（`textbox "タイトル ✨ AI 提案"`） |

### Step 3: タグだけ編集 → タグだけキャプション消失（独立動作）

| # | 操作 | 期待 | 実際 |
|---|---|---|---|
| 3 | タグを `test, issue259, modified` に変更 | タグだけ消え、タイトル・ディレクトリ・FrontMatter は残る | OK |

snapshot 抜粋:
```
タイトル: "✨ AI 提案" あり
ディレクトリ: group "ディレクトリ ✨ AI 提案" あり
タグ: "タグ（カンマ区切り）" のみ（"✨ AI 提案" 消えた）
FrontMatter: "✨ AI 提案" あり
```

## スクリーンショット
- `screenshots/tc-4/01-title-edited.png`
- `screenshots/tc-4/02-title-restored.png`
- `screenshots/tc-4/03-tags-edited-only.png`
