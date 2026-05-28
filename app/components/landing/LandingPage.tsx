import { Link } from "@tanstack/react-router";
import { HOME_SEARCH } from "@/components/auth/links";

const HEADER =
  "sticky top-0 z-50 h-[var(--header-height)] flex items-center justify-between gap-5 border-b border-hairline bg-[var(--header-bg)] px-[var(--container-padding)] supports-[backdrop-filter]:[backdrop-filter:saturate(180%)_blur(20px)] supports-[backdrop-filter]:[-webkit-backdrop-filter:saturate(180%)_blur(20px)]";
const LOGO = "text-[21px] font-light tracking-tightest text-ink";
const HEADER_NAV = "flex items-center gap-2";
const HEADER_LINK =
  "text-sm text-ink-secondary px-3 py-2 rounded-md transition-colors motion-reduce:transition-none hover:text-ink hover:bg-surface";
const HEADER_CTA =
  "h-9 px-4 rounded-pill bg-accent text-white text-sm font-medium inline-flex items-center transition-colors motion-reduce:transition-none hover:bg-accent-hover";

const CONTAINER =
  "max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]";
const HERO = `pt-16 pb-12 text-center md:pt-20 md:pb-16 ${CONTAINER}`;
const HERO_EYEBROW =
  "inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-accent-surface text-accent-ink text-xs font-medium mb-6 tracking-normal";
const HERO_TITLE =
  "text-[clamp(36px,6vw,64px)] font-normal tracking-tightest leading-tight text-ink mx-auto mb-6 max-w-[14ch]";
const HERO_SUBTITLE =
  "text-[clamp(16px,1.4vw+12px,20px)] text-ink-secondary leading-relaxed max-w-[40ch] mx-auto mb-8";
const HERO_ACTIONS =
  "flex flex-col gap-3 items-center justify-center sm:flex-row";
const HERO_BTN_PRIMARY =
  "inline-flex items-center justify-center h-12 px-8 min-w-[200px] rounded-pill bg-accent text-white text-md font-medium transition-colors motion-reduce:transition-none hover:bg-accent-hover active:bg-accent-pressed";
const HERO_BTN_SECONDARY =
  "inline-flex items-center justify-center h-12 px-8 min-w-[200px] rounded-pill bg-surface text-ink text-md font-medium transition-colors motion-reduce:transition-none hover:bg-surface-hover";

const HERO_PREVIEW =
  "mt-12 mx-auto max-w-[980px] rounded-xl bg-surface-elevated shadow-md overflow-hidden text-left";
const PREVIEW_BAR = "h-9 bg-surface flex items-center gap-2 px-4";
const PREVIEW_BAR_DOT = "w-2.5 h-2.5 rounded-full bg-hairline-strong";
const PREVIEW_BODY = "grid grid-cols-1 min-h-[360px] lg:grid-cols-[220px_1fr]";
const PREVIEW_SIDE =
  "hidden py-6 px-4 border-r border-hairline text-sm lg:block";
const PREVIEW_SIDE_TITLE =
  "text-xs text-ink-tertiary uppercase tracking-[0.06em] mb-3 px-3";
const PREVIEW_SIDE_ITEM =
  "flex items-center gap-2 px-3 py-2 rounded-md text-ink data-[active]:bg-surface data-[active]:font-medium";
const PREVIEW_MAIN = "py-6 px-5 flex flex-col gap-4";
const PREVIEW_NOTE =
  "grid grid-cols-[1fr_auto] gap-4 px-3 py-4 border-t border-hairline items-center first-of-type:border-t-0";
const PREVIEW_NOTE_TITLE = "text-md font-medium text-ink mb-1";
const PREVIEW_NOTE_SNIPPET =
  "text-sm text-ink-secondary leading-normal overflow-hidden text-ellipsis whitespace-nowrap mb-2";
const PREVIEW_NOTE_META = "text-xs text-ink-tertiary flex gap-2 items-center";
const PREVIEW_NOTE_DATE = "text-xs text-ink-tertiary whitespace-nowrap";
const PUB_DOT =
  "inline-block w-1.5 h-1.5 rounded-full bg-status-public mr-1 align-[1px]";

const SECTION = `py-16 ${CONTAINER}`;
const SECTION_HEADING = "text-center mb-12";
const SECTION_EYEBROW =
  "text-sm text-accent font-medium mb-2 uppercase tracking-[0.06em]";
const SECTION_TITLE =
  "text-[clamp(28px,3.6vw,40px)] font-normal tracking-tightest leading-tight text-ink mx-auto mb-4 max-w-[22ch]";
const SECTION_LEAD =
  "text-md text-ink-secondary leading-relaxed max-w-[56ch] mx-auto";
const FEATURES =
  "grid grid-cols-1 gap-5 sm:grid-cols-2 md:gap-6 lg:grid-cols-4";
const FEATURE_CARD =
  "py-8 px-6 rounded-xl bg-surface transition-colors motion-reduce:transition-none hover:bg-surface-hover";
const FEATURE_ICON =
  "w-12 h-12 rounded-lg bg-bg text-accent inline-flex items-center justify-center mb-5";
const FEATURE_TITLE =
  "text-lg font-semibold tracking-tight text-ink mb-2 leading-snug";
const FEATURE_BODY = "text-sm text-ink-secondary leading-relaxed";

const TEASER = "mt-16 py-10 px-6 rounded-xl bg-accent-surface text-center";
const TEASER_TITLE = "text-xl font-semibold tracking-tighter text-ink mb-2";
const TEASER_BODY =
  "text-sm text-ink-secondary leading-relaxed mx-auto mb-5 max-w-[44ch]";
const TEASER_LINK =
  "inline-flex items-center gap-2 px-5 py-3 rounded-pill bg-bg text-accent text-sm font-medium transition-colors motion-reduce:transition-none hover:bg-surface";

const SITE_FOOTER = "border-t border-hairline pt-12 pb-10 mt-16";
const FOOTER_GRID =
  "grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-12";
const FOOTER_TAGLINE =
  "text-sm text-ink-secondary leading-relaxed max-w-[36ch] m-0";
const FOOTER_COL_TITLE =
  "text-xs font-medium text-ink-tertiary uppercase tracking-[0.06em] mb-3";
const FOOTER_LIST = "flex flex-col gap-2 list-none m-0 p-0";
const FOOTER_LIST_LINK =
  "text-sm text-ink-secondary transition-colors motion-reduce:transition-none hover:text-ink";
const FOOTER_BOTTOM =
  "mt-10 pt-6 border-t border-hairline flex flex-col gap-2 items-start justify-between text-xs text-ink-tertiary sm:flex-row sm:items-center";

export function LandingPage() {
  return (
    <>
      <header className={HEADER}>
        <Link to="/" search={HOME_SEARCH} className={LOGO}>
          Hollow
        </Link>
        <nav className={HEADER_NAV} aria-label="Primary">
          <a href="#features" className={HEADER_LINK}>
            機能
          </a>
          <Link to="/login" className={HEADER_LINK}>
            ログイン
          </Link>
          <Link to="/signup" className={HEADER_CTA}>
            アカウント作成
          </Link>
        </nav>
      </header>

      <main>
        <section className={HERO}>
          <span className={HERO_EYEBROW}>
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="6" />
            </svg>
            Apple Calm でつくる、静かな書斎
          </span>
          <h1 className={HERO_TITLE}>散らかった頭の中に、静かな置き場所を</h1>
          <p className={HERO_SUBTITLE}>
            Markdownでも、撮りためたメモでも。Hollowは、書いたものを整理して、必要なときにそっと取り出せるパーソナルな書庫です。
          </p>
          <div className={HERO_ACTIONS}>
            <Link to="/signup" className={HERO_BTN_PRIMARY}>
              無料でアカウント作成
            </Link>
            <Link to="/login" className={HERO_BTN_SECONDARY}>
              ログイン
            </Link>
          </div>

          <div className={HERO_PREVIEW} aria-hidden="true">
            <div className={PREVIEW_BAR}>
              <span className={PREVIEW_BAR_DOT} />
              <span className={PREVIEW_BAR_DOT} />
              <span className={PREVIEW_BAR_DOT} />
            </div>
            <div className={PREVIEW_BODY}>
              <aside className={PREVIEW_SIDE}>
                <div className={PREVIEW_SIDE_TITLE}>ライブラリ</div>
                <div className={PREVIEW_SIDE_ITEM} data-active="">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-ink-secondary shrink-0"
                  >
                    <path d="M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z" />
                  </svg>
                  すべてのノート
                  <span className="ml-auto text-xs text-ink-tertiary">127</span>
                </div>
                <div className={PREVIEW_SIDE_ITEM}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-ink-secondary shrink-0"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <polyline points="12 7 12 12 15 14" />
                  </svg>
                  最近更新
                </div>
                <div className={PREVIEW_SIDE_ITEM}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-ink-secondary shrink-0"
                  >
                    <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9" />
                  </svg>
                  お気に入り
                </div>
                <div className={`${PREVIEW_SIDE_TITLE} mt-6`}>ディレクトリ</div>
                <div className={PREVIEW_SIDE_ITEM}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-ink-secondary shrink-0"
                  >
                    <path d="M3 7h6l2 2h10v10a2 2 0 0 1-2 2H3z" />
                  </svg>
                  Research
                </div>
                <div className={PREVIEW_SIDE_ITEM}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-ink-secondary shrink-0"
                  >
                    <path d="M3 7h6l2 2h10v10a2 2 0 0 1-2 2H3z" />
                  </svg>
                  日記
                </div>
              </aside>

              <div className={PREVIEW_MAIN}>
                <div className={PREVIEW_NOTE}>
                  <div>
                    <div className={PREVIEW_NOTE_TITLE}>
                      静かなインターフェースについての覚書
                    </div>
                    <div className={PREVIEW_NOTE_SNIPPET}>
                      余白の使い方一つで、画面は驚くほど穏やかになる。
                    </div>
                    <div className={PREVIEW_NOTE_META}>
                      <span className="text-accent">#design</span>
                      <span className="text-hairline-strong">·</span>
                      <span>Research / 論文メモ</span>
                      <span className="text-hairline-strong">·</span>
                      <span>
                        <span className={PUB_DOT} />
                        公開中
                      </span>
                    </div>
                  </div>
                  <div className={PREVIEW_NOTE_DATE}>今日 14:32</div>
                </div>
                <div className={PREVIEW_NOTE}>
                  <div>
                    <div className={PREVIEW_NOTE_TITLE}>
                      2026年5月の読書記録
                    </div>
                    <div className={PREVIEW_NOTE_SNIPPET}>
                      『ノルウェイの森』を再読。15年ぶりに開いたら、印象がまるで違っていた。
                    </div>
                    <div className={PREVIEW_NOTE_META}>
                      <span className="text-accent">#読書</span>
                      <span className="text-hairline-strong">·</span>
                      <span>日記 / 2026</span>
                    </div>
                  </div>
                  <div className={PREVIEW_NOTE_DATE}>今日 09:15</div>
                </div>
                <div className={PREVIEW_NOTE}>
                  <div>
                    <div className={PREVIEW_NOTE_TITLE}>
                      Cloudflare Workers + D1 のパフォーマンス計測
                    </div>
                    <div className={PREVIEW_NOTE_SNIPPET}>
                      Hono経由でD1にクエリを投げる構成で、Cold start と
                      P99レイテンシを測ってみた結果。
                    </div>
                    <div className={PREVIEW_NOTE_META}>
                      <span className="text-accent">#cloudflare</span>
                      <span className="text-hairline-strong">·</span>
                      <span>プロジェクト / Hollow</span>
                      <span className="text-hairline-strong">·</span>
                      <span>
                        <span className={PUB_DOT} />
                        公開中
                      </span>
                    </div>
                  </div>
                  <div className={PREVIEW_NOTE_DATE}>昨日</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={SECTION} id="features">
          <div className={SECTION_HEADING}>
            <div className={SECTION_EYEBROW}>Why Hollow</div>
            <h2 className={SECTION_TITLE}>書いたものを、ちゃんと残す</h2>
            <p className={SECTION_LEAD}>
              アップロードから公開まで、ノートを長く使い続けるための機能を、ノイズなく揃えています。
            </p>
          </div>

          <div className={FEATURES}>
            <article className={FEATURE_CARD}>
              <div className={FEATURE_ICON} aria-hidden="true">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <h3 className={FEATURE_TITLE}>アップロードして構造化</h3>
              <p className={FEATURE_BODY}>
                Markdown・テキスト・既存のノートを取り込み、フロントマターを解釈してタグや日付を自動で整理します。
              </p>
            </article>

            <article className={FEATURE_CARD}>
              <div className={FEATURE_ICON} aria-hidden="true">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                  <line x1="7" y1="7" x2="7.01" y2="7" />
                </svg>
              </div>
              <h3 className={FEATURE_TITLE}>メタデータ管理</h3>
              <p className={FEATURE_BODY}>
                タグ・ディレクトリ・バックリンク。あとから辿るための道筋を、書きながら自然に作れます。
              </p>
            </article>

            <article className={FEATURE_CARD}>
              <div className={FEATURE_ICON} aria-hidden="true">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z" />
                </svg>
              </div>
              <h3 className={FEATURE_TITLE}>公開・限定共有</h3>
              <p className={FEATURE_BODY}>
                プライベート / リンクのみ /
                公開の3段階で、書き残したものを必要な範囲だけ世界へ届けられます。
              </p>
            </article>

            <article className={FEATURE_CARD}>
              <div className={FEATURE_ICON} aria-hidden="true">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <h3 className={FEATURE_TITLE}>いつでもエクスポート</h3>
              <p className={FEATURE_BODY}>
                書いた内容はあなたのもの。Markdownのzipアーカイブとして、いつでも手元に取り戻せます。
              </p>
            </article>
          </div>

          <div className={TEASER}>
            <h3 className={TEASER_TITLE}>公開ノートを覗いてみる</h3>
            <p className={TEASER_BODY}>
              アカウントを作る前に、このインスタンスで公開されているノートを横断検索できます。
            </p>
            <Link to="/" search={HOME_SEARCH} className={TEASER_LINK}>
              公開検索を試す
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          </div>
        </section>
      </main>

      <footer className={SITE_FOOTER}>
        <div className={CONTAINER}>
          <div className={FOOTER_GRID}>
            <div>
              <span className={`${LOGO} block mb-3`}>Hollow</span>
              <p className={FOOTER_TAGLINE}>
                散らかった頭の中に、静かな置き場所を。
                <br />
                個人のための、ひっそりとしたノートサーバーです。
              </p>
            </div>
            <div>
              <div className={FOOTER_COL_TITLE}>プロダクト</div>
              <ul className={FOOTER_LIST}>
                <li>
                  <a href="#features" className={FOOTER_LIST_LINK}>
                    機能
                  </a>
                </li>
                <li>
                  <Link
                    to="/"
                    search={HOME_SEARCH}
                    className={FOOTER_LIST_LINK}
                  >
                    公開検索
                  </Link>
                </li>
                <li>
                  <Link
                    to="/"
                    search={HOME_SEARCH}
                    className={FOOTER_LIST_LINK}
                  >
                    エクスポート
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <div className={FOOTER_COL_TITLE}>インスタンス</div>
              <ul className={FOOTER_LIST}>
                <li>
                  <Link to="/about" className={FOOTER_LIST_LINK}>
                    このインスタンスについて
                  </Link>
                </li>
                <li>
                  <Link to="/about" className={FOOTER_LIST_LINK}>
                    運営者情報
                  </Link>
                </li>
                <li>
                  <Link to="/about" hash="contact" className={FOOTER_LIST_LINK}>
                    お問い合わせ
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <div className={FOOTER_COL_TITLE}>法的事項</div>
              <ul className={FOOTER_LIST}>
                <li>
                  <Link to="/terms" className={FOOTER_LIST_LINK}>
                    利用規約
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className={FOOTER_LIST_LINK}>
                    プライバシーポリシー
                  </Link>
                </li>
                <li>
                  <Link
                    to="/about"
                    hash="commerce"
                    className={FOOTER_LIST_LINK}
                  >
                    特定商取引法
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className={FOOTER_BOTTOM}>
            <span>© 2026 Hollow. A quiet personal text archive.</span>
            <span>v0.1.0 · Hosted on Cloudflare</span>
          </div>
        </div>
      </footer>
    </>
  );
}
