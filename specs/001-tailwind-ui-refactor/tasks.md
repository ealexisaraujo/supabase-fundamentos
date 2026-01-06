# Tasks: Instagram-Style UI Refinement

**Input**: Design documents from `/specs/001-tailwind-ui-refactor/`
**Prerequisites**: plan.md, spec.md, data-model.md, research.md, quickstart.md

**Tests**: No test tasks included - tests were not explicitly requested in the feature specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: Next.js App Router structure
- **Components**: `app/components/`
- **Pages**: `app/`, `app/post/`, `app/rank/`
- **Icons**: `app/components/icons/`

---

## Phase 1: Setup (Shared Infrastructure) ✅

**Purpose**: Create shared icon components and barrel exports used across all user stories

- [x] T001 Create icons directory at app/components/icons/
- [x] T002 [P] Create HeartIcon component with filled/outlined variants in app/components/icons/HeartIcon.tsx
- [x] T003 [P] Create CommentIcon component with filled/outlined variants in app/components/icons/CommentIcon.tsx
- [x] T004 [P] Create ShareIcon component with filled/outlined variants in app/components/icons/ShareIcon.tsx
- [x] T005 [P] Create HomeIcon component with filled/outlined variants in app/components/icons/HomeIcon.tsx
- [x] T006 [P] Create PlusIcon component in app/components/icons/PlusIcon.tsx
- [x] T007 [P] Create RankIcon component with filled/outlined variants in app/components/icons/RankIcon.tsx
- [x] T008 [P] Create CloseIcon component in app/components/icons/CloseIcon.tsx
- [x] T009 Create barrel export file at app/components/icons/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites) ✅

**Purpose**: Extract shared components that multiple user stories depend on

**⚠️ CRITICAL**: User Story phases depend on these components being available

- [x] T010 Create PostCard component extracting logic from app/page.tsx into app/components/PostCard.tsx
- [x] T011 Create PostModal component extracting logic from app/rank/page.tsx into app/components/PostModal.tsx
- [x] T012 Enhance Skeletons with animate-pulse in app/components/Skeletons.tsx

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 4 - Navigate Between Pages (Priority: P1) 🎯 MVP ✅

**Goal**: Provide seamless navigation between Home, Create Post, and Ranking pages via fixed bottom navigation bar

**Independent Test**: Tap each navigation item and verify page transitions with correct active states

### Implementation for User Story 4

- [x] T013 [US4] Refactor BottomNav to use extracted icon components in app/components/BottomNav.tsx
- [x] T014 [US4] Update BottomNav styling to match design mockups (fixed bottom, centered plus button with gradient) in app/components/BottomNav.tsx
- [x] T015 [US4] Ensure active navigation states show filled icons vs outlined in app/components/BottomNav.tsx
- [x] T016 [US4] Verify BottomNav is included in layout and visible on all pages in app/layout.tsx

**Checkpoint**: Navigation should work across all pages with correct visual states

---

## Phase 4: User Story 1 - Browse Home Feed (Priority: P1) 🎯 MVP ✅

**Goal**: Display visually appealing feed of posts with user info, images, and social interactions

**Independent Test**: Load home page and scroll through posts, verify post cards display correctly with like functionality

### Implementation for User Story 1

- [x] T017 [US1] Refactor app/page.tsx to import and use PostCard component
- [x] T018 [US1] Update home page header styling to match design (centered "Suplatzigram" branding) in app/page.tsx
- [x] T019 [US1] Ensure PostCard displays all elements: avatar with ring, username, timestamp, image, action icons, likes, caption in app/components/PostCard.tsx
- [x] T020 [US1] Verify HeartIcon toggle works with red fill on like state in app/components/PostCard.tsx
- [x] T021 [US1] Confirm infinite scroll works with loading skeletons in app/page.tsx
- [x] T022 [US1] Verify CommentsSection displays correctly in PostCard in app/components/CommentsSection.tsx

**Checkpoint**: Home feed should be fully functional with Instagram-style post cards

---

## Phase 5: User Story 2 - View Ranking Page (Priority: P2) ✅

**Goal**: Display popular posts in 3-column grid with modal detail view

**Independent Test**: Navigate to /rank, view grid, tap image to open modal, close modal

### Implementation for User Story 2

- [x] T023 [US2] Refactor app/rank/page.tsx to use extracted PostModal component
- [x] T024 [US2] Update ranking page header styling to match design in app/rank/page.tsx
- [x] T025 [US2] Ensure 3-column grid layout displays correctly in app/rank/page.tsx
- [x] T026 [US2] Verify hover overlay shows like count on grid images in app/rank/page.tsx
- [x] T027 [US2] Ensure PostModal displays full post detail with user info, image, likes, caption in app/components/PostModal.tsx
- [x] T028 [US2] Verify modal closes on X click, backdrop click, and Escape key in app/components/PostModal.tsx
- [x] T029 [US2] Confirm loading skeletons display during data fetch in app/rank/page.tsx

**Checkpoint**: Ranking page should show grid and modal functionality

---

## Phase 6: User Story 3 - Create New Post (Priority: P2) ✅

**Goal**: Provide intuitive image upload and caption interface

**Independent Test**: Navigate to /post, upload image, add caption, publish, verify success message

### Implementation for User Story 3

- [x] T030 [US3] Update create post header styling to match design in app/post/page.tsx
- [x] T031 [US3] Enhance image upload area with dashed border, camera icon, instructional text in app/post/page.tsx
- [x] T032 [US3] Ensure image preview displays with CloseIcon remove button in app/post/page.tsx
- [x] T033 [US3] Update caption textarea styling with proper placeholder in app/post/page.tsx
- [x] T034 [US3] Update "Publicar" button with gradient styling in app/post/page.tsx
- [x] T035 [US3] Verify loading spinner shows during submission in app/post/page.tsx
- [x] T036 [US3] Ensure success/error messages display with proper styling in app/post/page.tsx

**Checkpoint**: Create post flow should work end-to-end with proper visual feedback

---

## Phase 7: Polish & Cross-Cutting Concerns ✅

**Purpose**: Final styling adjustments, edge cases, and validation

- [x] T037 [P] Verify dark mode works correctly across all pages by checking CSS variable usage
- [x] T038 [P] Handle edge case: post with no caption displays username only in app/components/PostCard.tsx
- [x] T039 [P] Handle edge case: ranking page with no posts shows empty state message in app/rank/page.tsx
- [x] T040 [P] Handle edge case: image load failure shows placeholder styling in app/components/PostCard.tsx
- [x] T041 Review all component styling against design mockups for consistency
- [x] T042 Run quickstart.md verification checklist

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US4 (Navigation) and US1 (Home Feed) are both P1 - can run in parallel
  - US2 (Ranking) and US3 (Create Post) are both P2 - can run in parallel after P1
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 4 (Navigation)**: Can start after Foundational - No dependencies on other stories
- **User Story 1 (Home Feed)**: Can start after Foundational - No dependencies on other stories
- **User Story 2 (Ranking)**: Can start after Foundational - Uses PostModal from Foundational
- **User Story 3 (Create Post)**: Can start after Foundational - Uses CloseIcon from Setup

### Parallel Opportunities

- All icon components (T002-T008) can be created in parallel
- PostCard (T010) and PostModal (T011) can be created in parallel
- US4 and US1 (both P1) can be worked on in parallel
- US2 and US3 (both P2) can be worked on in parallel
- All Polish tasks marked [P] can run in parallel

---

## Parallel Example: Setup Phase Icons

```bash
# Launch all icon creation tasks together:
Task: "Create HeartIcon component in app/components/icons/HeartIcon.tsx"
Task: "Create CommentIcon component in app/components/icons/CommentIcon.tsx"
Task: "Create ShareIcon component in app/components/icons/ShareIcon.tsx"
Task: "Create HomeIcon component in app/components/icons/HomeIcon.tsx"
Task: "Create PlusIcon component in app/components/icons/PlusIcon.tsx"
Task: "Create RankIcon component in app/components/icons/RankIcon.tsx"
Task: "Create CloseIcon component in app/components/icons/CloseIcon.tsx"
```

## Parallel Example: Foundational Phase

```bash
# Launch component extraction tasks together:
Task: "Create PostCard component in app/components/PostCard.tsx"
Task: "Create PostModal component in app/components/PostModal.tsx"
Task: "Enhance Skeletons with animate-pulse in app/components/Skeletons.tsx"
```

---

## Implementation Strategy

### MVP First (User Stories 4 + 1 Only)

1. Complete Phase 1: Setup (icon components)
2. Complete Phase 2: Foundational (PostCard, PostModal, Skeletons)
3. Complete Phase 3: User Story 4 (Navigation)
4. Complete Phase 4: User Story 1 (Home Feed)
5. **STOP and VALIDATE**: Test navigation and home feed independently
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 4 (Navigation) → Test → Deploy/Demo
3. Add User Story 1 (Home Feed) → Test → Deploy/Demo (MVP!)
4. Add User Story 2 (Ranking) → Test → Deploy/Demo
5. Add User Story 3 (Create Post) → Test → Deploy/Demo
6. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- This is a UI-only refactor - no database or API changes required
