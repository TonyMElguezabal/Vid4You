## MODIFIED Requirements

### Requirement: The scene-details panel shows the requested duration and speed factor

The frontend's scene-details panel SHALL show a chunk's requested duration and speed factor, and any recorded duration or speed-factor warning, when the scene carries them. The requested duration SHALL be shown in seconds with its unit (`15 s`). The speed factor SHALL be shown rounded to two decimals after a multiplication sign (`×1.16`). The stored values are not changed.

#### Scenario: A scene's details are opened

- **GIVEN** a chunk with `requestedDurationSeconds: 15`, `speedFactor: 1.1599999999999999`, and no warnings
- **WHEN** its scene details are expanded
- **THEN** the panel shows the requested duration as `15 s` and the speed factor as `×1.16`

#### Scenario: A warning is shown alongside the value it qualifies

- **GIVEN** a chunk whose `speedFactorWarning` is recorded
- **WHEN** its scene details are expanded
- **THEN** the panel shows the warning next to the speed factor, distinguishable from a `durationWarning`

#### Scenario: A skeleton scene's details omit the fields

- **GIVEN** a scene created without a decomposition (no stored request)
- **WHEN** its scene details are expanded
- **THEN** the panel shows neither a requested duration nor a speed factor
