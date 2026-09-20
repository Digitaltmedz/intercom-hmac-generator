export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  send(msg: EmailMessage): Promise<void>;
}

/** Skriver mejlet i loggen. För utveckling och test. */
export class ConsoleEmailProvider implements EmailProvider {
  public readonly sent: EmailMessage[] = [];
  constructor(private readonly log: (msg: string) => void = console.log) {}
  async send(msg: EmailMessage) {
    this.sent.push(msg);
    this.log(`[email] till ${msg.to}: ${msg.subject}\n${msg.text}`);
  }
}

/** Resend (https://resend.com), enkel HTTP-tjänst för transaktionsmejl. */
export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}
  async send(msg: EmailMessage) {
    const res = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
    });
    if (!res.ok) throw new Error(`Resend svarade ${res.status}: ${await res.text()}`);
  }
}
