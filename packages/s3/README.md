# AWS S3 Client Utility

This utility provides a consistent interface for file operations, whether running locally or in AWS environments.

## Environment Modes

The utility supports three modes, controlled by the `FILE_STORAGE_ENV` environment variable:

- `local` (default): Files are stored in the local filesystem at `aws-local-dev/s3/`
- `dev-s3`: Files are stored in the dev S3 bucket
- `prod-s3`: Files are stored in the prod S3 bucket

## API

The following functions are provided:

- `fileExists(key: string)`: Check if a file exists
- `directoryExists(prefix: string)`: Check if a directory exists
- `createDirectory(prefix: string)`: Create a directory
- `getFile(key: string)`: Retrieve a file as a Buffer
- `listFiles(prefix: string)`: List files with a given prefix
- `saveFile(key: string, content: Buffer | string)`: Save a file
- `deleteFile(key: string)`: Delete a file
- `getSignedUrl(key: string, expirationSeconds = 3600)`: Get a signed URL for temporary access

## Example Usage

```typescript
import { fileExists, getFile, saveFile, createDirectory } from '@browse-dot-show/s3';

export async function processAudioFile(key: string): Promise<void> {
  // Create output directory if it doesn't exist
  const outputDir = 'processed/';
  await createDirectory(outputDir);
  
  // Check if file exists
  if (await fileExists(key)) {
    // Get the file content
    const audioData = await getFile(key);
    
    // Process the audio data...
    const processedData = await someProcessingFunction(audioData);
    
    // Save the processed result
    const outputKey = `${outputDir}${path.basename(key)}`;
    await saveFile(outputKey, processedData);
  }
}
```

## Testing Locally

Set the environment variable to `local` to test with local filesystem:

```bash
FILE_STORAGE_ENV=local node your-script.js
```

When deployed as a Lambda function, the environment will be configured via the Lambda environment variables. 