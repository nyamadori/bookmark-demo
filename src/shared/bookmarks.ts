export type Bookmark = {
  id: number;
  url: string;
  title: string;
  tags: string;
  memo: string;
  // Local path of the saved OGP image, such as "/ogp/<uuid>.png". Empty when the
  // page had no og:image or the download failed.
  ogpImageUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateBookmarkRequest = {
  url: string;
  tags?: string;
  memo?: string;
};

export type UpdateBookmarkRequest = {
  url: string;
  tags?: string;
  memo?: string;
};

export type ApiError = {
  error: string;
};
