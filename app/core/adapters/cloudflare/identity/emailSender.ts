import type { Logger } from "@/core/application/ports/logger";
import type { EmailSender } from "@/core/domain/identity/ports/emailSender";
import type { EmailAddress } from "@/core/domain/identity/valueObject";

/**
 * MVP `EmailSender` implementation that logs each message instead of
 * dispatching to a provider.
 *
 * Rationale. The MVP does not yet wire a transactional-email provider
 * (Resend / SES / etc.). All the identity flows (`SignUp`, `RequestPassword
 * Reset`, `RequestEmailChange`) call `EmailSender.send*` *after* the UoW
 * commits, so a logger-only implementation lets every flow run end-to-end
 * during development and emits the link to stdout where it can be
 * copy-pasted in tests. Failures are swallowed (the underlying logger
 * cannot fail) so this implementation satisfies the port's "errors map
 * to `EmailSendError` at the application layer" contract trivially —
 * it never raises one.
 *
 * Production wiring path. Replace this class with a provider-backed
 * implementation (Resend HTTP API or Cloudflare Email Routing) under the
 * same port. The four templates are pre-named (`verification`,
 * `password_reset`, `email_change_notice`, `email_change_warning`) so a
 * template-driven provider can dispatch directly.
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
