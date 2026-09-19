import { Hono } from 'hono';
import type { JudgeRound, JudgeTeam, JudgeTeamStatus, RoundStatus } from '../../shared/api';
import { ScoreError, scoreEvaluation } from '../../shared/scoring';
import { requireRole } from '../auth';
import { fail, isUniqueViolation, newId, readBody } from '../lib';
import type { AppEnv } from '../types';
import { loadOpenRounds, loadRound } from './rounds';

export const judging = new Hono<AppEnv>();
judging.use('*', requireRole('judge'));

async function openRound(db: D1Database, id: string) {
  const round = await loadRound(db, id);
  if (round.status !== 'open') fail(409, 'This round is not open for judging.');
  return round;
}

judging.get('/rounds', async (c) => c.json<JudgeRound[]>(await loadOpenRounds(c.env.DB)));

judging.get('/rounds/:roundId/teams', async (c) => {
  const roundId = c.req.param('roundId');
  const me = c.get('account');
  // This read only needs the round status and team availability. Keep both in
  // one D1 batch instead of loading criteria, membership IDs and score counts.
  const [rounds, teams] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT status FROM rounds WHERE id = ?').bind(roundId),
    c.env.DB.prepare(
      `SELECT t.id, t.name, t.team_lead,
              COALESCE(json_extract(t.extra_json, '$.PS'), '') AS ps,
              COALESCE(json_extract(t.extra_json, '$."Short Desc"'), '') AS short_desc,
              e.judge_id
       FROM round_teams rt
       JOIN teams t ON t.id = rt.team_id
       LEFT JOIN evaluations e ON e.round_id = rt.round_id AND e.team_id = rt.team_id
       WHERE rt.round_id = ?
       ORDER BY t.name COLLATE NOCASE`,
    ).bind(roundId),
  ]);
  const round = (rounds.results as { status: RoundStatus }[])[0];
  if (!round) fail(404, 'Round not found.');
  if (round.status !== 'open') fail(409, 'This round is not open for judging.');
  const rows = teams.results as {
    id: string; name: string; team_lead: string; ps: string; short_desc: string; judge_id: string | null;
  }[];

  return c.json<JudgeTeam[]>(
    rows.map((row) => {
      let status: JudgeTeamStatus = 'available';
      if (row.judge_id === me.id) status = 'judged-by-you';
      else if (row.judge_id) status = 'judged';
      return {
        id: row.id, name: row.name, teamLead: row.team_lead,
        ps: row.ps, shortDesc: row.short_desc, status,
      };
    }),
  );
});

judging.post('/rounds/:roundId/teams/:teamId/evaluation', async (c) => {
  const db = c.env.DB;
  const round = await openRound(db, c.req.param('roundId'));
  const teamId = c.req.param('teamId');
  const body = await readBody(c);

  let scored: ReturnType<typeof scoreEvaluation>;
  try {
    scored = scoreEvaluation(round.criteria, body.marks);
  } catch (err) {
    if (err instanceof ScoreError) fail(400, err.message);
    throw err;
  }
  const remarks = typeof body.remarks === 'string' ? body.remarks.trim() : '';
  if (remarks.length > 2000) fail(400, 'Remarks must be 2000 characters or fewer.');

  // The WHERE re-checks round status and membership at write time; UNIQUE(round_id, team_id)
  // guarantees only the first judge's submission is stored.
  let changes = 0;
  try {
    const result = await db
      .prepare(
        `INSERT INTO evaluations (id, round_id, team_id, judge_id, marks_json, total, remarks)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
         WHERE EXISTS (SELECT 1 FROM rounds WHERE id = ?2 AND status = 'open')
           AND EXISTS (SELECT 1 FROM round_teams WHERE round_id = ?2 AND team_id = ?3)`,
      )
      .bind(newId(), round.id, teamId, c.get('account').id, JSON.stringify(scored.entries), scored.total, remarks)
      .run();
    changes = result.meta.changes;
  } catch (err) {
    if (isUniqueViolation(err)) fail(409, 'This team has already been judged in this round by another judge.');
    throw err;
  }
  if (changes === 0) fail(409, 'This team is not available for judging in this round.');
  return c.json({ total: scored.total }, 201);
});
