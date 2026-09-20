/** Svarstyper från backend (apps/api). Håll i synk med routes/*.ts. */

export interface Me {
  id: string;
  email: string;
  name: string | null;
  role: "member" | "admin";
  entitled: boolean;
  acceptedTerms: boolean;
}

export type LessonKind = "video" | "audio" | "pdf" | "text";

export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
}

export interface LessonSummary {
  id: string;
  title: string;
  kind: LessonKind;
  durationSeconds: number | null;
  completed: boolean;
  positionSeconds: number;
}

export interface CourseDetail extends CourseSummary {
  modules: { id: string; title: string; description: string | null; lessons: LessonSummary[] }[];
}

export interface SignedMedia {
  url: string;
  streamUrl?: string;
  expiresAt: number;
  kind: "video" | "audio" | "pdf" | "image";
  mimeType: string | null;
  durationSeconds: number | null;
}

export interface LessonDetail {
  id: string;
  title: string;
  body: string | null;
  kind: LessonKind;
  durationSeconds: number | null;
  course: { id: string; title: string };
  module: { id: string; title: string };
  media: SignedMedia | null;
  attachments: (SignedMedia & { id: string })[];
  progress: { positionSeconds: number; completed: boolean };
}

export interface ForumCategory {
  id: string;
  title: string;
  description: string | null;
  threadCount: number;
}

export interface ForumAuthor {
  id: string;
  name: string | null;
}

export interface ForumThreadSummary {
  id: string;
  title: string;
  pinned: boolean;
  locked: boolean;
  createdAt: string;
  lastPostAt: string;
  author: ForumAuthor;
  postCount: number;
}

export interface ForumPost {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  author: ForumAuthor;
}

export interface ForumThreadDetail {
  id: string;
  title: string;
  pinned: boolean;
  locked: boolean;
  categoryId: string;
  createdAt: string;
  author: ForumAuthor;
  posts: ForumPost[];
  me: string;
}
