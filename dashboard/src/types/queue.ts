export interface ChannelStatus {
  status: "pending" | "published" | "failed" | "skipped" | "canceled";
  publishedAt: string | null;
  error: string | null;
  mediaId?: string | null;
  tweetId?: string | null;
}

export interface Post {
  id: string;
  text: string;
  status: "draft" | "approved" | "published" | "failed" | "canceled";
  createdAt: string;
  approvedAt?: string;
  scheduledAt?: string;
  publishedAt?: string;
  canceledAt?: string;
  generatedAt?: string;
  imageUrl?: string;
  imageUrls?: string[];
  cardBatchId?: string;
  videoFilename?: string | null;
  videoUrl?: string | null;
  videoThumbnail?: string | null;
  topic?: string;
  model?: string;
  hashtags?: string[];
  tags?: string[];
  seoKeyword?: string;
  channels?: Record<string, ChannelStatus>;
  engagement?: {
    views?: number;
    likes?: number;
    replies?: number;
  };
}

export interface BlogPost {
  id: string;
  title: string;
  body: string;
  content?: string;
  status: "draft" | "approved" | "published" | "failed";
  createdAt: string;
  slug?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeyword?: string;
  blogPostUrl?: string;
  tags?: string[];
}
