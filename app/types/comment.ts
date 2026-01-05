export interface Comment {
  id: string;
  post_id: string;
  user_id: string | null;
  content: string;
  user?: {
    username: string;
    avatar: string;
  };
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateCommentInput {
  post_id: string;
  content: string;
  user_id?: string | null;
  user?: {
    username: string;
    avatar: string;
  };
}

export interface UpdateCommentInput {
  content: string;
}
