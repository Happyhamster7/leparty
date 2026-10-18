-- LeParty — expand potluck categories
-- From three categories (protein, sweets, alcohol) to five: protein,
-- carbs, snacks, sweets, alcohol. Still no targets, just a count.

update participants
   set potluck_category = null
 where potluck_category is not null
   and potluck_category not in ('protein', 'carbs', 'snacks', 'sweets', 'alcohol');

alter table participants
  drop constraint if exists participants_potluck_category_check;

alter table participants
  add constraint participants_potluck_category_check
  check (potluck_category in ('protein', 'carbs', 'snacks', 'sweets', 'alcohol'));
