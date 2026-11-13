# DR.COLLAB --- Cursor Master Project Plan

## 1. PROJECT OVERVIEW

### Product Name

dr.collab

### Product Type

Influencer / creator-brand collaboration marketplace.

### Core Idea

dr.collab connects brands with creators so brands can discover creators,
create campaigns, communicate, agree on campaign terms, manage
deliverables, and handle campaign payments in one platform.

### Current Business Model

-   No commission is charged by dr.collab in the current MVP.
-   The platform may introduce monetization later.
-   Do not implement a commission system unless explicitly requested.

### Primary Users

1.  Brand
2.  Creator

### Core Product Goal

Create a simple, premium marketplace where: - Brands can discover and
collaborate with creators. - Creators can discover and apply to
campaigns. - Brands can privately invite selected creators. - Both sides
can communicate inside dr.collab. - Both sides can create and sign
campaign agreements. - dr.collab holds the agreed fixed/initial payment
until the creator completes the required deliverable. -
View/performance-based additional payments are paid directly by the
brand to the creator and are not held by dr.collab in the current MVP.

------------------------------------------------------------------------

# 2. IMPORTANT PRODUCT PRINCIPLES

-   Keep the product simple and easy to understand.
-   Prioritize the MVP.
-   Do not add unnecessary features.
-   Do not introduce commission/fee calculations.
-   Do not implement features that are not described in this document
    unless explicitly requested.
-   The brand and creator experiences should feel like two sides of the
    same marketplace.
-   The UI must be premium, minimal, clean and highly usable.
-   Use the supplied dr.collab logo.
-   Follow the supplied visual reference image for the design direction.

------------------------------------------------------------------------

# 3. DESIGN SYSTEM

## Visual Direction

The supplied reference uses:

-   White background.
-   Black typography.
-   Minimal monochrome design.
-   Large whitespace.
-   Elegant typography.
-   Thin/light borders.
-   Rounded cards.
-   Black primary buttons.
-   White text inside primary black buttons.
-   Simple black line icons.
-   Premium editorial/SaaS aesthetic.
-   No unnecessary gradients.
-   No excessive colors.
-   No visual clutter.

### Brand Logo

Use the supplied dr.collab logo:

`dr.collab`

The logo should be displayed as a clean text-based wordmark.

Do not redesign the logo unless explicitly requested.

### Color Direction

Primary: - Black - White

Supporting: - Very light gray for borders/background sections. - Dark
gray for secondary text.

Avoid bright accent colors unless specifically required.

### UI Principles

-   Generous spacing.
-   Strong typography hierarchy.
-   Rounded but not excessively rounded components.
-   Clear CTAs.
-   Consistent button styles.
-   Responsive layout.
-   Mobile-first consideration.
-   Accessible contrast.
-   Clean empty states.
-   Clean loading states.
-   Clean error states.

------------------------------------------------------------------------

# 4. HIGH-LEVEL WEBSITE STRUCTURE

The application has three major experiences:

1.  Public website / landing page
2.  Brand application
3.  Creator application

There may also be an internal admin system later, but admin
functionality is OUT OF SCOPE for the first implementation unless
explicitly requested.

------------------------------------------------------------------------

# 5. PUBLIC LANDING PAGE

When a visitor first opens the website, they should see the dr.collab
landing page.

## Landing Page Goals

Explain:

-   What dr.collab is.
-   The problem it solves.
-   How it works.
-   Benefits for brands.
-   Benefits for creators.
-   Main features.
-   Campaign workflow.
-   Payment workflow.
-   Call-to-action to sign up.
-   Sign in option.

## Suggested Landing Page Sections

### Header

Left: - dr.collab logo

Right: - How it works - For Brands - For Creators - Features - Sign in -
Sign up

Primary CTA: - Get started

### Hero

Example direction:

"Where brands and creators build better collaborations."

Supporting text explaining that dr.collab helps brands discover creators
and manage collaborations from discovery to completion.

CTA: - Get started - Explore how it works

### How It Works

Show a simple workflow:

Brand: Discover creator → Start collaboration → Agree → Create campaign
→ Pay → Complete

Creator: Discover campaign → Apply → Agree → Create content → Submit →
Get paid

### Brand Benefits

-   Discover creators.
-   Filter creators.
-   Create public campaigns.
-   Privately invite creators.
-   Message creators.
-   Create campaign agreements.
-   Manage campaign payments.
-   Track active campaigns.

### Creator Benefits

-   Discover campaigns.
-   Filter campaigns.
-   Apply to campaigns.
-   Receive private invitations.
-   Message brands.
-   Review agreements.
-   Submit work.
-   Request payment.

### Features

-   Creator discovery
-   Campaign marketplace
-   Public/private campaigns
-   Messaging
-   Campaign management
-   Agreements
-   E-signature workflow
-   Payment management
-   Creator profiles
-   Brand profiles

### Final CTA

"Start collaborating with dr.collab."

Buttons: - Join as Creator - Join as Brand

------------------------------------------------------------------------

# 6. AUTHENTICATION

Both creators and brands must be able to:

-   Sign up.
-   Sign in.
-   Sign out.
-   Recover/reset password.
-   Use Google authentication.
-   Use phone number authentication if supported by the selected
    authentication provider.

## Registration Flow

Landing page → Sign up → Choose role → Authentication → Onboarding
questions → Profile setup → Dashboard

## Role Selection

The user must select:

-   Creator
-   Brand

The role must be stored in the authenticated user account.

A user must not be able to access the wrong dashboard.

------------------------------------------------------------------------

# 7. BRAND ONBOARDING

After brand authentication, ask onboarding questions.

## Questions

-   What is your niche/industry?
-   What is your company/employee size?
-   Which social platforms do you want content for?
-   What is your role in the company?

Additional useful onboarding information may be collected if necessary.

After onboarding, send the user to the brand profile setup page.

------------------------------------------------------------------------

# 8. BRAND PROFILE

Brand profile should include:

-   Company name
-   Company logo
-   Website URL
-   Industry/niche
-   Social media URLs
    -   Instagram
    -   YouTube
    -   TikTok
    -   Other supported platforms
-   Short business description
-   Employee/company size
-   Contact/role information where appropriate

The brand should be able to:

-   View profile.
-   Edit profile.
-   Update social links.
-   Update company information.

A brand should only be able to edit its own profile.

After profile completion, send the user to the Brand Dashboard.

------------------------------------------------------------------------

# 9. BRAND DASHBOARD

The brand dashboard has these primary sections:

1.  Home
2.  Messages
3.  Campaigns
4.  Payments
5.  Profile

------------------------------------------------------------------------

# 10. BRAND HOME --- CREATOR DISCOVERY

The Brand Home page is the creator discovery marketplace.

Display creator cards.

Each creator card can show:

-   Creator name
-   Profile image
-   Main niche
-   Social platforms
-   Follower count
-   Engagement rate if available
-   Short bio
-   Starting price / pricing information if available
-   View profile
-   Message / invite action

## Filters

Brands should be able to filter creators by:

-   Follower count
-   Social media platform
-   Niche

## Search

Brands can search creators by name.

## Creator Profile

When a brand opens a creator profile, display:

-   Creator name
-   Bio
-   Profile image
-   Niche
-   Social platforms
-   Social media URLs
-   Followers
-   Engagement information
-   Previous work/collaborations where available
-   Pricing information where available
-   Message button
-   Invite to private campaign button where appropriate

------------------------------------------------------------------------

# 11. BRAND CAMPAIGNS

Brand campaign page should show:

-   Active campaigns
-   Pending campaigns
-   Completed campaigns
-   Expired campaigns

## Create Campaign

A brand can create a campaign.

Required information:

-   Campaign title
-   Product name
-   Product details
-   Campaign description
-   Campaign niche
-   Social media platform
-   Estimated campaign price
-   Number of creators/campaign slots
-   Campaign start date
-   Campaign end/valid date
-   Deliverable requirements
-   Additional campaign instructions

## Campaign Visibility

There are two campaign types:

### Public Campaign

Any eligible creator can:

-   View the campaign.
-   Apply to the campaign.

Brand can review applications and select creators.

### Private Campaign

The campaign is not publicly available to all creators.

Brand can:

-   Search/filter creators.
-   Select a creator.
-   Send a private campaign invitation.

The selected creator can:

-   Receive the invitation.
-   Review campaign details.
-   Message the brand.
-   Accept or reject the invitation.

------------------------------------------------------------------------

# 12. PUBLIC CAMPAIGN WORKFLOW

Example:

A gym brand wants a creator to promote a fitness product.

Flow:

Brand → Create public campaign → Campaign becomes visible to creators →
Creator discovers campaign → Creator applies → Brand receives
application → Brand reviews creator → Brand messages creator → Brand
selects creator → Agreement process → Initial payment → Creator
completes content → Creator uploads/submits work → Brand reviews →
Creator requests initial payment → dr.collab releases held initial payment
→ Campaign continues until valid date → Performance/view-based payments
handled directly between brand and creator

------------------------------------------------------------------------

# 13. PRIVATE CAMPAIGN WORKFLOW

Brand → Create campaign → Choose private → Search creators → Filter
creators → Select creator → Send private invitation → Creator receives
invitation → Creator reviews campaign → Messaging → Creator
accepts/rejects → Agreement → Payment → Content creation → Submission →
Payment release

------------------------------------------------------------------------

# 14. BRAND MESSAGING

Brand messaging page should allow brands to communicate with:

-   Creators they are collaborating with.
-   Creators who applied to their campaigns.
-   Creators they privately invited.

Messaging should be contextual to the campaign where possible.

Conversation should show:

-   User name
-   Profile image
-   Campaign context
-   Messages
-   Timestamp
-   Message input
-   Send button

Do not expose sensitive system information.

------------------------------------------------------------------------

# 15. AGREEMENT WORKFLOW

An agreement can be created after the brand and creator agree to
collaborate.

Brand clicks:

"Create Agreement"

## Agreement Information

The agreement should include:

-   Company name
-   Company information
-   Product name
-   Product details
-   Creator name
-   Campaign name
-   Campaign validity/start date
-   Campaign expiry date
-   Deliverables
-   Platform
-   Content requirements
-   Initial/one-time payment
-   Performance/view-based payment terms
-   Additional conditions
-   Other agreed campaign terms

## Agreement Generation

The system generates a PDF agreement from the provided information.

The creator can:

-   View agreement.
-   Download agreement.
-   E-sign agreement.
-   Submit signed agreement back to the brand.

The brand can:

-   View agreement status.
-   Download the agreement.
-   Access the signed version.

Possible statuses:

-   Draft
-   Sent
-   Viewed
-   Creator signed
-   Brand signed if required
-   Active
-   Completed
-   Expired

------------------------------------------------------------------------

# 16. PAYMENT MODEL

IMPORTANT:

The current MVP DOES NOT charge commission.

dr.collab acts as a payment holding/release mechanism only for the agreed
initial payment.

## Initial / Fixed Payment

During agreement creation:

Brand agrees to an initial payment.

Brand pays the initial amount to dr.collab.

The money is held.

Creator completes the required deliverable.

Creator uploads/submits the content.

Creator requests payment.

After the required approval/conditions are met:

dr.collab releases the held initial payment to the creator.

## Performance / View-Based Payment

If the agreement contains additional payment based on:

-   Views
-   Performance
-   Other agreed metrics

Then:

Brand pays that additional amount directly to the creator.

dr.collab does NOT hold this performance-based payment in the current MVP.

## Important

Do not implement automatic commission deduction.

Do not add platform fees.

Do not deduct money from creator or brand unless explicitly requested.

------------------------------------------------------------------------

# 17. BRAND PAYMENT PAGE

Brand payment page should show campaign-related payment information.

Display:

-   Campaign name
-   Creator
-   Initial payment amount
-   Payment status
-   Agreement status
-   Payment date
-   Release status

Actions:

-   Pay initial campaign amount
-   View payment details
-   View agreement
-   View campaign

The brand should clearly understand which amount is being held by
dr.collab.

------------------------------------------------------------------------

# 18. CREATOR DASHBOARD

Creator dashboard has:

1.  Home
2.  Messages
3.  Payments
4.  My Work
5.  Profile

------------------------------------------------------------------------

# 19. CREATOR HOME --- CAMPAIGN DISCOVERY

Creator Home displays available public campaigns.

Campaign cards should show:

-   Campaign title
-   Company name
-   Product
-   Product/category
-   Niche
-   Platform
-   Price
-   Campaign deadline
-   Short description
-   View campaign
-   Apply

## Filters

Creators can filter campaigns by:

-   Niche
-   Price
-   Social media platform

## Search

Creators can search campaigns by:

-   Company name
-   Campaign name

------------------------------------------------------------------------

# 20. CREATOR CAMPAIGN DETAILS

Campaign details should include:

-   Brand/company
-   Campaign title
-   Product
-   Product details
-   Campaign description
-   Niche
-   Platform
-   Deliverables
-   Initial payment
-   Performance/view payment
-   Campaign dates
-   Requirements
-   Application deadline
-   Number of creators if applicable

Actions:

-   Apply
-   Message brand where appropriate

------------------------------------------------------------------------

# 21. CREATOR PRIVATE INVITATIONS

A creator may receive a private campaign invitation.

The creator should be able to:

-   View invitation.
-   View campaign details.
-   View brand profile.
-   Message brand.
-   Accept invitation.
-   Reject invitation.

If accepted:

→ Agreement process begins.

------------------------------------------------------------------------

# 22. CREATOR MESSAGING

Creator messaging should work similarly to brand messaging.

Creators can message:

-   Brands whose campaigns they applied to.
-   Brands who invited them.
-   Brands they are actively collaborating with.

Messages should be linked to a campaign whenever possible.

------------------------------------------------------------------------

# 23. CREATOR PAYMENT PAGE

Creator payment page shows:

-   Active payment requests.
-   Pending payments.
-   Released payments.
-   Completed payments.

For initial held payments:

Creator can:

-   View campaign.
-   View agreement.
-   Submit/request payment after completing the required work.

For performance/view-based payments:

Creator can see the agreed terms.

The actual performance payment is paid directly by the brand in the
current MVP.

------------------------------------------------------------------------

# 24. CREATOR MY WORK

"My Work" contains all creator campaign activities.

Possible statuses:

-   Applied
-   Invited
-   Accepted
-   Agreement pending
-   Agreement signed
-   Payment pending
-   Active
-   Content submitted
-   Payment requested
-   Completed
-   Rejected
-   Expired

Each campaign should show:

-   Brand
-   Product
-   Campaign
-   Status
-   Dates
-   Payment information
-   Agreement
-   Deliverable submission

------------------------------------------------------------------------

# 25. CONTENT SUBMISSION

Creator should be able to submit campaign work.

Possible submission:

-   Video/content upload
-   Social media URL
-   Caption/details
-   Submission note

The exact file storage provider can be decided during technical
planning.

The brand should be able to review the submitted content.

------------------------------------------------------------------------

# 26. CAMPAIGN EXPIRY

Every campaign has a validity/end date.

When the valid date ends:

-   Campaign becomes expired.
-   New applications should no longer be accepted.
-   Private invitations should no longer be accepted if the campaign has
    expired.
-   The campaign should remain visible in historical records.
-   Existing campaign records should not be deleted automatically.

------------------------------------------------------------------------

# 27. CAMPAIGN STATUS MODEL

Recommended campaign states:

``` text
DRAFT
PUBLIC
PRIVATE
APPLICATIONS_OPEN
IN_REVIEW
CREATOR_SELECTED
AGREEMENT_PENDING
PAYMENT_PENDING
ACTIVE
CONTENT_SUBMITTED
PAYMENT_REQUESTED
COMPLETED
EXPIRED
CANCELLED
```

Only allow valid state transitions.

Do not let users arbitrarily change campaign status.

------------------------------------------------------------------------

# 28. APPLICATION STATUS MODEL

``` text
PENDING
ACCEPTED
REJECTED
WITHDRAWN
```

------------------------------------------------------------------------

# 29. INVITATION STATUS MODEL

``` text
SENT
VIEWED
ACCEPTED
REJECTED
EXPIRED
```

------------------------------------------------------------------------

# 30. PAYMENT STATUS MODEL

For initial held payment:

``` text
NOT_REQUIRED
PENDING
PAID_TO_DR.COLLAB
HELD
RELEASE_REQUESTED
RELEASED
FAILED
REFUNDED
```

For performance-based payments:

``` text
NOT_REQUIRED
PENDING
PAID_DIRECTLY
```

Do not mix the two payment systems.

------------------------------------------------------------------------

# 31. USER PERMISSIONS

## Brand

Can:

-   Manage own profile.
-   Discover creators.
-   Search creators.
-   Filter creators.
-   Message relevant creators.
-   Create campaigns.
-   Edit own campaigns where allowed.
-   Create public campaigns.
-   Create private campaigns.
-   Review applications.
-   Invite creators.
-   Create agreements.
-   Make initial payments.
-   Review submitted work.
-   Manage campaign status.

Cannot:

-   Edit another brand's profile.
-   Access another brand's private campaigns.
-   Modify another brand's campaigns.
-   Modify creator-owned data without permission.

## Creator

Can:

-   Manage own profile.
-   Discover public campaigns.
-   Search campaigns.
-   Filter campaigns.
-   Apply to campaigns.
-   Receive private invitations.
-   Message relevant brands.
-   Accept/reject invitations.
-   Review agreements.
-   Sign agreements.
-   Submit work.
-   Request initial payment.
-   View own payment records.
-   View own campaign history.

Cannot:

-   Edit another creator's profile.
-   Edit brand campaigns.
-   Access private campaigns they were not invited to.
-   Change payment records.

------------------------------------------------------------------------

# 32. DATABASE ENTITIES

Initial database entities should include:

## User

-   id
-   email
-   phone
-   authProvider
-   role
-   createdAt
-   updatedAt

## BrandProfile

-   id
-   userId
-   companyName
-   companyLogo
-   websiteUrl
-   niche
-   employeeSize
-   role
-   businessDescription
-   socialLinks
-   createdAt
-   updatedAt

## CreatorProfile

-   id
-   userId
-   name
-   profileImage
-   bio
-   niche
-   socialPlatforms
-   socialLinks
-   followerCounts
-   engagementRate
-   pricing
-   createdAt
-   updatedAt

## Campaign

-   id
-   brandId
-   title
-   productName
-   productDetails
-   description
-   campaignType
-   niche
-   platform
-   estimatedPrice
-   creatorSlots
-   startDate
-   endDate
-   deliverables
-   requirements
-   status
-   createdAt
-   updatedAt

## Application

-   id
-   campaignId
-   creatorId
-   status
-   message
-   createdAt
-   updatedAt

## Invitation

-   id
-   campaignId
-   creatorId
-   status
-   message
-   expiresAt
-   createdAt

## Conversation

-   id
-   campaignId
-   brandId
-   creatorId
-   createdAt

## Message

-   id
-   conversationId
-   senderId
-   content
-   createdAt

## Agreement

-   id
-   campaignId
-   brandId
-   creatorId
-   agreementData
-   pdfUrl
-   signedPdfUrl
-   status
-   creatorSignedAt
-   brandSignedAt
-   createdAt
-   updatedAt

## Payment

-   id
-   campaignId
-   creatorId
-   brandId
-   type
-   amount
-   currency
-   status
-   providerReference
-   createdAt
-   updatedAt

Payment type:

``` text
INITIAL_HELD
PERFORMANCE_DIRECT
```

## Submission

-   id
-   campaignId
-   creatorId
-   contentUrl
-   socialUrl
-   notes
-   status
-   submittedAt
-   reviewedAt

------------------------------------------------------------------------

# 33. IMPORTANT DATA RELATIONSHIPS

``` text
User
 ├── BrandProfile
 └── CreatorProfile

Brand
 └── Campaign
       ├── Applications
       ├── Invitations
       ├── Agreement
       ├── Payments
       └── Submissions

Creator
 ├── Applications
 ├── Invitations
 ├── Conversations
 ├── Payments
 └── Submissions

Brand + Creator + Campaign
              ↓
        Conversation

Brand + Creator + Campaign
              ↓
          Agreement
```

------------------------------------------------------------------------

# 34. API REQUIREMENTS

The exact API design should be finalized before implementation.

Suggested groups:

## Auth

``` text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/google
POST /api/auth/phone
POST /api/auth/forgot-password
POST /api/auth/reset-password
```

## Brand

``` text
GET /api/brand/profile
PUT /api/brand/profile
GET /api/brand/creators
GET /api/brand/creators/:id
```

## Creator

``` text
GET /api/creator/profile
PUT /api/creator/profile
GET /api/creator/campaigns
GET /api/creator/campaigns/:id
```

## Campaign

``` text
POST /api/campaigns
GET /api/campaigns/:id
PUT /api/campaigns/:id
POST /api/campaigns/:id/apply
POST /api/campaigns/:id/invite
```

## Applications

``` text
GET /api/campaigns/:id/applications
PUT /api/applications/:id
```

## Invitations

``` text
GET /api/invitations
PUT /api/invitations/:id
```

## Messaging

``` text
GET /api/conversations
GET /api/conversations/:id/messages
POST /api/conversations/:id/messages
```

## Agreements

``` text
POST /api/agreements
GET /api/agreements/:id
POST /api/agreements/:id/sign
GET /api/agreements/:id/pdf
```

## Payments

``` text
POST /api/payments/initial
GET /api/payments
POST /api/payments/:id/request-release
```

The API may be adjusted during technical planning if there is a strong
architectural reason.

------------------------------------------------------------------------

# 35. TECHNICAL ARCHITECTURE

Recommended initial architecture:

``` text
React / Vite Frontend
        ↓
REST API
        ↓
Node.js + Express
        ↓
Service Layer
        ↓
Database
```

Recommended frontend:

-   React
-   TypeScript
-   Vite
-   Tailwind CSS
-   React Router
-   React Query/TanStack Query where appropriate

Recommended backend:

-   Node.js
-   Express
-   TypeScript
-   Validation library
-   Authentication system
-   Centralized error handling

Database:

-   PostgreSQL preferred for relational campaign/payment/agreement
    relationships.

Storage:

-   Use a suitable object storage/file provider for profile images,
    submitted content and signed PDFs.

Payments:

-   Use a payment provider that legally supports
    marketplace/payment-holding requirements for the target market.
-   Do not implement a fake wallet or homemade payment-holding system.
-   Payment-provider architecture must be reviewed before production.

------------------------------------------------------------------------

# 36. SECURITY REQUIREMENTS

Security is a core requirement.

Implement:

-   Secure authentication.
-   Password hashing.
-   Proper session/JWT handling.
-   Role-based authorization.
-   Resource ownership checks.
-   Request validation.
-   Rate limiting where appropriate.
-   Secure file upload validation.
-   Secure payment webhook verification.
-   Environment variables for secrets.
-   No API keys in frontend code.
-   No sensitive information in logs.
-   Proper CORS configuration.
-   Secure error responses.

Every protected endpoint must verify:

1.  User is authenticated.
2.  User has the required role.
3.  User owns or is authorized to access the resource.

------------------------------------------------------------------------

# 37. FILE AND PDF REQUIREMENTS

The system needs PDF generation for campaign agreements.

Flow:

Brand enters agreement details → Validate agreement → Generate PDF →
Save PDF → Send to creator → Creator views/downloads → Creator signs →
Signed version uploaded → Brand can access signed agreement

Do not permanently store sensitive documents in public URLs without
proper access controls.

------------------------------------------------------------------------

# 38. DEVELOPMENT APPROACH WITH CURSOR

Cursor must NOT attempt to build the whole application in one request.

Build incrementally.

## Phase 1 --- Project Foundation

-   Initialize repository.
-   Configure frontend.
-   Configure backend.
-   Configure TypeScript.
-   Configure environment variables.
-   Configure database.
-   Configure linting/formatting.
-   Configure Git.

## Phase 2 --- Authentication

-   User registration.
-   Login.
-   Google authentication.
-   Phone authentication if selected.
-   Role selection.
-   Protected routes.
-   Role-based routing.

## Phase 3 --- Onboarding

-   Brand onboarding.
-   Creator onboarding.
-   Profile creation.
-   Profile editing.

## Phase 4 --- Brand Marketplace

-   Creator discovery.
-   Search.
-   Filters.
-   Creator profile.

## Phase 5 --- Creator Marketplace

-   Campaign discovery.
-   Search.
-   Filters.
-   Campaign details.

## Phase 6 --- Campaign System

-   Public campaigns.
-   Private campaigns.
-   Applications.
-   Invitations.
-   Campaign statuses.

## Phase 7 --- Messaging

-   Conversations.
-   Campaign-linked messages.
-   Message sending/receiving.

## Phase 8 --- Agreement System

-   Agreement creation.
-   Agreement preview.
-   PDF generation.
-   Signing workflow.
-   Agreement status.

## Phase 9 --- Payments

-   Initial payment.
-   Payment holding.
-   Payment release request.
-   Payment status.
-   Performance payment record/flow.

## Phase 10 --- Work Submission

-   Creator content upload.
-   Social URL submission.
-   Brand review.
-   Payment request.

## Phase 11 --- Campaign Completion

-   Completion workflow.
-   Expiration.
-   Historical records.

## Phase 12 --- Testing and Security

-   API testing.
-   Authentication testing.
-   Authorization testing.
-   Payment testing.
-   UI testing.
-   Responsive testing.
-   Security review.

------------------------------------------------------------------------

# 39. CURSOR WORKING RULES

Before starting any task, Cursor should:

1.  Read PROJECT.md.
2.  Read AGENTS.md.
3.  Inspect the existing project.
4.  Understand the current architecture.
5.  Identify affected files.
6.  Explain the implementation plan for significant tasks.
7.  Implement only the requested scope.
8.  Run appropriate tests/build checks.
9.  Fix errors.
10. Report what changed.

Do not:

-   Rewrite the entire project.
-   Change the tech stack without approval.
-   Delete working code unnecessarily.
-   Create duplicate components/services.
-   Introduce unnecessary dependencies.
-   Change database structure casually.
-   Implement future features without permission.
-   Hardcode secrets.
-   Invent business rules.

------------------------------------------------------------------------

# 40. DEVELOPMENT TASK FORMAT

Every feature should be broken into a small task.

Example:

``` text
Task:
Implement brand creator search.

Requirements:
- Search creator by name.
- Filter by niche.
- Filter by platform.
- Filter by follower count.

Backend:
- Add API endpoint.
- Add validation.
- Add database query.

Frontend:
- Add search input.
- Add filter controls.
- Add creator cards.
- Add loading state.
- Add empty state.
- Add error state.

Testing:
- Test search.
- Test each filter.
- Test combined filters.
- Test unauthorized access.
```

Do not ask Cursor to implement unrelated features in the same task.

------------------------------------------------------------------------

# 41. TESTING RULES

Every feature should be tested.

## Authentication

Test:

-   Valid registration.
-   Duplicate email.
-   Invalid credentials.
-   Unauthorized access.
-   Role restrictions.

## Campaigns

Test:

-   Brand can create campaign.
-   Creator can view public campaign.
-   Creator cannot view unauthorized private campaign.
-   Creator can apply.
-   Brand can review applications.
-   Private invitation works.
-   Expired campaign rejects new applications.

## Payments

Test:

-   Correct payment amount.
-   Correct campaign.
-   Correct creator.
-   Correct brand.
-   Payment status changes.
-   Unauthorized users cannot access payment data.
-   Webhook verification.

## Agreements

Test:

-   Correct agreement data.
-   Correct PDF.
-   Correct creator.
-   Correct brand.
-   Signing status.
-   Access control.

------------------------------------------------------------------------

# 42. RESPONSIVE DESIGN

The application must work on:

-   Desktop
-   Laptop
-   Tablet
-   Mobile

Do not build desktop-only layouts.

Navigation should adapt appropriately for mobile.

Tables should become mobile-friendly cards or horizontal scrolling where
appropriate.

------------------------------------------------------------------------

# 43. UI STATES

Every important page must include:

### Loading state

Show a clean loading UI.

### Empty state

Example:

"No creators found."

"No campaigns available."

"No messages yet."

### Error state

Show a useful error message and recovery action.

### Success state

Confirm successful actions.

Do not leave blank screens.

------------------------------------------------------------------------

# 44. MVP LIMITATIONS

The following should NOT automatically be implemented unless explicitly
requested:

-   AI creator recommendations.
-   Advanced analytics.
-   Automated influencer performance prediction.
-   Complex commission system.
-   Affiliate tracking.
-   Multi-currency system.
-   Advanced admin dashboard.
-   Complex subscription plans.
-   Automated tax system.
-   Full enterprise permissions.
-   Complex dispute resolution.
-   Automated fraud detection.

These can be future versions.

------------------------------------------------------------------------

# 45. FUTURE VISION

dr.collab may eventually become an intelligence layer for creator
marketing.

Potential future capabilities:

-   Creator recommendations.
-   Campaign performance prediction.
-   Historical creator performance.
-   Engagement analysis.
-   Conversion analytics.
-   Brand recommendations.
-   Creator-brand matching.
-   Campaign analytics.
-   Automated campaign optimization.

These are future features and should not complicate the MVP architecture
unnecessarily.

------------------------------------------------------------------------

# 46. DEFINITION OF DONE

A feature is complete only when:

-   [ ] Requirement implemented.
-   [ ] Correct role permissions.
-   [ ] Validation implemented.
-   [ ] Error handling implemented.
-   [ ] Loading state implemented.
-   [ ] Empty state implemented.
-   [ ] API tested.
-   [ ] UI tested.
-   [ ] Responsive behavior checked.
-   [ ] No TypeScript errors.
-   [ ] No obvious console errors.
-   [ ] No secrets exposed.
-   [ ] Existing functionality still works.
-   [ ] Code is committed to Git.

------------------------------------------------------------------------

# 47. FIRST CURSOR INSTRUCTION

After placing this file in the repository, DO NOT immediately ask Cursor
to build the entire application.

First ask Cursor:

> Read PROJECT.md carefully and analyze the entire dr.collab product
> specification. Do not write application code yet.
>
> First provide: 1. Recommended project architecture. 2. Recommended
> folder structure. 3. Database schema and relationships. 4. API
> architecture. 5. Authentication architecture. 6. Payment architecture
> and important limitations. 7. Agreement/PDF architecture. 8. Messaging
> architecture. 9. Security considerations. 10. Development phases.
>
> Identify contradictions, missing requirements, risky assumptions, and
> technical decisions that need to be finalized before implementation.
>
> Do not implement anything yet.

After reviewing the response, finalize the architecture and then begin
implementation phase by phase.

------------------------------------------------------------------------

# 48. FINAL PRODUCT FLOW

## Brand

``` text
Landing Page
      ↓
Sign Up
      ↓
Choose Brand
      ↓
Authentication
      ↓
Onboarding Questions
      ↓
Brand Profile
      ↓
Brand Dashboard
      ↓
Discover Creators
      ↓
Search / Filter
      ↓
View Creator
      ↓
       ┌───────────────────┐
       ↓                   ↓
Public Campaign       Private Campaign
       ↓                   ↓
Creator Applies       Brand Invites Creator
       ↓                   ↓
       └─────────┬─────────┘
                 ↓
              Message
                 ↓
             Agreement
                 ↓
        Brand Pays Initial Amount
                 ↓
          dr.collab Holds Amount
                 ↓
          Creator Creates Work
                 ↓
          Creator Submits Work
                 ↓
          Creator Requests Payment
                 ↓
          dr.collab Releases Amount
                 ↓
     Performance Payment (if any)
                 ↓
       Brand Pays Creator Directly
                 ↓
          Campaign Completion
                 ↓
             Campaign Ends
```

## Creator

``` text
Landing Page
      ↓
Sign Up
      ↓
Choose Creator
      ↓
Authentication
      ↓
Creator Onboarding
      ↓
Creator Profile
      ↓
Creator Dashboard
      ↓
Discover Campaigns
      ↓
Search / Filter
      ↓
Public Campaign
      ↓
Apply
      ↓
Brand Reviews
      ↓
Message
      ↓
Agreement
      ↓
Sign Agreement
      ↓
Campaign Active
      ↓
Create Content
      ↓
Upload / Submit Work
      ↓
Request Initial Payment
      ↓
Receive Released Payment
      ↓
Performance Payment
      ↓
Brand Pays Directly
      ↓
Campaign Completed
```

------------------------------------------------------------------------

# 49. CORE PRODUCT PRINCIPLE

dr.collab is not just a collection of pages.

The important part is the complete lifecycle:

``` text
Discovery
   ↓
Matching
   ↓
Communication
   ↓
Agreement
   ↓
Payment
   ↓
Content Creation
   ↓
Submission
   ↓
Payment Release
   ↓
Completion
```

Every feature should support this lifecycle.

When implementing a feature, always consider:

-   Who is performing the action?
-   What role do they have?
-   What data is being changed?
-   Who can access the data?
-   What status should change?
-   What happens next?
-   What happens if something fails?
-   What happens when the campaign expires?

This document is the primary product specification for the dr.collab MVP.
