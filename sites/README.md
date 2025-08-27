# sites

> [!TIP]
> Follow the [Getting Started guide](../docs/GETTING_STARTED.md) to create your first site, using the interactive site creator.



---

Here, we configure the different sites (typically one site per transcribed podcast) managed by the repo. 

Each site defines a few things, including its:
* id
* domain where it will be accessible
* name & description
* RSS feed
* styling
* a few .env variables, including AWS SSO username for deployment

The primary repo - [jackkoppa/browse-dot-show](https://github.com/jackkoppa/browse-dot-show) - provides a template structure for creating sites in [my-sites/](./my-sites/).

Example sites are available in a separate repository: [browse-dot-show-example-sites](https://github.com/jackkoppa/browse-dot-show-example-sites) (coming soon).

All forked repos should define their sites in [my-sites/](./my-sites/).
