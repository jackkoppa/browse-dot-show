# Summary

In the repo, we are currently deploying many different sites using `/Users/jackkoppa/Personal_Development/browse-dot-show/packages/client`

We are going to add a new `/Users/jackkoppa/Personal_Development/browse-dot-show/packages/homepage` package (currently contains only a fresh `vite` created React app, we'll remove all that content & start fresh)

This homepage is going to be deployed at http://browse.show/ - while most of the individual sites are deployed at https://{siteId}.browse.show

`homepage` has the following features:

* snappy introduction for what the application does: `📝🔍🎙️ transcribe & search any podcast`
* provides a universal search box (this isn't necessarily the main point of `homepage`, but is an important feature) - select from any of the sites listed in `/Users/jackkoppa/Personal_Development/browse-dot-show/packages/homepage/src/deployed-sites.config.jsonc` - once you've selected a site, the search box is enabled, and when you press Enter or the search button, the page redirects to that site, with the query applied via query param, e.g. `https://hardfork.browse.show/?q=my+search+term`

* The primary point of the page: to inform people about this application, and that if they want to use it for another application, they can! They have two options: request a podcast be added (primary CTA), or a slightly lesser-emphasized button, they can self-host
    * First button takes them to https://docs.google.com/document/d/11p38njNdKeJF49XHPtYN-Gb6fotPCkoQIW8V4UDC9hA/edit?usp=sharing - a Google Doc titled `browse.show - Vote for podcasts to be made searchable 🗳️`
    * Second button takes them to https://github.com/jackkoppa/browse-dot-show/blob/main/docs/GETTING_STARTED.md 

* That CTA is the primary focus of `homepage`



And here are important technical considerations as we get started on the implementation
* `homepage` will use the same component library as `client`. So we're going to move all of `/Users/jackkoppa/Personal_Development/browse-dot-show/packages/client/src/components/ui` to `/Users/jackkoppa/Personal_Development/browse-dot-show/packages/ui` (which will be imported in both places as `@browse-dot-show/ui`)
* Additionally, we will move basic layout components (along with a shared CSS file, and utils or hooks if necessary), to `@browse-dot-show/blocks` - here, `/Users/jackkoppa/Personal_Development/browse-dot-show/packages/blocks`
* It's very important, for example, that `homepage` and `client` end up having the same header sizing, that adjusts on scroll. Because when a user performs a search from `browse.show`, and is redirected to one of the individual sites that they selected, the header should look the same, styling-wise. It will just have a different title & color. So it's important that this component, for example, is shared in `/blocks`
* Every site has a different shadcn theme applied - see `index.css` examples in `/Users/jackkoppa/Personal_Development/browse-dot-show/sites/origin-sites`. `homepage` will have its own theme file as well, but it's very important that it uses the `shadcn` `ui` components, in the same way `client` currently does
* I will work with you to adjust the layout of `homepage` after initial development, but given the technical requirements & features described above, make your best effort to make a `homepage` that:
    * matches the styling already used in `client`
    * is clean & simple
    * emphasizes the summary of what the application does, as well as the CTA to request/vote for podcasts a user would like to be added
    * mobile-first

* Keep in mind that you'll need to run `pnpm all:build` from the root as you make changes across packages, to make sure that new functions/types/etc. are built & usable in the other `packages`

* The very last phase of this feature implementation will be adding Terraform configs, so that this new site can be:
    * Deployed to an S3 bucket
    * Which is behind a new Cloudfront distribution
    * And the Cloudfront distribution can be configured to be at the `browse.show` domain (managed by Namecheap), with an SSL certificate
* This TF setup will be much simpler than the other `sites` deployed from this repo, so we will need a clear distinction from existing TF setups & this new one, that is only needed for `homepage`. We can reuse *some* existing TF modules if helpful/makes sense, but we should mostly keep the `homepage` TF implementation separate from what already exists. It should be a very clear distinction, that `homepage` is a simple one-off (main difference: no Lambdas at all needed)

* Before writing clarifying questions & starting on the phased implementation plan below, make sure you've read all relevant files & directories described above.


--- AI AGENTS - DO NOT EDIT ABOVE THIS LINE, ONLY EDIT BELOW THE LINE ---


# Implementation Plan

## ✅ Phase 1: Fix Build Errors & UI Package Issues (COMPLETED)

**Status: COMPLETED** ✅

**What was accomplished:**

1. **Fixed Import Syntax Errors:**
   - Fixed unterminated string imports in multiple files (missing closing quotes in `@browse-dot-show/ui` imports)
   - Fixed import statements in `AudioSourceSelect.tsx`, `SearchResult.tsx`, `ThemeToggle.tsx` in both client and homepage packages

2. **Fixed Dependency Resolution Issues:**
   - Moved `vaul` dependency from client/homepage packages to the UI package (where it's actually used by drawer component)
   - Moved `lucide-react` dependency to UI package (used by select, dialog, sheet, pagination components)
   - Added `react` dependency to UI package for React types
   - Removed duplicate dependencies from client and homepage packages

3. **Fixed Component Export Issues:**
   - Added missing pagination component exports to UI package index.ts
   - Fixed circular import in pagination component (was importing from @browse-dot-show/ui instead of relative path)

4. **Updated ThemeToggle Components:**
   - Replaced direct `@radix-ui/react-switch` imports with the Switch component from UI package
   - Updated implementation to work with the new component structure while maintaining custom styling

5. **Fixed Import Path Issues:**
   - Updated AppHeader component to import Button from `@browse-dot-show/ui` instead of relative path

**Current Status:**
- ✅ `pnpm all:build` - All packages build successfully
- ✅ `pnpm all:lint` - No linting errors
- ✅ Client builds work for all 5 sites
- ✅ Homepage package builds successfully
- ✅ All UI components are properly shared via `@browse-dot-show/ui` package

---

## ✅ Phase 2: Create Shared Layout Components in `@browse-dot-show/blocks` (COMPLETED)

**Goal:** Move shared layout components from client/homepage to a shared blocks package to ensure consistent styling across sites.

**Status: COMPLETED** ✅

**What was accomplished:**

1. **Created shared AppHeader component** ✅
   - Created `packages/blocks/src/components/AppHeader.tsx` with configurable interface
   - Made it support different title/tagline configurations for client vs homepage
   - Maintained same header sizing/scroll behavior across all sites

2. **Updated package dependencies** ✅
   - Added necessary dependencies to blocks package (`@browse-dot-show/ui`, `@radix-ui/react-icons`, `react`)
   - Created proper exports in `packages/blocks/index.ts`

3. **Updated both client and homepage packages** ✅
   - Client: Updated to import `AppHeader` from `@browse-dot-show/blocks` while keeping site-specific drawers
   - Homepage: Updated to use shared component with homepage-specific configuration
   - Verified all builds work correctly (client sites + homepage)

**Current Status:**
- ✅ Shared AppHeader component working in both client and homepage
- ✅ All builds passing
- ✅ Consistent header behavior across sites
- ✅ Client sites (tested naddpod) building successfully
- ✅ Homepage package building successfully

---

## ✅ Phase 3: Clean Up Homepage Package (Remove Unnecessary Features) (COMPLETED)

**Goal:** Remove all podcast search/audio functionality from homepage and simplify it to be a landing page only.

**Status: COMPLETED** ✅

**What was accomplished:**

1. **✅ Removed unnecessary dependencies from `package.json`:**
   - Removed `react-router` (homepage is now single page)
   - Removed `react-h5-audio-player` 
   - Removed `@orama/highlight`

2. **✅ Deleted unnecessary files/components:**
   - `src/routes/EpisodeRoute.tsx`
   - `src/components/AudioPlayer/` (entire directory)
   - `src/components/AudioSourceSelect.tsx`
   - `src/components/FullEpisodeTranscript.tsx`
   - `src/components/PlayTimeLimitDialog.tsx`
   - `src/components/SearchResult.tsx`
   - `src/components/SearchResults.tsx`
   - `src/components/SearchResultsPagination.tsx`
   - `src/components/ResponsiveDrawerOrDialog.tsx`
   - `src/components/HighlightedText.tsx` and `.css`
   - `src/components/AppHeader.tsx` (using shared one from blocks)
   - `src/hooks/useAudioSource.ts`
   - `src/hooks/useEpisodeManifest.ts`
   - `src/hooks/usePlayTimeLimit.ts`
   - `src/utils/search.ts`
   - Various test files for deleted components

3. **✅ Simplified App.tsx:**
   - Removed react-router completely
   - Now just renders HomePage component directly

4. **✅ Updated remaining components:**
   - Kept only: `SearchInput`, `ThemeToggle` (from shared components)
   - Modified SearchInput usage to work with site selection instead of search results

5. **✅ Fixed TypeScript issues:**
   - Created `deployed-sites.config.d.ts` to properly type the JSONC import
   - Fixed all linter errors and type issues
   - Updated CSS imports to remove deleted files

6. **✅ Completely rewrote HomePage.tsx:**
   - Implemented new landing page with:
     - Hero section with "📝🔍🎙️ transcribe & search any podcast"
     - Universal search with site dropdown selection
     - Primary CTA: "🗳️ Request a podcast" (links to Google Doc)
     - Secondary CTA: "🚀 Self-host your own" (links to GitHub docs)
     - Features section explaining how it works
     - Proper mobile-first responsive design

**Current Status:**
- ✅ All packages build successfully (`pnpm all:build`)
- ✅ Homepage is now a proper landing page
- ✅ Universal search functionality implemented
- ✅ CTAs properly implemented with tracking
- ✅ No more podcast search/audio functionality (clean separation)
- ✅ TypeScript declaration file properly handles JSONC import

---

## ✅ Phase 4: Create Deployed Sites Configuration (COMPLETED)

**Goal:** Create the `deployed-sites.config.jsonc` file that the homepage will use for the universal search dropdown.

**Status: COMPLETED** ✅

**What was accomplished:**

1. **✅ `packages/homepage/src/deployed-sites.config.jsonc` already existed:**
   - File was already present with all 5 deployed sites configured
   - Contains: listenfairplay, hardfork, naddpod, claretandblue, searchengine
   - Each site has proper metadata: name, description, URL, image

2. **✅ Created TypeScript declaration file:**
   - Created `packages/homepage/src/deployed-sites.config.d.ts` to properly type the JSONC import
   - Defined interfaces for `DeployedSite` and `DeployedSitesConfig`
   - Allows TypeScript to understand the structure of the configuration

3. **✅ Integrated into HomePage component:**
   - Successfully imports and transforms the config into an array format
   - Used in the site selection dropdown
   - Enables universal search functionality across all sites

**Current Status:**
- ✅ Configuration file properly typed and imported
- ✅ Universal search dropdown populated with all available sites
- ✅ TypeScript compilation working without errors
- ✅ Ready for universal search functionality

---

## ✅ Phase 5: Implement Homepage Content and Features (COMPLETED)

**Goal:** Build the actual homepage with introduction, universal search, and CTAs.

**Status: COMPLETED** ✅

**What was accomplished:**

1. **✅ Created homepage hero section:**
   - Snappy intro: "📝🔍🎙️ transcribe & search any podcast"
   - Clean, centered layout with large emoji display
   - Mobile-first responsive design with proper scaling

2. **✅ Implemented universal search component:**
   - Site selector dropdown using deployed sites config
   - Search input that's enabled only after site selection
   - Search redirects to `https://{siteId}.browse.show/?q={query}` in new tab
   - Proper event tracking for analytics

3. **✅ Added primary CTA section:**
   - Main button: "🗳️ Request a podcast"
   - Links to: `https://docs.google.com/document/d/11p38njNdKeJF49XHPtYN-Gb6fotPCkoQIW8V4UDC9hA/edit?usp=sharing`
   - Proper event tracking for click analytics

4. **✅ Added secondary CTA:**
   - Button: "🚀 Self-host your own"
   - Links to: `https://github.com/jackkoppa/browse-dot-show/blob/main/docs/GETTING_STARTED.md`
   - Proper event tracking for click analytics

5. **✅ Styled to match client sites:**
   - Uses same shadcn components (Button, Card, etc.)
   - Consistent button styling and interactions
   - Same header component from blocks package
   - Proper responsive design

6. **✅ Added "How it works" section:**
   - Three-step process: Transcribe → Search → Listen
   - Clear explanations with emoji icons
   - Card-based layout for better visual organization

**Current Status:**
- ✅ All core features implemented and functional
- ✅ Universal search working across all sites
- ✅ CTAs properly linked and tracked
- ✅ Responsive design working well on mobile and desktop
- ✅ Consistent styling with existing sites

---

## ✅ Phase 6: Create Homepage-Specific Theme and Styling (COMPLETED)

**Goal:** Create a unique theme for the homepage while maintaining consistency with the client sites.

**Status: COMPLETED** ✅

**What was accomplished:**

1. **✅ Created homepage-specific theme CSS:**
   - Added custom CSS variables for homepage color scheme (amber/orange theme)
   - Created gradient backgrounds and card styling
   - Added custom animations (gentle bounce for emojis, gradient text animation)
   - Enhanced interactive elements with hover effects
   - Defined homepage-specific color palette with primary/secondary colors

2. **✅ Updated HomePage component styling:**
   - Used Card components from shadcn/ui for better structure
   - Enhanced visual hierarchy with larger headings and better spacing
   - Added gradient text effect to main title with animation
   - Improved responsive design with better mobile experience
   - Enhanced CTA buttons with custom styling and hover effects
   - Added proper spacing and layout improvements

3. **✅ Enhanced interactive elements:**
   - Custom select styling with focus states
   - Improved button interactions with transform effects
   - Card hover animations for feature sections
   - Better visual feedback for all interactive elements
   - 3D-style button effects with shadows and transforms

4. **✅ Responsive design improvements:**
   - Better mobile-first approach with proper scaling
   - Improved spacing and sizing for different screen sizes
   - Enhanced readability across devices
   - Proper responsive grid layouts

5. **✅ Visual polish:**
   - Subtle animations and transitions throughout
   - Gradient backgrounds and card effects
   - Enhanced typography with better contrast
   - Modern, polished look that stands out while maintaining consistency

**Current Status:**
- ✅ Custom gradient theme with amber/orange color scheme
- ✅ Smooth animations and hover effects implemented
- ✅ Mobile-first responsive design working well
- ✅ Clear visual hierarchy established
- ✅ Enhanced interactive elements with proper feedback
- ✅ Proper use of shadcn Card components
- ✅ Homepage builds successfully and looks polished

---

## 🚧 Phase 7: Validate & Improve Styling

**Goal:** Examinee output of Phases 5 & 6 with user, make styling tweaks.

**Status:** 🚧 Ready to Start

**Tasks:**
TBD


## 🚧 Phase 8: Terraform Configuration for Homepage Deployment

**Goal:** Create simplified Terraform setup for deploying homepage to `browse.show` domain.

**Status:** 🚧 Ready to Start

**Tasks:**
1. **Create homepage-specific Terraform module:**
   - Simple S3 + CloudFront setup (no Lambdas needed)
   - SSL certificate for `browse.show` domain
   - Keep separate from existing site Terraform

2. **Update deployment scripts:**
   - Add homepage build/deploy commands
   - Ensure homepage can be deployed independently

3. **Domain configuration:**
   - Configure `browse.show` to point to new CloudFront distribution
   - Set up SSL certificate

**Estimated Time:** 2-3 hours

---

## Summary

**Total Estimated Time:** 11-16 hours across 7 phases
**Current Progress:** 6/7 phases completed ✅

**Key Technical Decisions Made:**
- ✅ Moved shared components to `@browse-dot-show/blocks` for consistency
- ✅ Removed all podcast search functionality from homepage
- ✅ Used existing deployed sites config for universal search
- ✅ Created TypeScript declarations for JSONC imports
- ✅ Maintained visual consistency while giving homepage its own identity
- 🚧 Keep homepage deployment separate from client site deployments (Phase 7)

**Ready for:** Phase 7 (Terraform deployment setup)

---

## Current Status Overview

**✅ COMPLETED:**
- Homepage package cleaned up and simplified
- Universal search functionality implemented
- CTAs properly linked and tracked
- Modern, polished styling with custom theme
- Responsive design working across devices
- TypeScript properly configured
- All builds passing successfully

**🚧 REMAINING:**
- Terraform configuration for deployment to `browse.show` domain

The homepage is now fully functional and ready for deployment!
