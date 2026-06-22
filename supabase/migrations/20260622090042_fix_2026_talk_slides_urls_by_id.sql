update public."Talks"
set slides_url = case id
  when '01def749-6c14-408a-9d65-8b2a5bbd8061' then 'https://docs.google.com/presentation/d/1F63ib9MSYn6xDZKnmEzgEowUYJMY7ix7PhjQeD45NE0/edit?usp=sharing'
  when '7aec5228-8982-40ff-80cd-7422ba41294d' then 'https://docs.google.com/presentation/d/1OFiZRjDEFiXSihmYojcgwvuPEOEL6b4W0BmoRt_DBHU/edit?usp=sharing'
  when '6b117c84-d39f-4c91-b6f8-e55459035983' then 'https://docs.google.com/presentation/d/1XpNwr0A50ADy-983bCYSh8zWdLKnVxMkUc7jUCClqUk/edit?usp=sharing'
  when '875ef58c-52a4-4a26-8c22-97d17e1dab32' then 'https://docs.google.com/presentation/d/14vmCWbmOkHSwDmVY8HBzm8WHWLrLyNPFto1P-M5O8mU'
  when 'a3d69a97-5788-4b03-8389-9b46af1b776f' then 'https://docs.google.com/presentation/d/19k-OEj29RXmITwIoZDa9-bZTXHCda_0sbV3I-Q8wNdw/edit?usp=sharing'
  when '7730d288-3f99-4c85-a06b-c3621d19ecce' then 'https://docs.google.com/presentation/d/151azFrlS0TCxdkoLy4YGkFhJGb9HBivA_ZGSVkxkHb8'
  when '6b4f17da-bdcc-46ab-a913-60f5edd3f9cf' then 'https://dominicbachmann.github.io/talks/2026-angular-typed-router/'
  else slides_url
end
where id in (
  '01def749-6c14-408a-9d65-8b2a5bbd8061',
  '7aec5228-8982-40ff-80cd-7422ba41294d',
  '6b117c84-d39f-4c91-b6f8-e55459035983',
  '875ef58c-52a4-4a26-8c22-97d17e1dab32',
  'a3d69a97-5788-4b03-8389-9b46af1b776f',
  '7730d288-3f99-4c85-a06b-c3621d19ecce',
  '6b4f17da-bdcc-46ab-a913-60f5edd3f9cf'
);
