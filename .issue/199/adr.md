# ADR — Issue #199: 見出し・本文の幅制約と強制改行による不自然な折り返しを解消する

## ADR-001: `ch` 幅撤去後のバランス制御に `text-balance` / `text-pretty` を使い分ける

### Status
Proposed

### Context
`ch` ベースの `max-w-[Nch]` を撤去すると、何の制約もなければ見出し・本文がコンテナ幅いっぱいに広がる。撤去後のレイアウト品質をどう担保するかの選択肢:
- 何もしない（自然折り返しのみ）
- `text-balance`（行長を均等化、見出し向き）
- `text-pretty`（末尾オーファンを抑制、本文向き）
- `rem` / `px` の物理幅で読み幅を絞る

### Decision
要素の役割で使い分ける:
- **見出し**（HERO_TITLE / SECTION_TITLE）: `text-balance`。複数行見出しの行長均等化が用途に合致し、「す」1文字オーファンを解消できる。
- **本文**（SUBTITLE / LEAD / TEASER_BODY / FOOTER_TAGLINE / PROFILE_BIO）: 読み幅を物理的に絞るのが目的なので `rem` 幅＋`text-pretty`。
- HERO_TITLE / SECTION_TITLE とも `max-w` を完全撤去し、いずれも CONTAINER（`--container-max`=1280px）内で `text-balance` に委ねる。HERO_TITLE は実機で間延びが確認された場合のみ緩い rem 上限（28〜32rem 目安）を再付与する（当初案 `20rem` は5文字/行で逆効果のため不採用）。

### Consequences
- 良い点: `ch` の言語依存を排除しつつ、見出し・本文それぞれに最適なバランス手法を当てられる。rem は言語非依存。
- トレードオフ: `text-balance` は重いテキストで性能コストがあるが、対象は短い見出しのみで無視できる。rem 幅は CJK 基準で決めたため英語では行数が増えるが readable レンジ内。

---

## ADR-002: 本文読み幅トークンは新規追加せず、PROFILE_BIO は既存 `--content-max` を参照する

### Status
Proposed

### Context
`ch` を rem に置換する際、本文読み幅の値をどう管理するか。landing 本文は箇所ごとに最適幅が異なるため rem リテラルで個別指定するが、PROFILE_BIO（プロフィール自己紹介）は「本文の読み幅」という汎用概念に該当する。`tokens.css` には既に `--content-max: 760px` が本文読み幅の SSOT として存在する。

### Decision
- landing 本文の rem 幅はリテラル指定（箇所ごとに最適値が異なり、汎用トークン化するほどの再利用性がない）。
- PROFILE_BIO は `max-w-[var(--content-max)]` でトークン参照する（本文読み幅の SSOT が既存）。
- 新規トークンは追加しない（リテラルで足り、トークン乱立を避ける）。

### Consequences
- 良い点: 既存 SSOT を尊重し、トークンの新設を避けて規約に整合。
- トレードオフ: landing 本文の rem 値が複数リテラルとして散在するが、いずれも `styles.ts` の module-scoped 定数内に集約されており JIT スキャン対象なので実害なし。
