import type { Comment } from "../types/comment";

export const comments: Comment[] = [
  {
    id: "c1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6",
    post_id: "1",
    user_id: "user-1",
    profile_id: "profile-1",
    content: "Hermosa foto! Me encanta el atardecer",
    profile: { id: "profile-1", username: "maria_dev", avatar_url: "https://i.pravatar.cc/150?img=1" },
    created_at: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
    updated_at: new Date(Date.now() - 1000 * 60 * 30),
  },
  {
    id: "d2b3c4d5-e6f7-a8b9-c0d1-e2f3a4b5c6d7",
    post_id: "1",
    user_id: "user-2",
    profile_id: "profile-2",
    content: "Que colores tan increibles!",
    profile: { id: "profile-2", username: "carlos_code", avatar_url: "https://i.pravatar.cc/150?img=2" },
    created_at: new Date(Date.now() - 1000 * 60 * 45), // 45 minutes ago
    updated_at: new Date(Date.now() - 1000 * 60 * 45),
  },
  {
    id: "e3c4d5e6-f7a8-b9c0-d1e2-f3a4b5c6d7e8",
    post_id: "2",
    user_id: "user-3",
    profile_id: "profile-3",
    content: "Donde es ese lugar? Quiero ir!",
    profile: { id: "profile-3", username: "sofia_photo", avatar_url: "https://i.pravatar.cc/150?img=5" },
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 2),
  },
  {
    id: "f4d5e6f7-a8b9-c0d1-e2f3-a4b5c6d7e8f9",
    post_id: "3",
    user_id: "user-4",
    profile_id: "profile-4",
    content: "El cafe es vida!",
    profile: { id: "profile-4", username: "diego_travel", avatar_url: "https://i.pravatar.cc/150?img=8" },
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 5),
  },
];
