export interface CommentProfile {
  id: string;
  username: string;
  avatar_url: string | null;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string | null;
  profile_id: string | null;
  content: string;
  user?: {
    username: string;
    avatar: string;
  };
  profile?: CommentProfile | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateCommentInput {
  post_id: string;
  content: string;
  user_id: string;
  profile_id: string;
}

export interface UpdateCommentInput {
  content: string;
}
