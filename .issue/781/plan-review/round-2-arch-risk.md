# Issue #781 計画レビュー — round 2（アーキテクチャ整合性・実現可能性・リスク）

レビュー対象: `.issue/781/plan.md` / `.issue/781/adr.md`
視点: あるべきアーキテクチャとの整合性・実現可能性・リスク
照合: `git show 15446b65:app/components/common/useRovingTablist.ts` の実 union 型定義と P-001 修正案を照合。round-1 の指摘（P-001 / S-001 / S-002 / S-003）の反映状況を確認。

---

## 結論サマリー

round-1 の指摘はすべて適切に反映された。とりわけ最重要だった **P-001（型 `?: never`）は、`15446b65` の実 union 型定義と照合した結果、提案どおり「automatic に `?: boolean`、manual に `?: never`」で型として正しい**ことを確認した（後述）。復元メカニズム（キーボード意図フラグ + dep 配列なし post-commit effect + `activeElement===body` ガード + 3分岐のフラグ解除 + 2コミット遅延への対処）は `useRovingMenu` 先例と整合し、ロジックを追っても破綻しない。Rules of Hooks 違反もない。**要修正の問題点はゼロ**。

---

## round-1 指摘の反映確認

- **P-001（型 `?: never` 必要）— 反映済み・型として正しい。**
  - 実 union（`15446b65`）は関数引数で `{ orientation, count, selectedIndex, onSelect, manualActivation }` を**直接分割代入**しており、`onSelect`/`manualActivation` が両 variant に宣言されているからこそ成立している（round-1 の前提どおり）。
  - plan ステップ1（131行）・設計（118-123行）・ADR-001 Decision（23/26行）はいずれも「automatic に `restoreFocusOnCommit?: boolean`、manual に `restoreFocusOnCommit?: never`」と明記。typecheck エラー（TS2339）になる理由も併記済み。
  - 型検証: 分割代入 `restoreFocusOnCommit = false` のバインディング型は、automatic 側 `boolean | undefined` と manual 側 `never | undefined`（= `undefined`）の union = `boolean | undefined`、default `false` 適用後 `boolean`。**型が通る**。manual consumer が `restoreFocusOnCommit: true` を渡すと `true` は `never` に代入不可で型エラー → ADR-001 が狙う「manual+復元を表現不能（illegal state unrepresentable）」が厳密に達成される。`?: false` でなく `?: never` を選んだ理由（明示 `false` 渡しのノイズ回避）も妥当。**P-001 は完全に解消**。
- **S-001（byte 等価 → 観測可能な挙動等価）— 反映済み。** AC-3（25行）・設計（53行）・ADR-001 Consequences（27行）・設計判断（162行）すべてで「観測可能な挙動差なし／等価」へ言い換え済み。「byte」表現は plan・ADR から消えている。
- **S-002（フック直叩きテスト）— 反映済み（推奨として明記）。** ステップ3（150行）・テスト方針（181行）にフラグ3分岐の直叩きユニットテストを明記。round-1 で改善提案だったものを「推奨」として取り込み、加えて AC-4 の挙動的回帰テストを「確定タスク」へ格上げ（148/180行）したのは round-1 の意図（CI で回る決定的検証）に沿う。
- **S-003（index 下限ガード）— 反映済み。** スケッチ（97行）・設計（113行）・リスク欄（172行）・ADR-002（59行）すべて `Math.min(Math.max(selectedIndex, 0), items.length - 1)` の上下限クランプに統一。

---

## 残課題の再点検（realizability / risk / 後方互換）

- **復元メカニズムの動作**: 2コミット構造（commit-1 = optimistic 反映・key 安定でノード非スワップ・focus 保持 → commit-2 = RSC 再レンダーでノード再生成・body 脱落）に対し、effect の3分岐（`activeElement===items[clamped]`→flag 維持して return／`!==body`→解除のみ・横取りせず／`===body`→復元・解除）が正しく跨ぐ。dep 配列なしで毎コミット走るため commit-2 を確実に捕捉できる。先例 `useRovingMenu` と同型で現実に動く。
- **Rules of Hooks**: `useRef`（`restorePendingRef`）・`useEffect` を `manualActivation`/`restoreFocusOnCommit` の値にかかわらず常時宣言し、effect 先頭でガード early-return。既存の `useState`/`useRef` 常時宣言方針と一致。違反なし。effect は既存の render-time setState 調整（manual）より後に無条件で宣言され、フック順序は安定。
- **2コミット遅延への対処**: ADR-002 案B（`selectedIndex` dep）/案C（timer）の不採用理由が的確。`selectedIndex` は optimistic で即変わり body 脱落の前に dep effect が発火して取りこぼす、という分析は正しい。post-commit のみが確実なフック点という先例の論理と一致。
- **後方互換**: automatic 限定の型公開（P-001 修正後）＋ effect 先頭 `!restoreFocusOnCommit` early-return ＋ default off の三重で担保。実コード変更は `TagListToolbar` の1行のみ。consumer 集合（`DisplayModeSwitch`/`PublicTopControls`/`EditorModeSwitch`/`TagListToolbar`）は round-1 で `git grep 15446b65` 一致を確認済み。波及最小（#660 ADR-002 文化）に整合。
- **既知の残存エッジ（許容）**: ADR-002 Consequences（65行）が「キーボード操作後に commit-2 の body 脱落が一度も起きないとフラグが消費されず残り、後続の無関係 body 脱落で復元しうる」極端ケースを明示。対象 `TagListToolbar` では矢印選択が常に別 `sort` → 必ず再レンダー → body 脱落するため実害なし、という限定が妥当。型・オプトインで他 consumer には波及しない。**新規の要修正事項ではない**。

---

#### 問題点（要修正）

問題点ゼロ。round-1 の P-001 は実 union 型定義と照合した結果、提案された型修正（automatic `?: boolean` / manual `?: never`）が型として正しいことを確認した。S-001/S-002/S-003 も適切に反映済み。

#### 改善提案（検討推奨）

- **[S-201]** フック直叩きユニットテスト（フラグ3分岐のピン留め）は現在「推奨」止まり。ADR-002 自身が「フラグ解除ロジックの順序依存」を最大の落とし穴に挙げ、happy-dom が 2コミット遅延を忠実に再現しづらいことを踏まえると、3分岐（保持中は維持／body で復元解除／別所で解除のみ）の直叩きテストは「確定タスク」へ格上げする価値がある（AC-4 の挙動テスト確定と同格）。CI で回る決定的回帰防止が、最も壊しやすいロジックに対して最も薄いままになるのを避ける狙い。実装可否には影響しないため任意。

#### 良い点

- **P-001 修正が型として厳密に正しい**: `?: never` 採用により分割代入が型安全になり、かつ manual+復元が型レベルで表現不能になる。round-1 の指摘が ADR-001 の設計意図（illegal state unrepresentable）をむしろ強化する形で取り込まれた。
- **先例（`useRovingMenu`）との対称性が正確**: post-commit effect / `activeElement===body` ガード / `preventScroll: true` を踏襲しつつ、tablist 側は内部 state を持たない（復元先が caller 所有 `selectedIndex`）ため復元 effect で setState 不要という差分を正しく取り込み、再レンダーループを誘発しない。
- **キーボード意図フラグでスコープする判断**: 常時マウントの segmented に `open` ゲートが無いため無条件復元は初期ロード/別 island/window blur で焦点横取り回帰を生む、という分析が正確。flag 初期値 false で初期ロード effect が即 return し横取りしない筋も通っている。
- **レビュー履歴の追跡可能性**: plan 188行に round-1 の4指摘の反映が列挙され、AC-1/AC-2 の対応ステップに検証3,4を追跡済み。設計判断が ADR へ正しくポインタ化されている。
