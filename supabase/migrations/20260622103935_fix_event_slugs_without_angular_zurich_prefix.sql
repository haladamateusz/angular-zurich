update public."Events"
set slug = trim(
  both '-'
  from regexp_replace(
    lower(regexp_replace(title, '^Angular Zurich[[:space:]]+', '', 'i')),
    '[^a-z0-9]+',
    '-',
    'g'
  )
);
