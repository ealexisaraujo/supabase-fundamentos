# API Contracts: Instagram-Style UI Refinement

**Feature**: 001-tailwind-ui-refactor
**Date**: 2026-01-06

## No API Changes

This feature is a **UI-only refactoring**. No changes are required to:

- Supabase database tables
- Supabase Storage buckets
- API endpoints
- Data fetching utilities

The existing APIs in `app/utils/` remain unchanged:
- `posts.ts` - Post fetching
- `ratings.ts` - Like/rating operations
- `comments.ts` - Comment operations
- `session.ts` - Anonymous session management
- `client.ts` - Supabase client configuration

## Component Contracts

Instead of API contracts, this feature defines **component contracts** (props interfaces) documented in [data-model.md](../data-model.md):

- `IconProps` - Shared icon component interface
- `PostCardProps` - Post card component props
- `PostModalProps` - Post modal component props

These TypeScript interfaces serve as the contracts for component interoperability.
