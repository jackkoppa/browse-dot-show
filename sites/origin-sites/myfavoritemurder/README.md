# template-site

To start a new site, copy this directory to a new directory named with the id of your new site, in [my-sites/](../my-sites/)


## Notes

We'll track some potential future enhancements here

### Improved favicon / site image generation

Currently, to create a site, you have to visit https://realfavicongenerator.net/ yourself, and output your asset files.

Conveniently, the people behind that site have put together a set of NPM packages to generate all favicons via Node scripts, from a single source.

This would help make initial site setup even simpler. But the packages are still early (as of 2025-06-17), and the first attempt to use them was not successful:

1. https://github.com/jackkoppa/browse-dot-show/commit/da7248dc0a430394dd06560650a1e7854edb9c55
2. https://github.com/jackkoppa/browse-dot-show/commit/034145d4c5bf03c1dfb33d85881944c5a23565f8

After these attempts, we *did* get asset files generated to the appropriate `/packages/client/dist-{siteId}`

However, they were consistently incorrectly generated:

* If we used a `full-size-icon.png` source, only the `.svg` file generated at all - the others were blank
* If we used a `full-size-icon.svg` source (needed to get something that worked [from Adobe first](https://www.adobe.com/express/feature/image/convert/png-to-svg)), then the `.svg` file didn't look great, and all others were incorrectly position - the image content too small, and off-center

Eventually, we could come back to this, and even open an issue on the repo: https://github.com/RealFaviconGenerator/core

For now, we ask users to manually generate their necessary files on https://realfavicongenerator.net/

Interested in simplifying this? Let me know - PRs welcome!