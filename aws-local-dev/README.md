// CURSOR-TODO: It's important that when using `aws-local-dev`, we can now have it segmented by `/sites` - e.g. when `/Users/jackkoppa/Personal_Development/browse-dot-show/packages/s3/index.ts` is running in local mode, for a given site, it should *not* just put all files in `/aws-local-dev/`. It should put them in `/aws-local-dev/{siteID}/`


# aws-local-dev

In this directory (which aside from this README, is gitignored), we save local files that will be available from AWS for production deployments (primarily S3)

During local dev, those resources are retrieved from here _instead of_ AWS.

## S3

Expected structure of S3 Bucket

/aws-local-dev # should match S3 bucket structure in prod
|--s3
   |--rss
   |  # RSS feeds retrieved based on /podcasts.manifest.json
   |--audio
   |  # .mp3 files for retrieved episodes
   |--transcripts
   |  # .srt files for transcribed episodes
