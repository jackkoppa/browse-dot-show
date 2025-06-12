# @browse-dot-show/process-audio-lambda

This Lambda function processes new audio files by transcribing them using Whisper API and applying spelling corrections to improve transcript accuracy.

## Spelling Corrections

> [!TIP]
> Add custom, gitignored spelling corrections at [utils/_custom-spelling-corrections.json](./utils/_custom-spelling-corrections.json)

### How It Works

The spelling correction system automatically fixes common transcription errors in SRT files based on a configuration file (`utils/spelling-corrections.json`). 

#### In the Lambda Process

When new audio files are transcribed:

1. **Audio Transcription**: Audio files are processed through Whisper API to generate SRT transcripts
2. **Automatic Corrections**: Immediately after each transcript is created, spelling corrections are applied automatically
3. **Logging**: The Lambda logs a summary of all corrections applied during the run, showing:
   - Total number of corrections applied
   - Breakdown by correction type (e.g., "Charlie Eccleshare": 3 corrections)

#### Configuration

Spelling corrections are defined in `utils/spelling-corrections.json` with the following structure:

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

To apply spelling corrections to all existing SRT files:

```bash
# Against local S3 (using .env.local)
pnpm process-audio-lambda:run:spelling-corrections:local

# Against dev S3 (using .env.dev)
pnpm process-audio-lambda:run:spelling-corrections:dev-s3
```

These commands will:
- Process all `.srt` files in the `transcripts/` directory
- Apply corrections and save updated files
- Display a comprehensive summary showing:
  - Total files processed
  - Number of files that had corrections applied
  - Total corrections applied
  - Breakdown by correction type

#### Within the Package Directory

You can also run the corrections script directly from within the package:

```bash
cd packages/ingestion/process-audio-lambda

# Local S3
pnpm run:spelling-corrections:local

# Dev S3  
pnpm run:spelling-corrections:dev-s3
```

### Adding New Corrections

To add new spelling corrections:

1. Edit `utils/spelling-corrections.json`
2. Add the new misspellings and correct spelling to the `correctionsToApply` array
3. Deploy the updated Lambda or run the corrections script manually

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