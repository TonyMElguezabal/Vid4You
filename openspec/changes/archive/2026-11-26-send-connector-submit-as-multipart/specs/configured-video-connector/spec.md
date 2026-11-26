## ADDED Requirements

### Requirement: The submit step can be sent as a multipart form with the image

A submit step MAY name a `multipartField`. When it does, the connector SHALL send the submit request as `multipart/form-data`: each field of the submit body as one text part holding its filled value, and the scene image as a file part named by `multipartField`, with the image's real type and the name `frame.png` or `frame.jpg`. The connector SHALL add no other part. Without `multipartField` the submit step SHALL be sent as JSON, as before. With it, saving SHALL be refused when the body is missing or holds a value that is not text, a number or true/false, when a body field has the same name as `multipartField`, when the method is `GET`, or when the headers set `Content-Type`.

#### Scenario: A Viggle clip

- **GIVEN** the Viggle definition of `docs/video-connector-definitions.md`
- **WHEN** a 6-second clip is submitted
- **THEN** one multipart request is sent whose text parts are exactly the body's fields, with `duration_s` `6` and `enhance` `false`, and whose `first_frame_image` part is the scene image

#### Scenario: A JPEG scene image

- **WHEN** a multipart submit is made for a JPEG scene image
- **THEN** the file part is `frame.jpg` of type `image/jpeg`

#### Scenario: A form field that cannot be sent as text

- **WHEN** the Administrator saves a multipart submit whose body holds an object or a list
- **THEN** the save is refused with a problem on `requests.submit.body`
