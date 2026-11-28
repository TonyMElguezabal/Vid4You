## MODIFIED Requirements

### Requirement: Active providers are one compact row per stage
The "Active providers" section SHALL show one row per stage, with the rows' parts lined up in columns: the stage's name, the stage's select (named `{Stage} provider`) and its source as plain text, "from settings files" or "set on /admin". Below 640 px wide, each row SHALL stack its parts.

#### Scenario: One row per stage
- **WHEN** the Settings tab is shown
- **THEN** the Reasoning, Voice, Alignment, Image and Video providers each have one row with a select and its source
- **AND** the selects of all five rows start at the same horizontal position

### Requirement: Provider profiles are compact rows with an overflow menu
The "Providers" section SHALL show one card per stage with one row per profile: its name once, an "Active" badge right after the name when it is the active one, and its key source. The row's actions SHALL sit at its right end and SHALL show short visible labels while keeping their accessible names:
- a visible "Edit" button named `Edit {name}`;
- a "More actions for {name}" disclosure holding "Duplicate" (`Duplicate {name}`, a configured video connector only), "Test connection" (`Test connection {name}`) and "Delete" (`Delete {name}`), which closes when an item is chosen or Escape is pressed;
- an "Add" button named `Add {stage} provider` in the card header.

"Delete" and the charged test SHALL still ask for confirmation in the row. The charged-test confirmation and a test's result SHALL be shown in the row as a notice, with their buttons together.

#### Scenario: Row content
- **WHEN** a stage has one active profile named "OpenAI" with its key from the environment
- **THEN** its row shows "OpenAI" once, an "Active" badge and the key source, and a button showing "Edit" whose accessible name is "Edit OpenAI"

#### Scenario: Actions in the menu
- **WHEN** the Administrator opens "More actions for OpenAI"
- **THEN** "Test connection OpenAI" and "Delete OpenAI" are offered

#### Scenario: Delete still confirms
- **WHEN** the Administrator chooses "Delete OpenAI"
- **THEN** the row asks for confirmation and nothing is deleted until it is confirmed

#### Scenario: A charged test is a notice in the row
- **WHEN** the Administrator chooses "Test connection" on a profile whose check is charged
- **THEN** the row shows a notice that the check is charged, with "Send charged test" and "Cancel" side by side, and nothing is sent until it is confirmed

## ADDED Requirements

### Requirement: Each Administrator section starts with a heading row
Each section of an Administrator tab SHALL start with its heading and its description. Its buttons SHALL keep their own width, never stretched to the section's width, and SHALL line up with the content they act on.

#### Scenario: Settings tab
- **WHEN** the Settings tab is shown at 1280 px wide
- **THEN** "Visual style" and "Active providers" each start with a heading and a description
- **AND** no button in them is as wide as the section

### Requirement: Failed stages are compact rows
The "Failed stages" section SHALL show each listed stage as one row, not as a bulleted list item. A row SHALL show the stage and what it belongs to (the session and, for an image or a video stage, the scene), the provider it is bound to and the active provider, and the cause. Its move button SHALL sit at the row's right end, show the visible text "Move", and keep the accessible name `Move {stage} of {session}[, scene {n}] to {active provider}`.

#### Scenario: A failed clip on another provider
- **GIVEN** a scene 2 whose video stage failed on `stub-a` while the active video provider is `stub-b`
- **WHEN** the Failed stages tab is shown
- **THEN** its row shows the stage, the session, scene 2, `stub-a`, `stub-b` and the cause
- **AND** a button showing "Move" whose accessible name names the stage, the session, scene 2 and `stub-b`
