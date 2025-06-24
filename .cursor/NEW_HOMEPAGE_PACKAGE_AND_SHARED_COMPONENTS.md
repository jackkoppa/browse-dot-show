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

## 🚧 Phase 3: Clean Up Homepage Package (Remove Unnecessary Features)

**Goal:** Remove all podcast search/audio functionality from homepage and simplify it to be a landing page only.

**Status:** 🚧 Ready to Start

**Tasks:**
1. **Remove unnecessary dependencies from `package.json`:**
   - `react-router` (homepage will be single page)
   - `react-h5-audio-player`
   - `@orama/highlight`
   - Any other search/audio related deps

2. **Delete unnecessary files/components:**
   - `src/routes/EpisodeRoute.tsx`
   - `src/components/AudioPlayer/`
   - `src/components/AudioSourceSelect.tsx`
   - `src/components/FullEpisodeTranscript.tsx`
   - `src/components/PlayTimeLimitDialog.tsx`
   - `src/components/SearchResult.tsx`
   - `src/components/SearchResults.tsx`
   - `src/components/SearchResultsPagination.tsx`
   - `src/components/ResponsiveDrawerOrDialog.tsx`
   - `src/hooks/useAudioSource.ts`
   - `src/hooks/useEpisodeManifest.ts`
   - `src/hooks/usePlayTimeLimit.ts`
   - `src/utils/search.ts` (and related search utilities)

3. **Simplify App.tsx:**
   - Remove react-router completely
   - Make it just render the homepage component directly

4. **Update remaining components:**
   - Keep only: `SearchInput`, `AppHeader`, `ThemeToggle`
   - Modify SearchInput to work with site selection instead of search

**Estimated Time:** 1-2 hours

---

## 🚧 Phase 4: Create Deployed Sites Configuration

**Goal:** Create the `deployed-sites.config.jsonc` file that the homepage will use for the universal search dropdown.

**Status:** 🚧 Mostly Complete - Just Need to Verify

**Tasks:**
1. **Create `packages/homepage/src/deployed-sites.config.jsonc`:**


---

## 🚧 Phase 5: Implement Homepage Content and Features

**Goal:** Build the actual homepage with introduction, universal search, and CTAs.

**Status:** 🚧 Ready to Start

**Tasks:**
1. **Create homepage hero section:**
   - Snappy intro: "📝🔍🎙️ transcribe & search any podcast"
   - Clean, centered layout
   - Mobile-first responsive design

2. **Implement universal search component:**
   - Site selector dropdown (using deployed sites config)
   - Search input that's enabled only after site selection
   - Search redirects to `https://{siteId}.browse.show/?q={query}`

3. **Add primary CTA section:**
   - Main button: "Request a podcast to be made searchable"
   - Links to: `https://docs.google.com/document/d/11p38njNdKeJF49XHPtYN-Gb6fotPCkoQIW8V4UDC9hA/edit?usp=sharing`

4. **Add secondary CTA:**
   - Button: "Self-host your own"
   - Links to: `https://github.com/jackkoppa/browse-dot-show/blob/main/docs/GETTING_STARTED.md`

5. **Style to match client sites:**
   - Use same shadcn components
   - Consistent button styling
   - Same header component (from blocks)

**Estimated Time:** 3-4 hours

---

## 🚧 Phase 6: Create Homepage-Specific Theme and Styling

**Goal:** Create a unique theme for the homepage while maintaining consistency with the client sites.

**Status:** 🚧 Ready to Start

**Tasks:**
1. **Create homepage theme CSS:**
   - New `packages/homepage/src/theme.css` file
   - Define homepage-specific color scheme
   - Should complement but differentiate from client sites

2. **Update homepage styling:**
   - Ensure mobile-first responsive design
   - Clean, modern look that emphasizes the CTAs
   - Consistent with existing site aesthetic

3. **Test across devices:**
   - Ensure responsive design works well
   - Test CTA button prominence and usability

**Estimated Time:** 2-3 hours

---

## 🚧 Phase 7: Terraform Configuration for Homepage Deployment

**Goal:** Create simplified Terraform setup for deploying homepage to `browse.show` domain.

**Status:** 🚧 Final Phase

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

**Total Estimated Time:** 11-16 hours across 6 phases

**Key Technical Decisions:**
- Move shared components to `@browse-dot-show/blocks` for consistency
- Remove all podcast search functionality from homepage
- Create separate deployed sites config for universal search
- Keep homepage deployment separate from client site deployments
- Maintain visual consistency while giving homepage its own identity

**Ready to Start:** Phases 2-3 can begin immediately as they involve cleanup and refactoring existing code.

---

## Reference Screenshots

For context on current state and styling consistency goals:

- **Homepage (current state - incomplete):**
  - Mobile: `@example-screenshot-of-homepage-INCOMPLETE-MISSING-ALL-FEATURES.png.png`
  - Desktop: `@example-screenshot-of-homepage-INCOMPLETE-MISSING-ALL-FEATURES(desktop).png`

- **Individual Site Example (NADDPOD):**
  - Mobile: `@example-screenshot-of-site--naddpod.png`
  - Desktop: `@example-screenshot-of-site--naddpod(desktop).png`

- **Configuration:** `@deployed-sites.config.jsonc` ✅ Ready
