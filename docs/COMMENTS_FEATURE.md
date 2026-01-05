# Comments Feature Documentation

## Overview

The comments feature allows users to add comments to photo posts in the Suplatzigram application. Comments are stored as a separate model in PostgreSQL using Supabase, following best practices for relational data modeling.

## Architecture

### Database Schema

The `comments` table is defined in `supabase/migrations/20260105000000_create_comments_table.sql`:

```sql
CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    post_id uuid NOT NULL,
    user_id uuid,
    content text NOT NULL,
    "user" jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT comments_post_id_fkey FOREIGN KEY (post_id)
        REFERENCES public.posts_new(id) ON DELETE CASCADE
);
```

#### Column Descriptions

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Unique identifier for the comment (auto-generated) |
| `post_id` | uuid | Reference to the parent post (required, cascading delete) |
| `user_id` | uuid | Reference to the commenting user (nullable for anonymous) |
| `content` | text | The comment text content |
| `user` | jsonb | User display info (username, avatar) for quick access |
| `created_at` | timestamp | When the comment was created |
| `updated_at` | timestamp | When the comment was last updated (auto-updated via trigger) |

#### Indexes

- `comments_post_id_idx` - For efficient lookups by post
- `comments_user_id_idx` - For efficient lookups by user
- `comments_created_at_idx` - For chronological ordering

#### Row Level Security (RLS) Policies

| Policy | Operation | Description |
|--------|-----------|-------------|
| Allow public read | SELECT | Anyone can read comments |
| Allow public insert | INSERT | Anyone can create comments (anonymous supported) |
| Allow update own comments | UPDATE | Only authenticated users can update their own comments |
| Allow delete own comments | DELETE | Only authenticated users can delete their own comments |

### TypeScript Interfaces

Located in `app/types/comment.ts`:

```typescript
interface Comment {
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

interface CreateCommentInput {
  post_id: string;
  content: string;
  user_id?: string | null;
  user?: {
    username: string;
    avatar: string;
  };
}

interface UpdateCommentInput {
  content: string;
}
```

### Service Layer

Located in `app/utils/comments.ts`:

#### Available Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `getCommentsByPostId` | `postId: string` | `Promise<Comment[]>` | Fetch all comments for a post |
| `getCommentCount` | `postId: string` | `Promise<number>` | Get the count of comments for a post |
| `createComment` | `input: CreateCommentInput` | `Promise<Comment \| null>` | Create a new comment |
| `updateComment` | `commentId: string, input: UpdateCommentInput` | `Promise<Comment \| null>` | Update an existing comment |
| `deleteComment` | `commentId: string` | `Promise<boolean>` | Delete a comment |

#### Mock Data Support

The service supports mock data via the `NEXT_PUBLIC_USE_MOCKS=true` environment variable, useful for development and testing without a database connection.

### UI Components

#### CommentsSection

Located in `app/components/CommentsSection.tsx`:

```tsx
<CommentsSection postId={post.id} initialCommentCount={5} />
```

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `postId` | string | Yes | The ID of the post to show comments for |
| `initialCommentCount` | number | No | Initial count to display before loading |

**Features:**

- Expandable/collapsible comments view
- Lazy loading of comments (only fetched when expanded)
- Real-time comment count updates
- Comment input form with character limit (500)
- Responsive design with scrollable comment list

## Usage Examples

### Adding a Comment Programmatically

```typescript
import { createComment } from "@/app/utils/comments";

const newComment = await createComment({
  post_id: "uuid-of-post",
  content: "Great photo!",
  user: {
    username: "john_doe",
    avatar: "https://example.com/avatar.png"
  }
});
```

### Fetching Comments for a Post

```typescript
import { getCommentsByPostId } from "@/app/utils/comments";

const comments = await getCommentsByPostId("uuid-of-post");
console.log(`Found ${comments.length} comments`);
```

### Updating a Comment

```typescript
import { updateComment } from "@/app/utils/comments";

const updated = await updateComment("uuid-of-comment", {
  content: "Updated comment text"
});
```

### Deleting a Comment

```typescript
import { deleteComment } from "@/app/utils/comments";

const success = await deleteComment("uuid-of-comment");
if (success) {
  console.log("Comment deleted");
}
```

## Testing

The feature includes comprehensive tests using Vitest and Testing Library.

### Running Tests

```bash
# Run tests in watch mode
npm test

# Run tests once
npm run test:run

# Run tests with coverage
npm run test:coverage
```

### Test Files

- `tests/comments.test.ts` - Service layer tests (15 tests)
  - Type validation
  - CRUD operations with mock data
  - Edge cases (empty content, long content, special characters)

- `tests/CommentsSection.test.tsx` - Component tests (11 tests)
  - Rendering with different comment counts
  - Expand/collapse behavior
  - Comment submission
  - Input validation
  - Count updates after adding comments

## Database Migration

To apply the comments table migration:

```bash
# If using local Supabase
supabase db push

# Or run the migration manually
supabase migration up
```

## Design Decisions

### UUID for Comment IDs

UUIDs are used instead of sequential integers to:
- Prevent ID enumeration attacks
- Enable offline-first scenarios
- Support distributed systems

### Nullable user_id

The `user_id` column is nullable to support anonymous commenting, consistent with the existing posts model in the application.

### JSONB user Column

User display information is stored as JSONB in the comment record for:
- Faster reads (no JOIN required for display)
- Historical accuracy (username at time of comment)
- Flexibility in user data structure

### Cascading Delete

Comments are automatically deleted when their parent post is deleted via the `ON DELETE CASCADE` constraint.

### Auto-updating updated_at

A PostgreSQL trigger automatically updates the `updated_at` timestamp when a comment is modified.

## Security Considerations

1. **RLS Policies**: Row Level Security is enabled with appropriate policies for public read/insert and authenticated update/delete.

2. **Input Validation**: The UI limits comment length to 500 characters. Additional server-side validation should be considered.

3. **XSS Prevention**: Comment content should be sanitized before display. React's default escaping provides basic protection.

4. **Rate Limiting**: Consider implementing rate limiting for comment creation to prevent spam.

## Future Enhancements

1. **Nested Replies**: Add parent_comment_id for threaded discussions
2. **Reactions**: Add emoji reactions to comments
3. **Mentions**: Support @username mentions with notifications
4. **Rich Text**: Support markdown or rich text formatting
5. **Real-time Updates**: Use Supabase Realtime for live comment updates
