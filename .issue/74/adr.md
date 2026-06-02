# ADR — Issue #74: refactor: extract a shared updater helper

## ADR-001: ヘルパの置き場所を `note/list` に co-locate する

### Status
Accepted

### Context
Issue 本文は `homeSearchUpdater` を `app/components/auth/links.ts` に
`HOME_SEARCH` と並べて置くことを提案している。理由は「home ナビゲーションの SSOT が
そこにあるから」。

しかし現状の `auth/links.ts` は `HOME_SEARCH = {} as const` のような **note ドメイン非依存の
純粋な定数**だけを持つ。`homeSearchUpdater` は `NoteListSearch`（`app/components/note/schema.ts`）に
強結合しており、ここへ置くと `auth/links.ts` → `note/schema` の型依存が新たに発生する。
note-list 機能のためのヘルパを auth モジュールに置くのはレイヤー的な逆流であり、
責務の所在がぼやける。

選択肢:
1. Issue 本文どおり `auth/links.ts` に置く
2. note-list に co-locate する（`note/list/homeSearch.ts` 新規 or 既存 `note/list/listSelectors.ts` に追加）

### Decision
**選択肢2** を採る。新規ファイル `app/components/note/list/homeSearch.ts` を作り、そこに
`homeSearchUpdater` を置く。

- ヘルパは本質的に `NoteListSearch` と home/note-list ルートの navigate に閉じた関心事であり、
  その型・consumer（`FilterBar` / `DisplayModeSwitch`）と同じ `note/list` ディレクトリに置くのが自然。
- `auth/links.ts` を note 非依存に保てる（型の逆流を起こさない）。
- 既存 `listSelectors.ts` ではなく専用ファイルにするのは、`listSelectors` が
  「search からの projection（読み取り）」専用なのに対し、本ヘルパは
  「navigate updater payload の構築（書き込み側）」で関心が異なるため。

### Consequences
- 良い点: レイヤー依存の方向が保たれ、ヘルパの責務が consumer の近くに置かれて発見しやすい。
  Issue 本文のメリット（キャスト＋WHY コメントの 1 箇所集約）は置き場所に依らず達成できる。
- トレードオフ: Issue 本文の明示的な指示（auth/links.ts）から逸脱する。PR 説明と本 ADR で
  逸脱理由を明記し、レビューで合意を取る。
