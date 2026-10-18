-- LeParty — simplify potluck categories
-- Replaces the six-category target system (main/side/dessert/snack/ice/
-- mixer, each with a host-set target) with three categories (protein,
-- sweets, alcohol) and no targets — just a running count of who's
-- bringing what.

-- Existing picks under the old categories don't map to the new set;
-- clear them so the check constraint below isn't violated. Guests are
-- asked again next time they open the potluck step.
update participants
   set potluck_category = null
 where potluck_category is not null
   and potluck_category not in ('protein', 'sweets', 'alcohol');

alter table participants
  drop constraint if exists participants_potluck_category_check;

alter table participants
  add constraint participants_potluck_category_check
  check (potluck_category in ('protein', 'sweets', 'alcohol'));

-- Targets no longer exist; drop them from events already carrying the
-- old default/config shape, and from the column default for new events.
update events
   set config = config - 'potluck_targets'
 where config ? 'potluck_targets';

alter table events
  alter column config set default '{
    "block_count": 8,
    "starting_sentence": 25,
    "starting_commissary": 200
  }'::jsonb;
