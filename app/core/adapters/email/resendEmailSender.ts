import { maskSecrets } from "@/core/application/llm/sanitizeErrorReason";
import type { EmailSender } from "@/core/domain/identity/ports/emailSender";
import type { EmailAddress } from "@/core/domain/identity/valueObject";

/**
 * Resend HTTP API implementation of {@link EmailSender}.
 *
 * Posts to `https://api.resend.com/emails` with `{ from, to, subject, html }`.
 * Each public method renders a minimal locale-aware HTML body and delegates
 * to {@link ResendEmailSender#postEmail}; provider details (auth header,
 * timeout, error mapping) stay isolated in the private helper so the
 * port methods read as render + dispatch pairs.
 *
 * Locale handling: `locale === "ja"` selects the Japanese template;
 * everything else falls back to English. The 2-locale design is
 * intentional for the MVP — see `.issue/197/adr.md` ADR-003.
 *
 * Error contract: every failure path throws a plain {@link Error} with
 * a human-readable message. Response body fragments embedded in the
 * message are run through {@link maskSecrets} so a misconfigured API key
 * surfacing in the Resend error body never lands in our logs. This
 * matches the {@link EmailSender} port's "no kind-tagged error class"
 * contract — identity usecases catch and log-only after the UoW commits
 * (see `.issue/197/adr.md` ADR-002), so transport-style error classes
 * would be dead code.
 *
 * Timeout: `AbortController` + `setTimeout` cleared in `finally`, 30s
 * default to match the Cloudflare Workers subrequest budget. Same shape
 * as `anthropic/messagesClient.ts` and `openai/connectionPing.ts`.
 */

export type ResendEmailSenderConfig = Readonly<{
  /** Resend API key (`re_...`). Empty string rejected in the constructor. */
  apiKey: string;
  /**
   * From address. Must be a domain Resend has verified (SPF/DKIM/DMARC),
   * otherwise the API returns 4xx on every send. Empty string rejected.
   */
  from: string;
  /** Optional endpoint override (useful for tests). */
  endpoint?: string;
  /** Per-request timeout in milliseconds. Defaults to {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Optional fetch override (injected in tests). */
  fetchImpl?: typeof fetch;
}>;

export const DEFAULT_ENDPOINT = "https://api.resend.com/emails";
export const DEFAULT_TIMEOUT_MS = 30_000;

type ResendErrorBody = Readonly<{
  message?: string;
  name?: string;
  statusCode?: number;
}>;

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

export class ResendEmailSender implements EmailSender {
  private readonly apiKey: string;
  private readonly from: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: ResendEmailSenderConfig) {
    if (config.apiKey.length === 0) {
      throw new Error("ResendEmailSender: apiKey must be a non-empty string");
    }
    if (config.from.length === 0) {
      throw new Error("ResendEmailSender: from must be a non-empty string");
    }
    this.apiKey = config.apiKey;
    this.from = config.from;
    this.endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    // Cloudflare Workers' global `fetch` throws `Illegal invocation` when
    // it loses its `this` context — which happens the moment we assign it
    // to an instance property and later call it as `this.fetchImpl(...)`.
    // Wrap in an arrow so the call site is a plain function invocation,
    // and tests can still inject a mock through `config.fetchImpl`.
    this.fetchImpl =
      config.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  }

  async sendVerification(
    to: EmailAddress,
    link: URL,
    locale: string,
  ): Promise<void> {
    const { subject, html } = renderVerification(link, locale);
    await this.postEmail({ to, subject, html });
  }

  async sendPasswordReset(
    to: EmailAddress,
    link: URL,
    locale: string,
  ): Promise<void> {
    const { subject, html } = renderPasswordReset(link, locale);
    await this.postEmail({ to, subject, html });
  }

  async sendEmailChangeNotice(
    to: EmailAddress,
    link: URL,
    locale: string,
  ): Promise<void> {
    const { subject, html } = renderEmailChangeNotice(link, locale);
    await this.postEmail({ to, subject, html });
  }

  async sendEmailChangeWarning(
    oldEmail: EmailAddress,
    newEmail: EmailAddress,
    locale: string,
  ): Promise<void> {
    const { subject, html } = renderEmailChangeWarning(
      oldEmail,
      newEmail,
      locale,
    );
    await this.postEmail({ to: oldEmail, subject, html });
  }

  private async postEmail(params: {
    to: EmailAddress;
    subject: string;
    html: string;
  }): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: params.to,
          subject: params.subject,
          html: params.html,
        }),
        signal: controller.signal,
      });
    } catch (cause) {
      if (isAbortError(cause)) {
        throw new Error(
          `ResendEmailSender: timeout after ${this.timeoutMs}ms`,
          { cause },
        );
      }
      if (cause instanceof TypeError) {
        throw new Error(
          `ResendEmailSender: network error: ${maskSecrets(cause.message)}`,
          { cause },
        );
      }
      const message =
        cause instanceof Error ? cause.message : String(cause ?? "");
      throw new Error(
        `ResendEmailSender: unexpected error: ${maskSecrets(message)}`,
        { cause },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const detail = await extractErrorDetail(response);
      const suffix = detail.length > 0 ? `: ${maskSecrets(detail)}` : "";
      throw new Error(
        `ResendEmailSender: API error ${response.status}${suffix}`,
      );
    }
  }
}

async function extractErrorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ResendErrorBody;
    if (typeof body.message === "string" && body.message.length > 0) {
      return body.message;
    }
    if (typeof body.name === "string" && body.name.length > 0) {
      return body.name;
    }
    return "";
  } catch {
    try {
      return (await response.text()).slice(0, 256);
    } catch {
      return "";
    }
  }
}

type RenderedEmail = Readonly<{ subject: string; html: string }>;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isJa(locale: string): boolean {
  return locale === "ja";
}

function renderVerification(link: URL, locale: string): RenderedEmail {
  const href = link.toString();
  const safeHref = escapeHtml(href);
  if (isJa(locale)) {
    return {
      subject: "メールアドレスの確認",
      html: `<p>下記のリンクをクリックしてメールアドレスを確認してください。</p><p><a href="${safeHref}">${safeHref}</a></p><p>このリンクに心当たりがない場合は、本メールを破棄してください。</p>`,
    };
  }
  return {
    subject: "Verify your email address",
    html: `<p>Click the link below to verify your email address.</p><p><a href="${safeHref}">${safeHref}</a></p><p>If you did not request this, please ignore this email.</p>`,
  };
}

function renderPasswordReset(link: URL, locale: string): RenderedEmail {
  const href = link.toString();
  const safeHref = escapeHtml(href);
  if (isJa(locale)) {
    return {
      subject: "パスワードリセットのご案内",
      html: `<p>下記のリンクをクリックしてパスワードをリセットしてください。</p><p><a href="${safeHref}">${safeHref}</a></p><p>このリンクに心当たりがない場合は、本メールを破棄してください。</p>`,
    };
  }
  return {
    subject: "Reset your password",
    html: `<p>Click the link below to reset your password.</p><p><a href="${safeHref}">${safeHref}</a></p><p>If you did not request this, please ignore this email.</p>`,
  };
}

function renderEmailChangeNotice(link: URL, locale: string): RenderedEmail {
  const href = link.toString();
  const safeHref = escapeHtml(href);
  if (isJa(locale)) {
    return {
      subject: "メールアドレス変更の確認",
      html: `<p>新しいメールアドレスを確認するため、下記のリンクをクリックしてください。</p><p><a href="${safeHref}">${safeHref}</a></p><p>このリンクに心当たりがない場合は、本メールを破棄してください。</p>`,
    };
  }
  return {
    subject: "Confirm your new email address",
    html: `<p>Click the link below to confirm your new email address.</p><p><a href="${safeHref}">${safeHref}</a></p><p>If you did not request this, please ignore this email.</p>`,
  };
}

function renderEmailChangeWarning(
  oldEmail: EmailAddress,
  newEmail: EmailAddress,
  locale: string,
): RenderedEmail {
  const safeOld = escapeHtml(oldEmail);
  const safeNew = escapeHtml(newEmail);
  if (isJa(locale)) {
    return {
      subject: "メールアドレス変更の通知",
      html: `<p>あなたのアカウントでメールアドレスの変更がリクエストされました。</p><p>変更前: ${safeOld}<br>変更後: ${safeNew}</p><p>このリクエストに心当たりがない場合は、ただちにパスワードを変更し、サポートまでご連絡ください。</p>`,
    };
  }
  return {
    subject: "Your email address change was requested",
    html: `<p>A change of email address has been requested on your account.</p><p>Previous: ${safeOld}<br>New: ${safeNew}</p><p>If you did not request this change, please reset your password immediately and contact support.</p>`,
  };
}
