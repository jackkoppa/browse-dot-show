import { execFile } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

/**
 * The site stack's lambda layers are built from zips in `terraform/sites/lambda-layers/` that
 * are gitignored (see its README), so a CI runner doesn't have them. Rebuilding them wouldn't
 * give the same bytes (zip timestamps; one is downloaded from a generator service), and
 * Terraform compares `filebase64sha256(zip)`, so any difference would publish new layer
 * versions on every site.
 *
 * Instead, CI downloads the zip of each site's latest deployed layer version: byte-identical,
 * so the plan shows no layer change. To change a layer, deploy it locally (`bds site deploy`)
 * with the new zip; later CI runs then pick that version up.
 */

export interface LayerZip {
  /** File name in terraform/sites/lambda-layers/ (as referenced by terraform/sites/main.tf) */
  file: string;
  layerName: string;
}

export function siteLayerZips(siteId: string): LayerZip[] {
  return [
    { file: 'ffmpeg-layer.zip', layerName: `ffmpeg-${siteId}` },
    { file: 'mongodb-js-zstd__msgpackr.zip', layerName: `compress-encode-${siteId}` },
  ];
}

export interface LatestLayerVersion {
  arn: string;
  /** base64 SHA-256 of the zip, as reported by Lambda */
  codeSha256: string;
  /** Pre-signed download URL (valid for 10 minutes) */
  url: string;
}

export interface LayerDeps {
  latestLayerVersion: (layerName: string) => Promise<LatestLayerVersion | undefined>;
  download: (url: string) => Promise<Buffer>;
  log: (message: string) => void;
}

export function sha256Base64(data: Buffer): string {
  return createHash('sha256').update(data).digest('base64');
}

/** Make sure each layer zip exists in `dir`, downloading the deployed version when it doesn't. */
export async function ensureSiteLayerZips(siteId: string, dir: string, deps: LayerDeps = awsLayerDeps()): Promise<void> {
  for (const layer of siteLayerZips(siteId)) {
    const filePath = path.join(dir, layer.file);
    if (fs.existsSync(filePath)) {
      deps.log(`Layer zip ${layer.file}: using the local file`);
      continue;
    }
    const latest = await deps.latestLayerVersion(layer.layerName);
    if (!latest) {
      throw new Error(`No deployed versions of layer ${layer.layerName}, so ${layer.file} can't be downloaded. Deploy ${siteId} locally first (bds site deploy).`);
    }
    const data = await deps.download(latest.url);
    const sha = sha256Base64(data);
    if (sha !== latest.codeSha256) {
      throw new Error(`Downloaded ${layer.file} from ${latest.arn} doesn't match its CodeSha256 (${sha} vs ${latest.codeSha256})`);
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, data);
    deps.log(`Layer zip ${layer.file}: downloaded from ${latest.arn} (${(data.length / 1024 / 1024).toFixed(1)} MB, sha256 ${sha})`);
  }
}

const execFileAsync = promisify(execFile);

/** The AWS CLI, with credentials from the environment (OIDC in CI, AWS_PROFILE locally). */
export function awsLayerDeps(): LayerDeps {
  const aws = async (args: string[]) => {
    const { stdout } = await execFileAsync('aws', [...args, '--output', 'json'], {
      env: { ...process.env, AWS_REGION: process.env.AWS_REGION || 'us-east-1' },
    });
    return JSON.parse(stdout);
  };
  return {
    async latestLayerVersion(layerName) {
      const { LayerVersions: versions = [] } = await aws(['lambda', 'list-layer-versions', '--layer-name', layerName, '--max-items', '1']);
      if (versions.length === 0) return undefined;
      const version = await aws(['lambda', 'get-layer-version-by-arn', '--arn', versions[0].LayerVersionArn]);
      return { arn: version.LayerVersionArn, codeSha256: version.Content.CodeSha256, url: version.Content.Location };
    },
    async download(url) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Layer download failed: HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    },
    log: message => console.log(message),
  };
}
