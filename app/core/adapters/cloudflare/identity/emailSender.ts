import type { Logger } from "@/core/application/ports/logger";
import type { EmailSender } from "@/core/domain/identity/ports/emailSender";
import type { EmailAddress } from "@/core/domain/identity/valueObject";

/**
 * Dev-fallback `EmailSender` implementation that logs each message
 * instead of dispatching to a provider.
 *
 * Rationale. All the identity flows (`SignUp`, `RequestPasswordReset`,
 * `RequestEmailChange`) call `EmailSender.send*` *after* the UoW
 * commits, so a logger-only implementation lets every flow run
 * end-to-end during local development and emits the link to stdout
 * where it can be copy-pasted in tests. This implementation never
 * rejects (the underlying logger cannot fail), so it trivially honours
 * the port contract that send failures surface as a plain rejected
 * `Error` for the usecase to swallow.
 *
 * Production wiring path. The DI layer (`serverCloudflare.ts`) selects
 * `ResendEmailSender` (`adapters/email/resendEmailSender.ts`) when both
 * `RESEND_API_KEY` (secret) and `EMAIL_FROM` (var) are set, and falls
 * back to this class otherwise (either value missing). The four
 * templates are pre-named (`verification`, `password_reset`,
 * `email_change_notice`, `email_change_warning`) so any future
 * template-driven provider (Cloudflare Email Routing, SES, …) can
 * dispatch directly. See `.issue/197/adr.md` ADR-005.
 */
export class ConsoleEmailSender implements EmailSender {
  constructor(private readonly logger: Logger) {}

  async sendVerification(
    to: EmailAddress,
    link: URL,
    locale: string,
  ): Promise<void> {
    this.logger.info("email.verification", {
      to,
      link: link.toString(),
      locale,
    });
  }

  async sendPasswordReset(
    to: EmailAddress,
    link: URL,
    locale: string,
  ): Promise<void> {
    this.logger.info("email.password_reset", {
      to,
      link: link.toString(),
      locale,
    });
  }

  async sendEmailChangeNotice(
    to: EmailAddress,
    link: URL,
    locale: string,
  ): Promise<void> {
    this.logger.info("email.email_change_notice", {
      to,
      link: link.toString(),
      locale,
    });
  }

  async sendEmailChangeWarning(
    oldEmail: EmailAddress,
    newEmail: EmailAddress,
    locale: string,
  ): Promise<void> {
    this.logger.info("email.email_change_warning", {
      oldEmail,
      newEmail,
      locale,
    });
  }
}
