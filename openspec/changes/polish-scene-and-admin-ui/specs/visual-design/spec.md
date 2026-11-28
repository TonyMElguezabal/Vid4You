## ADDED Requirements

### Requirement: Actions have three visual weights

Every button and button-styled link SHALL use one of three weights from the token set: **main** (filled with the accent colour, at most one per form or action bar), **normal** (the raised surface key), or **quiet** (accent-coloured text with no fill, border or shadow until hovered). Quiet SHALL be used for actions that show, hide, reset, cancel or download, and never for the action that submits a form. A button that shows only an icon SHALL have an accessible name, a tooltip saying its action, and a hit area of at least 40 by 40 px.

#### Scenario: A scene's Rebuild form

- **WHEN** the User opens Rebuild scene on an opened scene
- **THEN** its submit button ("Rebuild image and clip", or "Rebuild clip" with Clip only chosen) is the form's only main button and "Cancel" is quiet

#### Scenario: An icon-only player button

- **WHEN** a scene card shows its clip player
- **THEN** each player button shows only an icon, has its accessible name, and shows its action as a tooltip on hover

### Requirement: Native dropdowns keep their behaviour with a drawn arrow

Every `<select>` SHALL stay a native select, with its keyboard behaviour and the operating system's list of options. It SHALL show a drawn down-arrow at a fixed inset from its right edge, coloured from a token defined for both themes, and its text SHALL never run under the arrow.

#### Scenario: A long option

- **WHEN** the selected option of `Video provider` is longer than the select is wide
- **THEN** the text is cut before the arrow, and the arrow stays fully visible

#### Scenario: Dark theme

- **WHEN** the operating system's colour scheme is dark
- **THEN** every select's arrow takes its colour from the dark palette
