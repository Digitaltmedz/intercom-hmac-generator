import { API_URL } from "./config";
import { getToken } from "./storage";
import type {
  CourseDetail,
  CourseSummary,
  ForumCategory,
  ForumThreadDetail,
  ForumThreadSummary,
  LessonDetail,
  Me,
} from "./types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Listener = (err: ApiError) => void;
const unauthorizedListeners = new Set<Listener>();
/** Låter AuthProvider reagera när servern svarar 401. */
export function onUnauthorized(fn: Listener): () => void {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

async function request<T>(method: string, path: string, body?: unknown, opts: { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth !== false) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, "network", "Ingen kontakt med servern. Kontrollera din uppkoppling.");
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const j = (json ?? {}) as { error?: string; message?: string };
    const err = new ApiError(res.status, j.error ?? "error", j.message ?? `Fel ${res.status}`);
    if (res.status === 401) unauthorizedListeners.forEach((fn) => fn(err));
    throw err;
  }
  return json as T;
}

export const api = {
  requestCode: (email: string) => request<{ ok: boolean; message: string }>("POST", "/auth/request-code", { email }, { auth: false }),
  verifyCode: (email: string, code: string, deviceName?: string) =>
    request<{ token: string; expiresAt: string }>("POST", "/auth/verify-code", { email, code, deviceName }, { auth: false }),
  logout: () => request<{ ok: boolean }>("POST", "/auth/logout"),

  me: () => request<Me>("GET", "/me"),
  refreshEntitlement: () => request<{ entitled: boolean }>("POST", "/me/refresh-entitlement"),
  acceptTerms: () => request<{ ok: boolean }>("POST", "/me/accept-terms"),
  updateName: (name: string) => request<{ ok: boolean }>("PATCH", "/me", { name }),
  registerPushToken: (token: string, platform: "ios" | "android") => request<{ ok: boolean }>("POST", "/me/push-token", { token, platform }),
  deleteAccount: () => request<{ ok: boolean }>("DELETE", "/me"),

  courses: () => request<{ courses: CourseSummary[] }>("GET", "/courses"),
  course: (id: string) => request<CourseDetail>("GET", `/courses/${id}`),
  lesson: (id: string) => request<LessonDetail>("GET", `/lessons/${id}`),
  progress: (lessonId: string, data: { positionSeconds?: number; completed?: boolean }) =>
    request<{ ok: boolean }>("PUT", `/lessons/${lessonId}/progress`, data),

  forumCategories: () => request<{ categories: ForumCategory[] }>("GET", "/forum/categories"),
  forumThreads: (categoryId: string, before?: string) =>
    request<{ threads: ForumThreadSummary[]; nextBefore: string | null }>(
      "GET",
      `/forum/categories/${categoryId}/threads${before ? `?before=${encodeURIComponent(before)}` : ""}`,
    ),
  createThread: (categoryId: string, title: string, body: string) =>
    request<{ id: string }>("POST", `/forum/categories/${categoryId}/threads`, { title, body }),
  thread: (id: string) => request<ForumThreadDetail>("GET", `/forum/threads/${id}`),
  reply: (threadId: string, body: string) => request<{ id: string }>("POST", `/forum/threads/${threadId}/posts`, { body }),
  deletePost: (id: string) => request<{ ok: boolean }>("DELETE", `/forum/posts/${id}`),
  report: (data: { postId?: string; threadId?: string; reason: string }) => request<{ ok: boolean; message: string }>("POST", "/forum/reports", data),
  block: (userId: string) => request<{ ok: boolean }>("POST", `/forum/blocks/${userId}`),
  unblock: (userId: string) => request<{ ok: boolean }>("DELETE", `/forum/blocks/${userId}`),
  blocked: () => request<{ blocked: { id: string; name: string | null }[] }>("GET", "/forum/blocks"),
};
