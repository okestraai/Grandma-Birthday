/**
 * Dashboard charts. Loaded lazily (recharts is large) from DashboardPage.
 * Each chart has a heading and an sr-only table of the same data.
 */
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardStats } from '@birthday/types';
import { EmptyState } from '@/components/ui/states';
import { Panel } from '@/components/admin/ui';

const NAVY = '#071a2b';
const EMERALD = '#12665a';
const GOLD = '#d6b36a';
const TICK = { fontSize: 12, fill: '#6f6a61' };

/** "2026-09-12" → "12 Sep" (read as a calendar date, not shifted by the local time zone). */
function formatDay(date: string): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return date;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

const tooltipStyle = {
  contentStyle: { fontSize: 12, borderRadius: 8, border: '1px solid rgba(7,26,43,0.1)', padding: '6px 10px' },
  labelStyle: { color: NAVY, fontWeight: 600 },
};

export interface ChartsProps {
  rsvpsByDay: DashboardStats['rsvpsByDay'];
  guestsByCategory: DashboardStats['guestsByCategory'];
}

export default function Charts({ rsvpsByDay, guestsByCategory }: ChartsProps) {
  const rsvpData = rsvpsByDay.map((d) => ({ ...d, label: formatDay(d.date) }));
  const totalRsvps = rsvpsByDay.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel id="chart-rsvps" title="RSVPs by day" description={rsvpData.length ? `${totalRsvps.toLocaleString()} responses over ${rsvpData.length} days` : undefined}>
        {rsvpData.length === 0 ? (
          <EmptyState title="No RSVPs yet" description="Responses will appear here as guests reply." className="py-8" />
        ) : (
          <>
            <div className="h-60" aria-hidden>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={rsvpData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="rsvpFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={EMERALD} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={EMERALD} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(7,26,43,0.06)" vertical={false} />
                  <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: 'rgba(7,26,43,0.15)' }} minTickGap={16} />
                  <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} width={40} />
                  <Tooltip {...tooltipStyle} formatter={(value) => [value, 'RSVPs']} />
                  <Area type="monotone" dataKey="count" name="RSVPs" stroke={EMERALD} strokeWidth={2} fill="url(#rsvpFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <table className="sr-only">
              <caption>RSVPs by day</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">RSVPs</th>
                </tr>
              </thead>
              <tbody>
                {rsvpData.map((d) => (
                  <tr key={d.date}>
                    <th scope="row">{d.label}</th>
                    <td>{d.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Panel>

      <Panel id="chart-categories" title="Guests by category" description="Invitations in each category, and people coming: guests who said yes plus the companions they are bringing.">
        {guestsByCategory.length === 0 ? (
          <EmptyState title="No guests yet" description="Categories fill in as guests register." className="py-8" />
        ) : (
          <>
            <div className="h-60" aria-hidden>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={guestsByCategory} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barGap={2}>
                  <CartesianGrid stroke="rgba(7,26,43,0.06)" vertical={false} />
                  <XAxis dataKey="categoryName" tick={TICK} tickLine={false} axisLine={{ stroke: 'rgba(7,26,43,0.15)' }} interval={0} />
                  <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} width={40} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(214,179,106,0.12)' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                  <Bar dataKey="guests" name="Invitations" fill={NAVY} radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="people" name="People coming" fill={GOLD} radius={[3, 3, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="sr-only">
              <caption>Guests by category</caption>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Invitations</th>
                  <th scope="col">People coming</th>
                </tr>
              </thead>
              <tbody>
                {guestsByCategory.map((c) => (
                  <tr key={c.categoryName}>
                    <th scope="row">{c.categoryName}</th>
                    <td>{c.guests}</td>
                    <td>{c.people}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Panel>
    </div>
  );
}
