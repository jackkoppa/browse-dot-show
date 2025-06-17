# sites

Here, we configure the different sites (typically one site per transcribed podcast) managed by the repo. 

Each site defines a few things, including its:
* id
* domain where it will be accessible
* name & description
* RSS feed
* styling
* a few .env variables, including AWS SSO username for deployment

The primary repo - [jackkoppa/browse-dot-show](https://github.com/jackkoppa/browse-dot-show) - will define the sites it hosts, in [origin-sites/](./origin-sites/).

All other repos will define their sites in [my-sites/](./my-sites/).
