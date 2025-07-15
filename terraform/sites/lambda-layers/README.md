# lambda-layers

For certain NPM packages, that require architecture-specific build scripts, it's simpler to use a Lambda Layer, than to try to include that package in node_modules, and/or bundle the package into our dist file.

Some docs on Lambda Layers:
https://docs.aws.amazon.com/lambda/latest/dg/nodejs-layers.html

We've used this very helpful site to generate layers for NPM packages:
https://nodelayer.xyz/

We also might need Lambda Layers for OS/terminal dependencies (i.e. _not_ NPM packages). We'll list those here as well.

## Layers

### 1.  `@mongodb-js/zstd` & `msgpackr`

1. **Download the static binaries:**
   ```shell
   cd terraform/sites/lambda-layers
   curl -L --fail-with-body -o mongodb-js-zstd__msgpackr.zip "https://api.nodelayer.xyz/arm64/layers/generate?version=v20.19.3&packages=@mongodb-js/zstd,msgpackr"
   ```

2. **Deploy with Terraform:**
   The `mongodb-js-zstd__msgpackr.zip` file is automatically referenced in `terraform/sites/main.tf`:
   ```hcl
   resource "aws_lambda_layer_version" "compress_encode_layer" {
      filename         = "lambda-layers/mongodb-js-zstd__msgpackr.zip"
      layer_name       = "compress-encode-${var.site_id}"
      # ...
   }
   ```


### 2. `ffmpeg` - for media processing

**Source:** https://johnvansickle.com/ffmpeg/ - `ffmpeg-release-arm64-static.tar.xz`

**Setup Instructions:**

1. **Download the static binaries:**
   ```bash
   cd terraform/sites/lambda-layers
   curl -O https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz
   ```

2. **Prepare the Lambda layer:**
   ```bash
   tsx 2-prepare-ffmpeg-layer.ts
   ```

   This script will:
   - Extract the tar file
   - Create proper directory structure (`ffmpeg-layer/bin/`)
   - Move `ffmpeg` and `ffprobe` binaries to the `bin/` directory
   - Remove unnecessary files to reduce layer size
   - Create `ffmpeg-layer.zip` ready for Lambda deployment

3. **Deploy with Terraform:**
   The `ffmpeg-layer.zip` file is automatically referenced in `terraform/sites/main.tf`:
   ```hcl
   resource "aws_lambda_layer_version" "ffmpeg_layer" {
     filename         = "lambda-layers/ffmpeg-layer.zip"
     layer_name       = "ffmpeg-${var.environment}"
     # ...
   }
   ```

**Notes:**
- The original `.tar.xz` file is `.gitignored` due to its size (~18MB)
- The generated `ffmpeg-layer.zip` should also be `.gitignored` and created as needed
- Binaries are placed in `/opt/bin/` when the layer is attached to a Lambda function
- Our code automatically detects Lambda environment and uses `/opt/bin/ffmpeg` and `/opt/bin/ffprobe`

**Usage in Lambda:**
The ffmpeg utilities are automatically available in Lambda functions that include this layer:
- `ffmpeg` and `ffprobe` binaries are accessible via `/opt/bin/`
- Our `ffmpeg-utils.ts` handles path detection automatically
- No additional configuration needed in function code 