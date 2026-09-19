import { Hono } from 'hono';
import type { MarkEntry, ResultRound, RoundResults } from '../../shared/api';
import { competitionRanks } from '../../shared/scoring';
import { requireRole } from '../auth';
import { fail } from '../lib';
import type { AppEnv } from '../types';
import { loadRound } from './rounds';

interface ResultQueryRow {
  id: string;
  name: string;
  team_lead: string;
  marks_json: string | null;
  total: number | null;
  remarks: string | null;
  submitted_at: string | null;
  judge_name: string | null;
  judge_username: string | null;
}

export const results = new Hono<AppEnv>();

// Authentication is applied by the parent API. Both roles may read results;
// round management stays behind the separate admin-only /rounds routes.
results.get('/', async (c) => {
  const { results: rounds } = await c.env.DB
    .prepare('SELECT id, name, position, status FROM rounds ORDER BY position')
    .all<ResultRound>();
  return c.json(rounds);
});

results.get('/:roundId', async (c) => {
  const round = await loadRound(c.env.DB, c.req.param('roundId'));
  const { results: rows } = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.team_lead, e.marks_json, e.total, e.remarks, e.submitted_at,
            a.display_name AS judge_name, a.username AS judge_username
     FROM round_teams rt
     JOIN teams t ON t.id = rt.team_id
     LEFT JOIN evaluations e ON e.round_id = rt.round_id AND e.team_id = rt.team_id
     LEFT JOIN accounts a ON a.id = e.judge_id
     WHERE rt.round_id = ?
     ORDER BY e.total IS NULL, e.total DESC, t.name COLLATE NOCASE`,
  )
    .bind(round.id)
    .all<ResultQueryRow>();

  const ranks = competitionRanks(rows.map((row) => row.total));
  return c.json<RoundResults>({
    round: { id: round.id, name: round.name, status: round.status },
    criteria: round.criteria,
    rows: rows.map((row, index) => ({
      rank: ranks[index],
      team: { id: row.id, name: row.name, teamLead: row.team_lead },
      evaluation:
        row.total === null
          ? null
          : {
              judge: `${row.judge_name} (@${row.judge_username})`,
              marks: JSON.parse(row.marks_json as string) as MarkEntry[],
              total: row.total,
              remarks: row.remarks ?? '',
              submittedAt: row.submitted_at as string,
            },
    })),
  });
});

results.delete('/:roundId/teams/:teamId', requireRole('admin'), async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM evaluations WHERE round_id = ? AND team_id = ?')
    .bind(c.req.param('roundId'), c.req.param('teamId'))
    .run();
  if (result.meta.changes === 0) fail(404, 'No score found for this team in this round.');
  return c.body(null, 204);
});
