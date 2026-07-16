import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly transporter: Transporter | null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    this.transporter = host
      ? createTransport({ host, port: Number(this.config.get<string>('SMTP_PORT') ?? 587), secure: this.config.get<string>('SMTP_SECURE') === 'true' })
      : null;
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    if (!this.transporter) return;
    const baseUrl = this.config.getOrThrow<string>('PASSWORD_RESET_URL');
    const url = new URL(baseUrl);
    url.searchParams.set('token', token);
    await this.transporter.sendMail({
      from: this.config.getOrThrow<string>('SMTP_FROM'),
      to: email,
      subject: 'Восстановление пароля',
      text: `Чтобы установить новый пароль, откройте ссылку: ${url.toString()}`
    });
  }
}
