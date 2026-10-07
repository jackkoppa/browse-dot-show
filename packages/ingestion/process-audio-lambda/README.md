# @browse-dot-show/process-audio-lambda

This Lambda function processes new audio files by transcribing them using Whisper API and applying spelling corrections to improve transcript accuracy.

## Spelling Corrections

> [!TIP]
> Add custom, gitignored spelling corrections at `packages/spelling/_custom-spelling-corrections.json`

### How It Works

The spelling correction system automatically fixes common transcription errors in SRT files using `@browse-dot-show/spelling` (`packages/spelling`). Each site's corrections live in `sites/origin-sites/<site>/spelling-corrections.json`.

#### In the Lambda Process

When new audio files are transcribed:

1. **Audio Transcription**: Audio files are processed through Whisper API to generate SRT transcripts
2. **Automatic Corrections**: Immediately after each transcript is created, spelling corrections are applied automatically
3. **Logging**: The Lambda logs a summary of all corrections applied during the run, showing:
   - Total number of corrections applied
   - Breakdown by correction type (e.g., "Charlie Eccleshare": 3 corrections)

#### Configuration

Each site's `spelling-corrections.json` has this structure:

```json
{
  "correctionsToApply": [
    {
      "misspellings": [
        "Charlie Eccleshead",
        "Charlie Eccleshire",
        "Charlie Eckershire"
      ],
      "correctedSpelling": "Charlie Eccleshare"
    }
  ]
}
```

The system:
- Performs case-insensitive matching
- Only matches whole words (uses word boundaries)
- Applies corrections in the order specified in the configuration

### Running Spelling Corrections

#### On All Existing Transcripts

To reapply the current corrections to every existing `.srt` file of a site, run only that step of the pipeline from the repo root:

```bash
pnpm bds ingest --sites=<site> --reapply-spelling-corrections --skip=pre-sync,rss,transcribe,s3-sync,cloudfront
```

Corrections change the transcripts, so the `index` phase then re-indexes the site. Drop `s3-sync` and `cloudfront` from `--skip` to upload the result. The run prints how many files were processed and corrected, with a breakdown by correction.

### Adding New Corrections

To add new spelling corrections:

1. Edit the site's `spelling-corrections.json`
2. Add the new misspellings and correct spelling to the `correctionsToApply` array
3. New transcripts pick it up automatically; reapply to existing transcripts as shown above

Example addition:
```json
{
  "misspellings": ["New Misspelling", "Another Variant"],
  "correctedSpelling": "Correct Spelling"
}
```

### Performance Notes

- Corrections are applied efficiently using regex patterns with word boundaries
- The system processes files in batches and continues processing even if individual files fail
- Corrections are only applied and saved if changes are needed (no unnecessary writes)
- The system handles large SRT files efficiently without loading entire content into memory