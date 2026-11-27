## MODIFIED Requirements

### Requirement: Provider-usage report
`GET /admin/reports/provider-usage` SHALL return one row per stage (voice, alignment, reasoning, image, video) and provider that has at least one counted attempt in the period. Each row SHALL carry:
- the provider id and its display name;
- attempts, successes, transient failures, not-retryable failures and timed-out attempts;
- the success rate: successes over attempts, in percent, one decimal;
- the median and the 95th-percentile request latency in milliseconds (nearest rank);
- the billed units with their unit.

A counted attempt is one that was sent and has a final outcome; a late success SHALL count as a success. A narration take that was sent (spec `scene-narration-redo`) SHALL be a counted voice attempt of the provider it was sent to. It is a success when the provider returned audio, even if the take could not be fitted, and a failure, with its outcome, otherwise.

Billed units SHALL count successful attempts only:
- voice characters for voice: the script's length for a voice-over, and the characters re-read for a narration take;
- audio seconds (the voice-over's duration) for alignment;
- one request for reasoning;
- one image for image;
- the requested clip seconds for video.

The Reports section SHALL show these rows in a table.

#### Scenario: Usage per stage and provider
- **WHEN** sessions in the last 30 days made voice, alignment, reasoning, image and clip attempts with known outcomes and latencies
- **THEN** each stage and provider is one row with the counts, the success rate, the median and 95th-percentile latency and the billed units that those attempts give

#### Scenario: A narration take counts as voice
- **WHEN** a session's voice-over of 13,000 characters and one narration take of 283 characters both succeeded on the same voice provider in the period
- **THEN** that provider's voice row has 2 attempts, 2 successes and 13,283 billed characters

#### Scenario: Provider without attempts in the period is not listed
- **WHEN** a provider profile exists, or had attempts before the period, but has no attempt sent in the period
- **THEN** it has no row

#### Scenario: Native timestamps are not an alignment call
- **WHEN** a session's alignment used the voice provider's native timestamps
- **THEN** that attempt is not counted in any alignment row

#### Scenario: Attempts not sent or not finished are not counted
- **WHEN** an attempt is scheduled, in flight, superseded or cancelled
- **THEN** it is not counted

#### Scenario: Failed attempts bill nothing
- **WHEN** a clip attempt failed and a later one for the same scene succeeded
- **THEN** both are attempts, and only the successful one adds its requested seconds to the billed units

#### Scenario: Empty period
- **WHEN** no attempt was sent in the period
- **THEN** the report has no rows and the section says there was no provider activity in the period
