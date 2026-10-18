-- LeParty — enforce unique attendee names
-- Self-service /signup now matches returning guests by name, so two
-- different real people can no longer share a display_name going
-- forward. A functional unique index on lower(trim(display_name))
-- catches case/whitespace variants of the same name, not just exact
-- byte-for-byte duplicates.

create unique index if not exists people_display_name_unique_idx
  on people (lower(trim(display_name)));
