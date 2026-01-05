import type { Comment } from "../types/comment";

export const comments: Comment[] = [
  {
    id: "c1a2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6",
    post_id: "1",
    user_id: null,
    content: "Hermosa foto! Me encanta el atardecer",
    user: { username: "maria_dev", avatar: "https://i.pravatar.cc/150?img=1" },
    created_at: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
    updated_at: new Date(Date.now() - 1000 * 60 * 30),
  },
  {
    id: "d2b3c4d5-e6f7-a8b9-c0d1-e2f3a4b5c6d7",
    post_id: "1",
    user_id: null,
    content: "Que colores tan increibles!",
    user: { username: "carlos_code", avatar: "https://i.pravatar.cc/150?img=2" },
    created_at: new Date(Date.now() - 1000 * 60 * 45), // 45 minutes ago
    updated_at: new Date(Date.now() - 1000 * 60 * 45),
  },
  {
    id: "e3c4d5e6-f7a8-b9c0-d1e2-f3a4b5c6d7e8",
    post_id: "2",
    user_id: null,
    content: "Donde es ese lugar? Quiero ir!",
    user: { username: "sofia_photo", avatar: "https://i.pravatar.cc/150?img=5" },
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 2),
  },
  {
    id: "f4d5e6f7-a8b9-c0d1-e2f3-a4b5c6d7e8f9",
    post_id: "3",
    user_id: null,
    content: "El cafe es vida!",
    user: { username: "diego_travel", avatar: "https://i.pravatar.cc/150?img=8" },
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 5),
  },
];
