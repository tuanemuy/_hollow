# Plan Review — Issue #612 (Round 1)

視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク

レビュー対象: `.issue/612/plan.md` / `.issue/612/adr.md`

---

#### 問題点（要修正）

問題点ゼロ

調査で計画・ADR の全主張をコード実体に突き合わせた結果、アーキテクチャ整合性・依存方向・実現可能性のいずれにも要修正レベルの問題は見つからなかった。確認内容:

- `listSortedAll`（`publicationStateRepository.ts` L255-261）の count 母集合は `ownerId` + `visibility='public'` + `isNotNull(publishedAt)` + `notes.status='active'`（INNER JOIN）。計画 / ADR が新メソッドに置く WHERE 4 条件と完全一致。`publishedRangeConditions` は range 引数が無ければ空配列を返す（L53-65）ので、range を持たない `countPublicByOwner` が「フィルタ無し listing total」と一致するのは正しい。見落とした条件・副作用なし。
- `count` は import 済み（L6）。`Number(countRows[0]?.value ?? 0)` パターンも L285 に既存。`idx_pubs_owner_visibility_published_at` 利用も `listSortedAll` と同 JOIN 形なので妥当。実装上の落とし穴なし。
- `findPublicByOwner`（L197-222）は active JOIN を持たず、3 呼び出し元（getPublicProfile / listRelatedPublicNotes / deleteAccount）で共有という前提は実体どおり。
  - deleteAccount（`deleteAccount.ts` L66-90）は `findPublicByOwner` で全 public 行を keyset walk し、`visibility === "private"` 以外（= trashed-but-public 含む）を private に flip する。ここに active JOIN を足すと trashed-but-public 行を取りこぼし掃除が不完全になる、という ADR-001 が案 (a) を退けた根拠は正しい。
  - listRelatedPublicNotes（`listRelatedPublicNotes.ts` L87-114）は over-fetch 後 `status === 'active'` で in-memory 再フィルタ済み。不変更が正しいという主張も正しい。
- `PublicationStateRepository` の本番実装・fake は D1 のみ（fake 不在）。port 追加で更新が必要なのは D1 実装 1 箇所のみという主張は正しく、unit fake が無いため D1 integration test に依存する判断も妥当。
- 依存方向: port IF（domain）→ adapter（D1）→ usecase（application）の順で、presentation 出力（`publicNoteCount: number`）の型・意味不変。内向き依存・read-only count 射影で集約境界（notes JOIN を adapter の read-only SQL に限定）を維持する設計で、CLAUDE.md / port JSDoc の規約に沿う。

---

#### 改善提案（検討推奨）

- **[S-001]** AC-2 の「filter 無し全件比較」というスコープ限定を、計画本文（受け入れ基準 / リスク）でもう一段明示しておく
  - 理由: listing total は `listUserPublicNotes` のデフォルト sort（`publishedAt`）かつ tag/published_range 無しのときだけ `listSortedAll`（active JOIN count）を通る。tag AND または published_range 指定時は `listSortedWithinCandidates`（active JOIN 省略、候補が application 由来 active 限定）または note-column 経路へ分岐し、母集合の組み方が変わる。`countPublicByOwner`（無条件の active JOIN count）が一致するのは前者のみ。AC-2 表に既に「フィルタ無しの全件比較」と書かれており解釈は正しいが、ヒーロー件数は常に「フィルタ非依存の全公開件数」である一方 listing total はフィルタ適用後件数なので、「フィルタ適用時はヒーロー件数 ≠ listing total が仕様どおり」である旨をリスク節に 1 行足すと、レビュー/QA での誤検知を防げる。

- **[S-002]** ステップ 5 のテストに「published_at NOT NULL だが status=trashed」「status=active だが published_at NULL」を独立に分離したケースを明記する
  - 理由: 計画のテスト列挙（trashed-but-public 除外 / published_at NULL 除外）は網羅的だが、2 条件が直交していることを 1 ケースずつで担保すると、将来 WHERE のどれか 1 条件が消えた際に取りこぼしを確実に検出できる。AC-1（trashed 除外）と「published_at NOT NULL」（`listSortedAll` 整合）の双方を独立に固定する意図。現計画の (b)(d) で概ねカバーされており、明示化の推奨にとどまる。

---

#### 良い点

- ADR-001 のトレードオフ分析が妥当。案 (a)（共有メソッド改変）を deleteAccount の掃除崩壊 + keyset cursor 母集合の意味変化 + listRelatedPublicNotes の over-fetch 意味変化の 3 点で退け、案 (b)（application で hydrate して in-memory count）を limit:1000 頭打ち残存（AC-3 未達）+ 恒常 over-fetch コスト + 集約境界に余計な note hydrate を持ち込む点で退け、案 (c) を「#605 `listSortedAll` が確立した active 母集合 count パターンの素直な再利用」として採る論理が一貫している。案 (c) が (a) より優れているという結論は、実体（deleteAccount が trashed-but-public 行を flip する必要があること）に裏打ちされており妥当。
- 件数専用メソッド新設（案 c）が COUNT を SQL に降ろすことで limit:1000 頭打ち（AC-3）を「原理的に消す」と整理できている点。in-memory count 案では達成できない副次効果を正しく案選定の決め手にしている。
- 実装ステップが依存方向の内→外（port → adapter → usecase → test）で並んでおり、「件数の意味（active 母集合・limit なし・listing total 整合）を JSDoc で port 契約に明示し `findPublicByOwner` の `.length` と使い分けを誘導する」という、ポート起点で設計する姿勢が貫かれている。
- リスク節が「`findPublicByOwner` を絶対に改変しない」「WHERE を `listSortedAll` と完全一致させる」「`published_at IS NOT NULL` を落とさない」と、再発しうる具体的な落とし穴を名指ししており、実装者へのガードとして有効。
- fake 不在を認識した上で D1 integration test に検証を寄せ、可能なら同 owner で `listPublicNoteIdsByOwnerSorted` の total と `countPublicByOwner` を 1 ケースで突き合わせる（AC-2 の adapter レベル裏取り）案を入れている点が、本 Issue の症状（ヒーローと listing の乖離）を直接押さえていて良い。
