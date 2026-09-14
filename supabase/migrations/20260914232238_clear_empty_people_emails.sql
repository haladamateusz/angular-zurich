-- Store missing email addresses as NULL instead of empty strings.
update public."People"
set email = null
where email = '';
