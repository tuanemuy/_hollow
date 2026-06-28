import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailAddress } from "@/core/domain/identity/valueObject";
import { DEFAULT_ENDPOINT, ResendEmailSender } from "../resendEmailSender";

type FetchMock = ReturnType<typeof vi.fn>;

function okResponse(): Response {
  return new Response(JSON.stringify({ id: "abc" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type SentPayload = Readonly<{
  from: string;
  to: string;
  subject: string;
  html: string;
}>;

function captureFetch(response: Response = okResponse()): {
  mock: FetchMock;
  lastCall: () => { url: string; init: RequestInit; body: SentPayload };
} {
  const mock = vi.fn(async (..._args: unknown[]) => response);
  return {
    mock,
    lastCall: () => {
      const calls = mock.mock.calls;
      const last = calls[calls.length - 1] as [string, RequestInit] | undefined;
      if (!last) throw new Error("fetch was not called");
      const [url, init] = last;
      const body = JSON.parse(init.body as string) as SentPayload;
      return { url, init, body };
    },
  };
}

const TO = EmailAddress.create("recipient@example.com");
const OLD_EMAIL = EmailAddress.create("old@example.com");
const NEW_EMAIL = EmailAddress.create("new@example.com");
const LINK = new URL("https://app.example.com/verify?token=abc123");

describe("ResendEmailSender constructor", () => {
  it("rejects an empty apiKey", () => {
    expect(
      () =>
        new ResendEmailSender({
          apiKey: "",
          from: "no-reply@example.com",
        }),
    ).toThrow(/apiKey/);
  });

  it("rejects an empty from", () => {
    expect(
      () =>
        new ResendEmailSender({
          apiKey: "re_test",
          from: "",
        }),
    ).toThrow(/from/);
  });
});

describe("ResendEmailSender.sendVerification", () => {
  it("posts to Resend with correct payload (English default)", async () => {
    const { mock, lastCall } = captureFetch();
    const sender = new ResendEmailSender({
      apiKey: "re_test_key",
      from: "no-reply@example.com",
      fetchImpl: mock as unknown as typeof fetch,
    });

    await sender.sendVerification(TO, LINK, "en");

    const { url, init, body } = lastCall();
    expect(url).toBe(DEFAULT_ENDPOINT);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_test_key");
    expect(headers["content-type"]).toBe("application/json");
    expect(body.from).toBe("no-reply@example.com");
    expect(body.to).toBe(TO);
    expect(body.subject).toMatch(/verify/i);
    expect(body.html).toContain(LINK.toString());
  });

  it("renders Japanese subject + body when locale is 'ja'", async () => {
    const { mock, lastCall } = captureFetch();
    const sender = new ResendEmailSender({
      apiKey: "re_test_key",
      from: "no-reply@example.com",
      fetchImpl: mock as unknown as typeof fetch,
    });

    await sender.sendVerification(TO, LINK, "ja");

    const { body } = lastCall();
    expect(body.subject).toBe("メールアドレスの確認");
    expect(body.html).toContain(LINK.toString());
    expect(body.html).toContain("確認");
  });
});

describe("ResendEmailSender.sendPasswordReset", () => {
  it("posts password reset with link", async () => {
    const { mock, lastCall } = captureFetch();
    const sender = new ResendEmailSender({
      apiKey: "re_test_key",
      from: "no-reply@example.com",
      fetchImpl: mock as unknown as typeof fetch,
    });

    await sender.sendPasswordReset(TO, LINK, "en");

    const { body } = lastCall();
    expect(body.subject).toMatch(/reset.*password/i);
    expect(body.html).toContain(LINK.toString());
  });

  it("renders Japanese password reset when locale is 'ja'", async () => {
    const { mock, lastCall } = captureFetch();
    const sender = new ResendEmailSender({
      apiKey: "re_test_key",
      from: "no-reply@example.com",
      fetchImpl: mock as unknown as typeof fetch,
    });

    await sender.sendPasswordReset(TO, LINK, "ja");

    const { body } = lastCall();
    expect(body.subject).toBe("パスワードリセットのご案内");
  });
});

describe("ResendEmailSender.sendEmailChangeNotice", () => {
  it("posts the new-address confirmation with link", async () => {
    const { mock, lastCall } = captureFetch();
    const sender = new ResendEmailSender({
      apiKey: "re_test_key",
      from: "no-reply@example.com",
      fetchImpl: mock as unknown as typeof fetch,
    });

    await sender.sendEmailChangeNotice(TO, LINK, "en");

    const { body } = lastCall();
    expect(body.to).toBe(TO);
    expect(body.html).toContain(LINK.toString());
    expect(body.subject).toMatch(/email|address/i);
  });

  it("renders Japanese email-change confirmation when locale is 'ja'", async () => {
    const { mock, lastCall } = captureFetch();
    const sender = new ResendEmailSender({
      apiKey: "re_test_key",
      from: "no-reply@example.com",
      fetchImpl: mock as unknown as typeof fetch,
    });

    await sender.sendEmailChangeNotice(TO, LINK, "ja");

    const { body } = lastCall();
    expect(body.subject).toBe("メールアドレス変更の確認");
    expect(body.html).toContain(LINK.toString());
  });
});

describe("ResendEmailSender.sendEmailChangeWarning", () => {
  it("posts the warning to the old address with both addresses in body, no link", async () => {
    const { mock, lastCall } = captureFetch();
    const sender = new ResendEmailSender({
      apiKey: "re_test_key",
      from: "no-reply@example.com",
      fetchImpl: mock as unknown as typeof fetch,
    });

    await sender.sendEmailChangeWarning(OLD_EMAIL, NEW_EMAIL, "en");

    const { body } = lastCall();
    expect(body.to).toBe(OLD_EMAIL);
    expect(body.html).toContain(OLD_EMAIL);
    expect(body.html).toContain(NEW_EMAIL);
    expect(body.html).not.toContain(LINK.toString());
  });

  it("renders Japanese warning when locale is 'ja'", async () => {
    const { mock, lastCall } = captureFetch();
    const sender = new ResendEmailSender({
      apiKey: "re_test_key",
      from: "no-reply@example.com",
      fetchImpl: mock as unknown as typeof fetch,
    });

    await sender.sendEmailChangeWarning(OLD_EMAIL, NEW_EMAIL, "ja");

    const { body } = lastCall();
    expect(body.subject).toBe("メールアドレス変更の通知");
    expect(body.html).toContain(OLD_EMAIL);
    expect(body.html).toContain(NEW_EMAIL);
  });
});

describe("ResendEmailSender error mapping", () => {
  it("throws on HTTP 4xx including the status code", async () => {
    const mock = vi.fn(async () =>
      jsonResponse(403, {
        message: "The from address has not been verified",
      }),
    );
    const sender = new ResendEmailSender({
      apiKey: "re_test_key",
      from: "no-reply@example.com",
      fetchImpl: mock as unknown as typeof fetch,
    });

    await expect(sender.sendVerification(TO, LINK, "en")).rejects.toThrow(
      /API error 403/,
    );
  });

  it("throws on HTTP 5xx including the status code", async () => {
    const mock = vi.fn(async () =>
      jsonResponse(500, { message: "internal error" }),
    );
    const sender = new ResendEmailSender({
      apiKey: "re_test_key",
      from: "no-reply@example.com",
      fetchImpl: mock as unknown as typeof fetch,
    });

    await expect(sender.sendVerification(TO, LINK, "en")).rejects.toThrow(
      /API error 500/,
    );
  });

  it("masks secret-bearing query params in the embedded error body", async () => {
    const mock = vi.fn(async () =>
      jsonResponse(400, {
        message:
          "request to https://api.resend.com/emails?key=fake-secret failed",
      }),
    );
    const sender = new ResendEmailSender({
      apiKey: "re_test_key",
      from: "no-reply@example.com",
      fetchImpl: mock as unknown as typeof fetch,
    });

    try {
      await sender.sendVerification(TO, LINK, "en");
      throw new Error("expected to throw");
    } catch (e) {
      const message = (e as Error).message;
      expect(message).not.toContain("fake-secret");
      expect(message).toMatch(/https:\/\/api\.resend\.com\/emails\?…/);
    }
  });

  it("throws a timeout error when fetch raises AbortError", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const mock = vi.fn(async () => {
      throw abortError;
    });
    const sender = new ResendEmailSender({
      apiKey: "re_test_key",
      from: "no-reply@example.com",
      fetchImpl: mock as unknown as typeof fetch,
    });

    await expect(sender.sendVerification(TO, LINK, "en")).rejects.toThrow(
      /timeout/,
    );
  });

  it("throws a network error when fetch raises TypeError", async () => {
    const mock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const sender = new ResendEmailSender({
      apiKey: "re_test_key",
      from: "no-reply@example.com",
      fetchImpl: mock as unknown as typeof fetch,
    });

    await expect(sender.sendVerification(TO, LINK, "en")).rejects.toThrow(
      /network/,
    );
  });

  it("wraps unexpected non-Error throws as `unexpected error` with maskSecrets applied", async () => {
    // Some runtimes (and library bugs) throw strings or POJOs from
    // `fetch`. The `unexpected error` branch must (1) wrap them in an
    // Error, and (2) run the stringified cause through `maskSecrets`
    // before embedding it in the user-visible message.
    const mock = vi.fn(async () => {
      // Simulated stack that accidentally echoes a Bearer credential
      // (e.g. an undici layer dumping the request headers); intentionally a
      // non-Error throw to exercise the unexpected-throw branch.
      throw "stack trace -- authorization: Bearer re_secret_should_be_masked";
    });
    const sender = new ResendEmailSender({
      apiKey: "re_secret_should_be_masked",
      from: "no-reply@example.com",
      fetchImpl: mock as unknown as typeof fetch,
    });

    try {
      await sender.sendVerification(TO, LINK, "en");
      throw new Error("expected to throw");
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toMatch(/^ResendEmailSender: unexpected error:/);
      expect(message).not.toContain("re_secret_should_be_masked");
    }
  });

  it("falls back to text() and includes the truncated body when the error response is not JSON", async () => {
    // Resend (and most APIs) emit JSON, but a malformed proxy or a
    // 5xx HTML error page can land on the adapter. `extractErrorDetail`
    // must downgrade to `response.text()` and surface a slice in the
    // thrown message so operators get a hint.
    const htmlError = new Response("<html>Bad Gateway</html>", {
      status: 502,
      headers: { "content-type": "text/html" },
    });
    const mock = vi.fn(async () => htmlError);
    const sender = new ResendEmailSender({
      apiKey: "re_test_key",
      from: "no-reply@example.com",
      fetchImpl: mock as unknown as typeof fetch,
    });

    await expect(sender.sendVerification(TO, LINK, "en")).rejects.toThrow(
      /API error 502:.*Bad Gateway/,
    );
  });

  it("html-escapes link and email addresses to keep authentication mails XSS-safe", async () => {
    // Email bodies are rendered as HTML by mail clients. `escapeHtml`
    // is the only defence against malformed/attacker-controlled inputs.
    // Use a link with `&` (a real-world signing parameter) and an
    // address synthesised from the verified value object.
    const { mock, lastCall } = captureFetch();
    const sender = new ResendEmailSender({
      apiKey: "re_test_key",
      from: "no-reply@example.com",
      fetchImpl: mock as unknown as typeof fetch,
    });

    const linkWithAmp = new URL(
      "https://app.example.com/verify?token=abc&next=%2Fadmin",
    );

    await sender.sendVerification(TO, linkWithAmp, "en");

    const { body } = lastCall();
    // `&` in the URL must be escaped in HTML output, otherwise mail
    // clients (and any embedded preview) will mis-parse the link.
    expect(body.html).toContain("token=abc&amp;next=%2Fadmin");
    // The raw `&next` form must not appear unescaped between tags.
    expect(body.html).not.toContain("token=abc&next=");
  });
});

describe("ResendEmailSender default fetch binding", () => {
  // Cloudflare Workers' global `fetch` throws `TypeError: Illegal
  // invocation` when its `this` context is detached, which happens if we
  // assign `fetch` to an instance property and later call it as
  // `this.fetchImpl(...)`. The default fallback must wrap the call so the
  // method-invocation site never sees a bare detached `fetch`.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("invokes the global fetch with the correct `this` binding when fetchImpl is not provided", async () => {
    let receivedThis: unknown = "<not captured>";
    const stub = vi.fn(function fetchStub(this: unknown) {
      receivedThis = this;
      return Promise.resolve(okResponse());
    });
    vi.stubGlobal("fetch", stub);

    const sender = new ResendEmailSender({
      apiKey: "re_test_key",
      from: "no-reply@example.com",
    });
    await sender.sendVerification(TO, LINK, "en");

    expect(stub).toHaveBeenCalledTimes(1);
    // Arrow-wrapper invokes via `globalThis.fetch(...)`, so `this` is
    // `globalThis` — never the `ResendEmailSender` instance.
    expect(receivedThis).toBe(globalThis);
  });
});
