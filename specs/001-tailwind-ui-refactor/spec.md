# Feature Specification: Instagram-Style UI Refinement

**Feature Branch**: `001-tailwind-ui-refactor`
**Created**: 2026-01-06
**Status**: Draft
**Input**: User description: "We want to use Tailwind CSS, please help me to create a proper way to install and refactor the application using this new design"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse Home Feed (Priority: P1)

A user opens the application and wants to scroll through a visually appealing feed of posts in an Instagram-style layout, with clear user information, engaging images, and social interaction options.

**Why this priority**: The home feed is the primary entry point and core experience of the application. Users spend most of their time here.

**Independent Test**: Can be fully tested by loading the home page and scrolling through posts. Delivers the core value of content discovery.

**Acceptance Scenarios**:

1. **Given** a user opens the app, **When** the home page loads, **Then** they see a clean header with "Suplatzigram" branding centered at the top
2. **Given** a user is on the home feed, **When** posts load, **Then** each post card displays: user avatar with border ring, username, time ago, full-width image, like/comment/share icons row, like count, caption with username prefix, and comments section
3. **Given** a user is viewing posts, **When** they scroll down, **Then** additional posts load automatically with a smooth loading indicator
4. **Given** a user sees a post, **When** they tap the heart icon, **Then** the icon fills with red color and the like count updates immediately

---

### User Story 2 - View Ranking Page (Priority: P2)

A user navigates to the Ranking page to discover the most popular posts displayed in an attractive grid layout, with the ability to view post details.

**Why this priority**: The ranking page drives engagement by showcasing top content and encourages users to create quality posts.

**Independent Test**: Can be fully tested by navigating to /rank and interacting with the image grid. Delivers discovery value.

**Acceptance Scenarios**:

1. **Given** a user navigates to Ranking, **When** the page loads, **Then** they see a 3-column masonry-style grid of post images
2. **Given** a user is viewing the ranking grid, **When** they hover over an image, **Then** they see a semi-transparent overlay with the like count
3. **Given** a user taps on an image in the grid, **When** the modal opens, **Then** they see the full post detail including user info, larger image, like button, caption, and comments
4. **Given** a user is viewing a post modal, **When** they tap the X button or outside the modal, **Then** the modal closes and they return to the grid view

---

### User Story 3 - Create New Post (Priority: P2)

A user wants to share a new photo with a caption through an intuitive upload interface.

**Why this priority**: Content creation is essential for the platform's growth and user engagement loop.

**Independent Test**: Can be fully tested by navigating to /post, uploading an image, adding a caption, and publishing. Delivers content creation value.

**Acceptance Scenarios**:

1. **Given** a user navigates to Create Post, **When** the page loads, **Then** they see a clean form with a dashed-border image upload area, camera icon, and instructional text
2. **Given** a user has not selected an image, **When** they tap the upload area, **Then** they can select an image from their device
3. **Given** a user has selected an image, **When** the preview displays, **Then** they see the image with an X button to remove it, and a text area for the caption
4. **Given** a user has filled the form, **When** they tap "Publicar", **Then** they see a loading state and success message upon completion

---

### User Story 4 - Navigate Between Pages (Priority: P1)

A user wants to easily navigate between Home, Create Post, and Ranking pages using a persistent bottom navigation bar.

**Why this priority**: Navigation is fundamental to app usability and must work seamlessly across all pages.

**Independent Test**: Can be fully tested by tapping each navigation item and verifying page transitions. Delivers core navigation value.

**Acceptance Scenarios**:

1. **Given** a user is on any page, **When** they look at the bottom of the screen, **Then** they see a fixed navigation bar with Home, Plus (create), and Rank icons
2. **Given** a user is on the home page, **When** they look at navigation, **Then** the Home icon is highlighted/filled to indicate active state
3. **Given** a user taps the center plus button, **When** the transition completes, **Then** they are on the Create Post page
4. **Given** a user is on any page, **When** they tap a navigation item, **Then** the page transitions smoothly without full page reload

---

### Edge Cases

- What happens when a post has no caption? Display only the username without trailing text.
- What happens when a post image fails to load? Display a placeholder with appropriate styling.
- What happens when the user has no network connection? Show cached content if available, with an offline indicator.
- What happens when the ranking page has no posts meeting the minimum likes threshold? Display an empty state message.
- What happens when image upload fails? Show clear error message with retry option.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a sticky header on all pages with centered page title/branding
- **FR-002**: System MUST display post cards with: circular user avatar (with decorative ring), username, relative timestamp, full-width image, action icons row (heart, comment, share), like count, and caption
- **FR-003**: System MUST provide a 3-column image grid on the Ranking page
- **FR-004**: System MUST show hover/tap overlays on ranking grid images displaying like count
- **FR-005**: System MUST display post details in a centered modal overlay when a ranking image is tapped
- **FR-006**: System MUST provide an image upload area with dashed border, camera icon, and instructional text
- **FR-007**: System MUST show image preview with remove button after selection
- **FR-008**: System MUST provide a text area for post captions with placeholder text
- **FR-009**: System MUST display a fixed bottom navigation bar with Home, Create (centered, prominent), and Rank icons
- **FR-010**: System MUST indicate the active navigation item visually (filled vs outlined icons)
- **FR-011**: System MUST display loading skeletons while content is being fetched
- **FR-012**: System MUST support infinite scroll on the home feed
- **FR-013**: System MUST provide visual feedback for like button interactions (filled heart, color change)
- **FR-014**: System MUST display success/error messages for post creation with appropriate styling

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All three main pages (Home, Ranking, Create Post) render consistently with the design mockups provided
- **SC-002**: Users can complete post creation flow (upload image, add caption, publish) in under 60 seconds
- **SC-003**: Navigation between pages takes less than 300ms perceived transition time
- **SC-004**: Post cards display all required elements (avatar, username, timestamp, image, actions, likes, caption) correctly
- **SC-005**: The ranking grid displays images in a responsive 3-column layout on mobile viewports
- **SC-006**: Modal overlays properly center on screen and close via X button or outside click
- **SC-007**: Active navigation states are visually distinguishable from inactive states
- **SC-008**: Loading states appear immediately when content is being fetched
- **SC-009**: 100% of form validation errors display clear, user-friendly messages

## Assumptions

- The application already has Tailwind CSS v4 installed and configured (confirmed from globals.css)
- The design follows a mobile-first approach with a max-width constraint for larger screens
- The color scheme uses the existing CSS custom properties (--primary, --accent, --background, etc.)
- Spanish language will be used for UI text (matching existing implementation)
- The existing component structure will be preserved and enhanced, not replaced entirely
- Dark mode support via `prefers-color-scheme` media query is already in place and should be maintained
