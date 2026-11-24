## ADDED Requirements

### Requirement: A voice-over whose volume drifts is levelled before it is stored

Before storing the provider's audio, the system SHALL measure the loudness of the speech in consecutive 10-second windows, ignoring silence and windows with fewer than 4 seconds of speech. A window SHALL count as a dip when its level is more than 6 dB below the median level of all measured windows. When the audio has fewer than 3 measured windows, or no dip, the system SHALL store the provider's audio unchanged, byte for byte.

When there is at least one dip, the system SHALL level the audio once and measure the result. The system SHALL store the levelled audio instead of the provider's only when its deepest dip is smaller than the original's, its duration differs from the original's by at most one frame at the final video's frame rate, and its loudest peak does not exceed −1 dBFS. Otherwise the system SHALL store the provider's audio unchanged. The system SHALL NOT fail the session, change its state, or retry the provider because of this step, and SHALL log a warning when it stores the provider's audio although a dip was found. The system SHALL NOT change the stored native timestamps.

#### Scenario: The audio has no dip

- **WHEN** the provider returns audio whose measured windows are all within 6 dB of the median
- **THEN** the stored MP3 is byte-identical to the audio the provider returned

#### Scenario: The audio has a dip and levelling improves it

- **WHEN** the provider returns audio with a window 9 dB below the median
- **THEN** the levelled audio is stored
- **AND** its deepest dip is smaller than 9 dB
- **AND** its duration equals the original's within one frame
- **AND** its loudest peak is at most −1 dBFS

#### Scenario: A dip exactly at the trigger

- **WHEN** the deepest window is exactly 6 dB below the median
- **THEN** the provider's audio is stored unchanged

#### Scenario: A dip just beyond the trigger

- **WHEN** the deepest window is 6.1 dB below the median
- **THEN** the audio is levelled

#### Scenario: A short or quiet-by-design stretch is not a dip

- **WHEN** the audio has a quiet stretch shorter than one 10-second window, or pauses with no speech
- **THEN** it does not count as a dip
- **AND** silence is not amplified

#### Scenario: The audio is too short to judge

- **WHEN** the provider returns audio with fewer than 3 measured windows
- **THEN** the provider's audio is stored unchanged

#### Scenario: Levelling does not improve the audio

- **WHEN** the levelled audio's deepest dip is not smaller than the original's
- **THEN** the provider's audio is stored unchanged
- **AND** a warning is logged

#### Scenario: Levelling would clip or change the length

- **WHEN** the levelled audio's peak exceeds −1 dBFS or its duration differs by more than one frame
- **THEN** the provider's audio is stored unchanged
- **AND** a warning is logged

#### Scenario: The levelling tool fails

- **WHEN** measuring or levelling fails because the media tool cannot run or errors
- **THEN** the provider's audio is stored unchanged
- **AND** the session reaches `voice-over-complete` as it would without this step
- **AND** a warning is logged

#### Scenario: Timestamps stay valid

- **WHEN** levelled audio is stored
- **THEN** the native timestamps stored with it are the provider's, unmodified
- **AND** the recorded duration is the stored MP3's measured duration
