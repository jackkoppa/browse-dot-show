# Tools to run browse.show on a Mac. `./scripts/bootstrap.sh` installs them with
# `brew bundle`; see docs/scheduled-ingestion.md.

# keg-only: not on PATH by default. Scheduled runs use its absolute path
# ($(brew --prefix node@22)/bin/node), so nvm or another Node can stay your shell's default.
brew "node@22"
brew "ffmpeg"       # ffmpeg + ffprobe: audio splitting and durations
brew "awscli"       # S3 sync, role assumption, CloudFront invalidations
brew "whisper.cpp"  # whisper-cli; `pnpm bds setup machine` downloads the model

# Only needed to deploy (Terraform runs in GitHub Actions; a machine that only ingests
# doesn't need it):
# tap "hashicorp/tap"
# brew "hashicorp/tap/terraform"
