# Example Site Template

This is a template for creating your own podcast archive site. Copy this directory and customize the files to create your own site.

## Quick Setup

1. **Copy this directory**:
   ```bash
   cp -r sites/my-sites/example-site sites/my-sites/your-site-name
   cd sites/my-sites/your-site-name
   ```

2. **Configure your site**: Edit `site.config.json` with your podcast details

3. **Set up AWS**: Copy `aws.config.template` to `.env.aws` and add your AWS profile

4. **Customize styling** (optional): Edit `index.css` or delete it to use defaults

5. **Test locally**:
   ```bash
   pnpm setup:site-directories
   pnpm client:dev
   ```

6. **Deploy**:
   ```bash
   pnpm all:deploy
   ```

## File Descriptions

- **`site.config.json`**: Main configuration (site name, domain, podcast feeds)
- **`aws.config.template`**: Template for AWS credentials (copy to `.env.aws`)
- **`index.css`**: Optional custom styling
- **`README.md`**: This file (you can delete it)

## Configuration Tips

### Finding RSS Feeds
- Look for RSS/XML links on the podcast website
- Check podcast directories like Apple Podcasts, Spotify
- Common RSS feed patterns: `feeds.simplecast.com`, `feeds.megaphone.fm`

### Choosing Site ID
- Use lowercase letters and hyphens only
- This becomes part of your AWS resource names
- Examples: `my-podcast`, `tech-talks`, `comedy-archive`

### Domain Setup
- You can use a subdomain like `my-podcast.browse.show`
- Or your own domain like `my-podcast-archive.com`
- Make sure you have access to configure DNS

## Need Help?

Check the main documentation in `../README.md` or look at the working examples in `../../origin-sites/`. 