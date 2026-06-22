alter table public."Events"
  add column if not exists feature_graphic text;

update public."Events"
set feature_graphic = case title
  when 'Angular Zurich February 2026' then 'https://krjsmflnjjbdwzzxmmtt.supabase.co/storage/v1/object/public/events-feature-graphics/angular-zurich-february-2026.png'
  when 'Angular Zurich April 2026' then 'https://krjsmflnjjbdwzzxmmtt.supabase.co/storage/v1/object/public/events-feature-graphics/angular-zurich-april-2026.png'
  when 'Angular Zurich June 2026' then 'https://krjsmflnjjbdwzzxmmtt.supabase.co/storage/v1/object/public/events-feature-graphics/angular-zurich-June-2026.png'
  else feature_graphic
end
where title in (
  'Angular Zurich February 2026',
  'Angular Zurich April 2026',
  'Angular Zurich June 2026'
);
