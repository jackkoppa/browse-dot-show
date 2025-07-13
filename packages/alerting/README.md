# alerting

This package will be used by the 3 `/packages/ingestion` Lambdas to send messages to Slack, when there are errors either locally (e.g. from running `ingestion:run-pipeline:triggered-by-schedule`), or on AWS (e.g. one of the ingestion Lambdas encountering an error).

Dev will provide necessary Slack API keys or setup for their Slack instance (currently using http://you-can-sit-with-us.slack.com/, but both the domain & API keys will of course eventually need to be in `.env` files)

For now, we should set up all the alerting functionality that we can (including being able to format messages, include a snippet of the relevant error, link to the relevant CloudWatch log page if the error occurred in AWS, and also be able to `@here` tag in the channel where the messages are sent if `severity=critical`)

Setup all functionality that we can for this before we have the Slack API key(s) necessary for testing, and explain to dev what setup will be needed on the Slack side before we can first test locally.