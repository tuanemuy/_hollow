# IMPACT-007 非表示モード用途の .segmented モック（P15/P16/P18 等）が未変更であること

結果: PASS

## 確認内容

| 確認 | 結果 |
| --- | --- |
| `git status --short -- spec/`（#649 の作業ツリー差分） | `spec/design/pages/P30-user-public-top.html` と `spec/design/pages/mobile/P30-user-public-top.html` のみ変更 |
| `P15-export.html` / `P16-export-jobs.html` / `P18-tags.html`（desktop / mobile） | 差分なし（未変更） |
| P30 の差分内容 | #649 スコープの表示モード segmented 追従（#626 ADR-001）。コメントで「非表示モード用途の .segmented（P15/P16/P18 等）は対象外」と明記されており意図どおり |

備考: #649 の実装はコミット前の作業ツリー上にあるため、`git status` / `git diff`（unstaged）で確認した。対象外ファイルへの差分はない。
