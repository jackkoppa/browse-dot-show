import * as fs from 'fs';
import * as path from 'path';
import { appSupportDir } from './user-dirs.js';

/**
 * Where local transcription finds whisper.cpp.
 *
 * The transcription lambda (process-audio) expects a whisper.cpp source checkout:
 * `$WHISPER_CPP_PATH/build/bin/whisper-cli` and `$WHISPER_CPP_PATH/models/ggml-<model>.bin`.
 * Homebrew's `whisper.cpp` installs only the binary, so for it `bds setup machine` creates a
 * folder with that same layout: `build/bin/whisper-cli` is a symlink to Homebrew's binary,
 * and `models/` holds the downloaded model. That keeps the lambda code (and every deployed
 * lambda) unchanged.
 */

/** Where Homebrew puts `whisper-cli` (Apple silicon, then Intel). */
export const HOMEBREW_WHISPER_CLI_CANDIDATES = ['/opt/homebrew/bin/whisper-cli', '/usr/local/bin/whisper-cli'];

/** The model scheduled runs use (best speed/accuracy trade-off in session 1's benchmark). */
export const DEFAULT_WHISPER_MODEL = 'large-v3-turbo';

/** Default `WHISPER_CPP_PATH` for a Homebrew install. */
export function defaultHomebrewWhisperDir(): string {
  return path.join(appSupportDir(), 'whisper.cpp');
}

export function findHomebrewWhisperCli(candidates = HOMEBREW_WHISPER_CLI_CANDIDATES): string | null {
  return candidates.find(candidate => fs.existsSync(candidate)) ?? null;
}

export interface WhisperPaths {
  dir: string;
  cli: string;
  model: string;
  /** Set when `build/bin/whisper-cli` is a symlink (a Homebrew layout): the link's target. */
  cliLinkTarget?: string;
}

/** The paths process-audio uses for a `WHISPER_CPP_PATH` and model name. */
export function whisperPaths(dir: string, model: string): WhisperPaths {
  const cli = path.join(dir, 'build', 'bin', 'whisper-cli');
  let cliLinkTarget: string | undefined;
  try {
    if (fs.lstatSync(cli).isSymbolicLink()) cliLinkTarget = fs.readlinkSync(cli);
  } catch {
    // doesn't exist
  }
  return { dir, cli, model: path.join(dir, 'models', `ggml-${model}.bin`), cliLinkTarget };
}

/**
 * Create (or repair) the checkout-like layout in `dir` for a Homebrew `whisper-cli`.
 * Doesn't touch an existing real binary (a source build). Returns the paths.
 */
export function ensureHomebrewWhisperLayout(dir: string, homebrewCli: string, model: string): WhisperPaths {
  const paths = whisperPaths(dir, model);
  fs.mkdirSync(path.dirname(paths.cli), { recursive: true });
  fs.mkdirSync(path.dirname(paths.model), { recursive: true });

  const isLink = paths.cliLinkTarget !== undefined;
  if (isLink && paths.cliLinkTarget !== homebrewCli) fs.rmSync(paths.cli);
  if (!fs.existsSync(paths.cli) && !isSymlink(paths.cli)) fs.symlinkSync(homebrewCli, paths.cli);
  return whisperPaths(dir, model);
}

/** Hugging Face URL of a ggml whisper model (the source whisper.cpp's download script uses). */
export function whisperModelUrl(model: string): string {
  return `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${model}.bin`;
}

function isSymlink(filePath: string): boolean {
  try {
    return fs.lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}
