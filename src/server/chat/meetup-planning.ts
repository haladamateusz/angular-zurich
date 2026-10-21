import { SupabaseClient } from '@supabase/supabase-js';

const timeZone = 'Europe/Zurich';

// Use the zone's offset at the start of each month, including across year/DST
// boundaries. All Swiss offset transitions occur later than the first midnight.
function monthStart(year: number, monthIndex: number) {
  const anchor = new Date(Date.UTC(year, monthIndex, 1, 12));
  const zone = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(anchor)
    .find((part) => part.type === 'timeZoneName')!.value;
  const offset = /GMT([+-])(\d{2}):(\d{2})/.exec(zone);
  if (!offset) throw new Error('calendar_unavailable');
  const minutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === '+' ? 1 : -1);
  return new Date(Date.UTC(year, monthIndex, 1) - minutes * 60_000).toISOString();
}

export async function monthlyMeetupCapacity(
  client: SupabaseClient,
  signal: AbortSignal,
  now = new Date(),
) {
  signal.throwIfAborted();
  const approval = await client.rpc('can_current_user_chat').abortSignal(signal);
  if (approval.error || approval.data !== true) throw new Error('access_revoked');
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)!.value;
  const year = Number(value('year'));
  const month = Number(value('month'));
  const asOf = `${year}-${value('month')}-${value('day')}`;
  const labels = new Intl.DateTimeFormat('en-GB', { timeZone, month: 'long' });
  const months = await Promise.all(
    Array.from({ length: 13 - month }, async (_, index) => {
      const monthIndex = month - 1 + index;
      const { count, error } = await client
        .from('Events')
        .select('id', { count: 'exact', head: true })
        .eq('public', true)
        .gte('starts_at', monthStart(year, monthIndex))
        .lt('starts_at', monthStart(year, monthIndex + 1))
        .abortSignal(signal);
      if (error || count === null || !Number.isSafeInteger(count) || count < 0)
        throw new Error('archive_unavailable');
      return {
        month: monthIndex + 1,
        name: labels.format(new Date(Date.UTC(year, monthIndex, 15))),
        publishedEvents: count,
      };
    }),
  );
  return {
    asOf,
    year,
    months,
    totalSlots: months.length,
    slotsAfterCurrentMonth: months.length - 1,
    additionalSlots: months.filter((item) => item.publishedEvents === 0).length,
  };
}
