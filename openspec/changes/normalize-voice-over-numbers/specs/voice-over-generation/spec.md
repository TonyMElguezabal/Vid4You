## MODIFIED Requirements

### Requirement: The locked script is sent to the provider unaltered

The text sent to the voice provider SHALL be identical to the session's stored script. The voice, quality and speed SHALL be the hardcoded values, and the language SHALL be the session's selected language. The system SHALL NOT trim, summarise, rewrite or split the script to fit a provider restriction. The request SHALL ask the voice provider to always normalise numbers, currency, percentages and dates when reading the script aloud, so that figures are spoken in full words.

#### Scenario: A script is sent for narration

- **WHEN** the voice request for a session is built
- **THEN** the text it carries is identical to the session's stored script
- **AND** the voice, quality and speed are the hardcoded values
- **AND** the language is the session's selected language

#### Scenario: A very long script is sent

- **WHEN** a session whose script is far longer than the 1500-word reference is narrated
- **THEN** the text sent is the complete script, unaltered

#### Scenario: A script with figures is sent for narration

- **WHEN** the voice request is built for a script that contains amounts such as `$2,640` or `$2,512.80`, percentages such as `20%`, or ordinals such as `7th`
- **THEN** the request asks the provider to always normalise the text
- **AND** the text it carries still contains those figures exactly as stored
