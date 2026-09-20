/**
 * Klient mot Webbas Website API (Simvoly white label).
 * Dokumentation: https://websitebuilder.app-sources.com/
 * Bas-URL: https://<kundens domän>/api/site
 * Auth: Authorization: Bearer <API-nyckel>, nyckeln finns under
 * Webbplatsinställningar > Integrationer i Webbas.
 */

export interface WebbasAddress {
  name?: string;
  phone?: string;
  companyName?: string;
  companyId?: string;
  country?: string;
  state?: string;
  city?: string;
  zipCode?: string;
  address?: string;
  address2?: string;
}

export interface WebbasMember {
  id: number;
  name: string;
  email: string;
  groups: number[];
  registeredOn: number;
  approved: boolean;
  contactId: number;
  billingAddress?: WebbasAddress;
  shippingAddress?: WebbasAddress;
}

export interface WebbasMemberGroup {
  id: number;
  name: string;
  link: string;
}

export interface WebbasContact {
  id: number;
  name: string;
  email: string;
  phone?: string;
  note?: string;
  createdOn: number;
  properties: { name: string; value: string }[];
  tags: string[];
  memberId?: number;
  subscribed: boolean;
  subscriberLists: number[];
}

export interface WebbasPage<T> {
  totalCount: number;
  limit: number;
  skip: number;
  items: T[];
}

export type WebbasWebhookEvent =
  | "order_created"
  | "order_updated"
  | "product_created"
  | "product_updated"
  | "form_submitted"
  | "contact_updated"
  | "booking_created";

export interface WebbasWebhook {
  id: string;
  target: string;
  secret?: string;
  events: WebbasWebhookEvent[];
}

export interface WebbasSession {
  token: string;
  accessUrl: string;
  createdAt: number;
  expiresAt: number;
}

export class WebbasApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "WebbasApiError";
  }
}

export interface WebbasClientOptions {
  baseUrl: string;
  apiKey: string;
  userAgent?: string;
  fetchImpl?: typeof fetch;
  /** Max antal försök vid 5xx eller nätverksfel. */
  retries?: number;
}

const PAGE_LIMIT = 50;

export class WebbasClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retries: number;

  constructor(opts: WebbasClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.userAgent = opts.userAgent ?? "Kursapp/0.1";
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.retries = opts.retries ?? 2;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    opts: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const res = await this.fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "User-Agent": this.userAgent,
            Accept: "application/json",
            ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        });
        const text = await res.text();
        const json = text ? safeJson(text) : undefined;
        if (res.ok) return json as T;
        const apiMessage =
          json && typeof json === "object" && "message" in json ? String((json as { message: unknown }).message) : "";
        const message = apiMessage || `Webbas API svarade ${res.status}`;
        const err = new WebbasApiError(res.status, message, json);
        if (res.status >= 500 && attempt < this.retries) {
          lastError = err;
          await sleep(250 * 2 ** attempt);
          continue;
        }
        throw err;
      } catch (e) {
        if (e instanceof WebbasApiError) throw e;
        lastError = e;
        if (attempt < this.retries) {
          await sleep(250 * 2 ** attempt);
          continue;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Webbas API: okänt fel");
  }

  // Medlemmar
  listMembers(params: { groupId?: number; limit?: number; skip?: number } = {}) {
    return this.request<WebbasPage<WebbasMember>>("GET", "/members", {
      query: { groupId: params.groupId, limit: params.limit ?? PAGE_LIMIT, skip: params.skip ?? 0 },
    });
  }

  /** Hämtar samtliga medlemmar i en grupp, sida för sida. */
  async listAllMembersInGroup(groupId: number): Promise<WebbasMember[]> {
    const all: WebbasMember[] = [];
    let skip = 0;
    for (;;) {
      const page = await this.listMembers({ groupId, limit: PAGE_LIMIT, skip });
      all.push(...page.items);
      skip += page.items.length;
      if (page.items.length === 0 || skip >= page.totalCount) break;
    }
    return all;
  }

  async findMemberByEmail(email: string): Promise<WebbasMember | null> {
    try {
      return await this.request<WebbasMember>("GET", "/members/search-by-email", { query: { email } });
    } catch (e) {
      if (e instanceof WebbasApiError && e.status === 404) return null;
      throw e;
    }
  }

  async getMember(id: number): Promise<WebbasMember | null> {
    try {
      return await this.request<WebbasMember>("GET", `/members/${id}`);
    } catch (e) {
      if (e instanceof WebbasApiError && e.status === 404) return null;
      throw e;
    }
  }

  listMemberGroups() {
    return this.request<WebbasMemberGroup[]>("GET", "/member-groups");
  }

  /** Skapar en inloggad session i Webbas medlemsområde (webben), giltig 15 min. */
  startMemberSession(email: string, path?: string) {
    return this.request<WebbasSession>("POST", "/members/start-session", { body: { email, path } });
  }

  // Kontakter
  async findContactByEmail(email: string): Promise<WebbasContact | null> {
    try {
      return await this.request<WebbasContact>("GET", "/contacts/search-by-email", { query: { email } });
    } catch (e) {
      if (e instanceof WebbasApiError && e.status === 404) return null;
      throw e;
    }
  }

  // Webhooks
  listWebhooks() {
    return this.request<WebbasWebhook[]>("GET", "/webhooks");
  }

  createWebhook(input: { target: string; secret?: string; events: WebbasWebhookEvent[] }) {
    return this.request<WebbasWebhook>("POST", "/webhooks", { body: input });
  }

  deleteWebhook(id: string) {
    return this.request<{ success: boolean }>("DELETE", `/webhooks/${id}`);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
