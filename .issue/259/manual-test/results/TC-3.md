# TC-3: AI 提案キャプションの初期表示

**判定**: PASS
**実施日**: 2026-05-28
**実施者**: agent-browser 自動検証

## 目的
タイトル / ディレクトリ / タグ / FrontMatter の 4 フィールドに「✨ AI 提案」キャプションが初期表示されることを確認する。

## 手順と結果

LLM 推論完了直後の editing view 初期状態を accessibility snapshot で取得し、4 フィールド各ラベル付近に "✨ AI 提案" StaticText が存在することを確認した。

| フィールド | キャプション存在 |
|---|---|
| タイトル | OK（`textbox "タイトル ✨ AI 提案"`） |
| ディレクトリ | OK（`group "ディレクトリ ✨ AI 提案"` / Legend に "✨ AI 提案"） |
| タグ（カンマ区切り） | OK（`textbox "タグ（カンマ区切り） ✨ AI 提案"`） |
| FrontMatter（JSON） | OK（`DisclosureTriangle "FrontMatter（JSON） ✨ AI 提案"`） |

本文プレビュー横にも "✨ AI 提案" が出ているが、これは設計（H-2）外。プレビューに対する補助表示であり期待挙動。

## スクリーンショット
- `screenshots/tc-1/01-editing-modal-initial.png`（TC-1 と共通）
