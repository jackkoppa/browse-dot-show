# Additional Info


Here are the contents of some current .env files, for reference


`/Users/jackkoppa/Personal_Development/browse-dot-show/.env`

```
# This file is the only /packages/processing/.env file committed for this directory, and serves as a template for the others
# e.g. `.env.dev` & `.env.local`, which are gitignored
# This .env file is used for any /packages/processing/ lambdas

# Options: trace, debug, info, warn, error
# Defined here: https://github.com/pimterry/loglevel?tab=readme-ov-file#logging-methods
LOG_LEVEL=

# Whether to use local (for testing/development) or AWS S3 for file storage
# Options: local, dev-s3, prod-s3
FILE_STORAGE_ENV=

# If using AWS S3, the AWS profile to use; see /README.md for SSO setup instructions
# e.g. MyProfileName-000000000000
AWS_PROFILE=

# If using AWS S3, the AWS region to use
# e.g. us-east-1
AWS_REGION=

# Which API provider being used for Whisper transcription
# Implementing multiple options, given cost differences
# Options: openai, replicate, local-whisper.cpp
WHISPER_API_PROVIDER=

# OpenAI API Key for Whisper transcription, if using OpenAI
OPENAI_API_KEY="your_api_key_here"

# Repliacte API Key for Whisper transcription, If using Replicate
REPLICATE_API_KEY="your_api_key_here"

# Path to whisper.cpp directory for local transcription
# Required when WHISPER_API_PROVIDER=local-whisper.cpp
# e.g. /Users/username/whisper.cpp
WHISPER_CPP_PATH=""

# Name of the whisper model used for local transcription; pick from these options: https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md
# Required when WHISPER_API_PROVIDER=local-whisper.cpp - make sure to first follow setup steps for that model, for your machine - https://github.com/ggml-org/whisper.cpp/blob/master#quick-start
# recommended: large-v3-turbo
WHISPER_CPP_MODEL=""
```





`/Users/jackkoppa/Personal_Development/browse-dot-show/.env.local`

```
# This file is the only /packages/processing/.env file committed for this directory, and serves as a template for the others
# e.g. `.env.dev` & `.env.local`, which are gitignored
# This .env file is used for any /packages/processing/ lambdas

# Options: trace, debug, info, warn, error
# Defined here: https://github.com/pimterry/loglevel?tab=readme-ov-file#logging-methods
LOG_LEVEL=info

# Prefix required for Vite builds
VITE_LOG_LEVEL=info

# Whether to use local (for testing/development) or AWS S3 for file storage
# Options: local, dev-s3, prod-s3
FILE_STORAGE_ENV=local

# If using AWS S3, the AWS profile to use; see /README.md for SSO setup instructions
# e.g. MyProfileName-000000000000
AWS_PROFILE=

# If using AWS S3, the AWS region to use
# e.g. us-east-1
AWS_REGION=

# Which API provider being used for Whisper transcription
# Implementing multiple options, given cost differences
# Options: openai, replicate, local-whisper.cpp
WHISPER_API_PROVIDER=local-whisper.cpp

# OpenAI API Key for Whisper transcription, if using OpenAI
OPENAI_API_KEY="some-key-here"

# Repliacte API Key for Whisper transcription, If using Replicate
REPLICATE_API_KEY="your_api_key_here"

# Path to whisper.cpp directory for local transcription
# Required when WHISPER_API_PROVIDER=local-whisper.cpp
# e.g. /Users/username/whisper.cpp
WHISPER_CPP_PATH="/Users/jackkoppa/Personal_Development/whisper.cpp"

# Name of the whisper model used for local transcription; pick from these options: https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md
# Required when WHISPER_API_PROVIDER=local-whisper.cpp - make sure to first follow setup steps for that model, for your machine - https://github.com/ggml-org/whisper.cpp/blob/master#quick-start
# recommended: large-v3-turbo
WHISPER_CPP_MODEL="large-v3-turbo"
```


`/Users/jackkoppa/Personal_Development/browse-dot-show/sites/origin-sites/listenfairplay/.env.aws`

```
AWS_PROFILE=AdministratorAccess_dev_LFP-296297840998
```
