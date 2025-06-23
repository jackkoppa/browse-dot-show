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
