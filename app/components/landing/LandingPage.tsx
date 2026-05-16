import { Link } from "@tanstack/react-router";
import { HOME_SEARCH } from "@/components/auth/links";

export function LandingPage() {
  return (
    <>
      <header className="app-header">
        <Link to="/" search={HOME_SEARCH} className="app-logo">
          Hollow
        </Link>
        <nav className="header-nav" aria-label="Primary">
          <a href="#features" className="header-link">
            機能
          </a>
          <Link to="/login" className="header-link">
            ログイン
          </Link>
          <Link to="/signup" className="header-cta">
            アカウント作成
          </Link>
        </nav>
      </header>

      <main>
        <section className="hero container">
          <span className="hero-eyebrow">
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
          <h1 className="hero-title">散らかった頭の中に、静かな置き場所を</h1>
          <p className="hero-subtitle">
            Markdownでも、撮りためたメモでも。Hollowは、書いたものを整理して、必要なときにそっと取り出せるパーソナルな書庫です。
          </p>
          <div className="hero-actions">
            <Link to="/signup" className="hero-btn-primary">
              無料でアカウント作成
            </Link>
            <Link to="/login" className="hero-btn-secondary">
              ログイン
            </Link>
          </div>

          <div className="hero-preview" aria-hidden="true">
            <div className="preview-bar">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
            <div className="preview-body">
              <aside className="preview-side">
                <div className="preview-side-title">ライブラリ</div>
                <div className="preview-side-item active">
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
                  >
                    <path d="M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z" />
                  </svg>
                  すべてのノート
                  <span className="count">127</span>
                </div>
                <div className="preview-side-item">
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
                  >
                    <circle cx="12" cy="12" r="9" />
                    <polyline points="12 7 12 12 15 14" />
                  </svg>
                  最近更新
                </div>
                <div className="preview-side-item">
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
                  >
                    <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9" />
                  </svg>
                  お気に入り
                </div>
                <div
                  className="preview-side-title"
                  style={{ marginTop: "var(--space-6)" }}
                >
                  ディレクトリ
                </div>
                <div className="preview-side-item">
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
                  >
                    <path d="M3 7h6l2 2h10v10a2 2 0 0 1-2 2H3z" />
                  </svg>
                  Research
                </div>
                <div className="preview-side-item">
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
                  >
                    <path d="M3 7h6l2 2h10v10a2 2 0 0 1-2 2H3z" />
                  </svg>
                  日記
                </div>
              </aside>

              <div className="preview-main">
                <div className="preview-note">
                  <div>
                    <div className="preview-note-title">
                      静かなインターフェースについての覚書
                    </div>
                    <div className="preview-note-snippet">
                      余白の使い方一つで、画面は驚くほど穏やかになる。
                    </div>
                    <div className="preview-note-meta">
                      <span className="tag">#design</span>
                      <span className="sep">·</span>
                      <span>Research / 論文メモ</span>
                      <span className="sep">·</span>
                      <span>
                        <span className="pub-dot" />
                        公開中
                      </span>
                    </div>
                  </div>
                  <div className="preview-note-date">今日 14:32</div>
                </div>
                <div className="preview-note">
                  <div>
                    <div className="preview-note-title">
                      2026年5月の読書記録
                    </div>
                    <div className="preview-note-snippet">
                      『ノルウェイの森』を再読。15年ぶりに開いたら、印象がまるで違っていた。
                    </div>
                    <div className="preview-note-meta">
                      <span className="tag">#読書</span>
                      <span className="sep">·</span>
                      <span>日記 / 2026</span>
                    </div>
                  </div>
                  <div className="preview-note-date">今日 09:15</div>
                </div>
                <div className="preview-note">
                  <div>
                    <div className="preview-note-title">
                      Cloudflare Workers + D1 のパフォーマンス計測
                    </div>
                    <div className="preview-note-snippet">
                      Hono経由でD1にクエリを投げる構成で、Cold start と
                      P99レイテンシを測ってみた結果。
                    </div>
                    <div className="preview-note-meta">
                      <span className="tag">#cloudflare</span>
                      <span className="sep">·</span>
                      <span>プロジェクト / Hollow</span>
                      <span className="sep">·</span>
                      <span>
                        <span className="pub-dot" />
                        公開中
                      </span>
                    </div>
                  </div>
                  <div className="preview-note-date">昨日</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section container" id="features">
          <div className="section-heading">
            <div className="section-eyebrow">Why Hollow</div>
            <h2 className="section-title">書いたものを、ちゃんと残す</h2>
            <p className="section-lead">
              アップロードから公開まで、ノートを長く使い続けるための機能を、ノイズなく揃えています。
            </p>
          </div>

          <div className="features">
            <article className="feature-card">
              <div className="feature-icon" aria-hidden="true">
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
              <h3 className="feature-title">アップロードして構造化</h3>
              <p className="feature-body">
                Markdown・テキスト・既存のノートを取り込み、フロントマターを解釈してタグや日付を自動で整理します。
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon" aria-hidden="true">
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
              <h3 className="feature-title">メタデータ管理</h3>
              <p className="feature-body">
                タグ・ディレクトリ・バックリンク。あとから辿るための道筋を、書きながら自然に作れます。
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon" aria-hidden="true">
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
              <h3 className="feature-title">公開・限定共有</h3>
              <p className="feature-body">
                プライベート / リンクのみ /
                公開の3段階で、書き残したものを必要な範囲だけ世界へ届けられます。
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon" aria-hidden="true">
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
              <h3 className="feature-title">いつでもエクスポート</h3>
              <p className="feature-body">
                書いた内容はあなたのもの。Markdownのzipアーカイブとして、いつでも手元に取り戻せます。
              </p>
            </article>
          </div>

          <div className="teaser">
            <h3 className="teaser-title">公開ノートを覗いてみる</h3>
            <p className="teaser-body">
              アカウントを作る前に、このインスタンスで公開されているノートを横断検索できます。
            </p>
            <Link to="/" search={HOME_SEARCH} className="teaser-link">
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

      <footer className="site-footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <span className="app-logo">Hollow</span>
              <p className="footer-tagline">
                散らかった頭の中に、静かな置き場所を。
                <br />
                個人のための、ひっそりとしたノートサーバーです。
              </p>
            </div>
            <div>
              <div className="footer-col-title">プロダクト</div>
              <ul className="footer-list">
                <li>
                  <a href="#features">機能</a>
                </li>
                <li>
                  <Link to="/" search={HOME_SEARCH}>
                    公開検索
                  </Link>
                </li>
                <li>
                  <Link to="/" search={HOME_SEARCH}>
                    エクスポート
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <div className="footer-col-title">インスタンス</div>
              <ul className="footer-list">
                <li>
                  <Link to="/" search={HOME_SEARCH}>
                    このインスタンスについて
                  </Link>
                </li>
                <li>
                  <Link to="/" search={HOME_SEARCH}>
                    運営者情報
                  </Link>
                </li>
                <li>
                  <Link to="/" search={HOME_SEARCH}>
                    お問い合わせ
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <div className="footer-col-title">法的事項</div>
              <ul className="footer-list">
                <li>
                  <Link to="/" search={HOME_SEARCH}>
                    利用規約
                  </Link>
                </li>
                <li>
                  <Link to="/" search={HOME_SEARCH}>
                    プライバシーポリシー
                  </Link>
                </li>
                <li>
                  <Link to="/" search={HOME_SEARCH}>
                    特定商取引法
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 Hollow. A quiet personal text archive.</span>
            <span>v0.1.0 · Hosted on Cloudflare</span>
          </div>
        </div>
      </footer>
    </>
  );
}
