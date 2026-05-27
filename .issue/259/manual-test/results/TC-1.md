# TC-1: editing モーダルのフィールド順序

**判定**: PASS
**実施日**: 2026-05-28
**実施者**: agent-browser 自動検証

## 目的
editing モーダルのフィールド並びが `タイトル → 本文プレビュー → ディレクトリ → タグ → FrontMatter（折りたたみ）` になっていることを確認する。

## 手順と結果

| # | 操作 | 期待 | 実際 |
|---|---|---|---|
| 1 | ログイン後ヘッダー「アップロード」をクリック | アップロードモーダルが開く | OK（dialog "アップロード" が表示） |
| 2 | `/tmp/sample-259.md` をアップロード | LLM 推論完了後 editing view に遷移 | OK（数十秒で editing view 表示） |
| 3 | フィールド順を目視 | 上から `タイトル → 本文プレビュー → ディレクトリ → タグ → FrontMatter` | OK |

## 取得した DOM 順序（accessibility snapshot より）

```
1. LabelText "タイトル" + textbox [ref=e29]: sample-259
2. StaticText "本文プレビュー（読み取り専用）" + prose 表示
3. group "ディレクトリ" with combobox + textbox（新規ディレクトリ）
4. LabelText "タグ（カンマ区切り）" + textbox [ref=e30]
5. group + DisclosureTriangle "FrontMatter（JSON）" [expanded=false]
```

本文プレビューがディレクトリ／タグ／FrontMatter よりも上に来ていることを確認。

## スクリーンショット
- `screenshots/tc-1/01-editing-modal-initial.png`
