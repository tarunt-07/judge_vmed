/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { URL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JudgeTeam, ResultRound, RoundResults, Team } from '../shared/api';
import app from './index';

// Substitute Clerk's token verification only. The real API still checks its
// D1 account, active flag and route permissions, and executes real SQLite SQL.
vi.mock('@clerk/backend', () => ({
  createClerkClient: () => ({
    authenticateRequest: async (request: Request) => ({
      toAuth: () => ({ userId: request.headers.get('Authorization')?.replace('Bearer ', '') }),
    }),
  }),
}));

let sqlite: DatabaseSync;
class Statement {
  constructor(private sql: string, private params: SQLInputValue[] = []) {}
  bind(...params: SQLInputValue[]) { return new Statement(this.sql, params); }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.params) }; }
  async first() { return sqlite.prepare(this.sql).get(...this.params) ?? null; }
  async run() {
    return { meta: { changes: Number(sqlite.prepare(this.sql).run(...this.params).changes) } };
  }
}
const env = {
  CLERK_SECRET_KEY: 'test-secret',
  CLERK_PUBLISHABLE_KEY: 'test-publishable',
  DB: {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  },
};
function request(path: string, user = 'user-judge', method = 'GET', body?: unknown) {
  return app.request(`/api${path}`, {
    method,
    headers: { ...(user ? { Authorization: `Bearer ${user}` } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, env);
}

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  const migrations = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  sqlite.exec(`
    INSERT INTO accounts (id, role, email, username, display_name, clerk_user_id, active) VALUES
      ('admin', 'admin', 'admin@example.com', NULL, 'Admin', 'user-admin', 1),
      ('judge', 'judge', NULL, 'judge', 'Judge', 'user-judge', 1),
      ('disabled', 'judge', NULL, 'disabled', 'Disabled', 'user-disabled', 0);
    INSERT INTO rounds (id, name, position, status) VALUES
      ('open', 'Open round', 2, 'open'), ('closed', 'Closed round', 1, 'closed'), ('draft', 'Draft round', 3, 'draft');
    INSERT INTO teams (id, name, team_lead) VALUES ('a', 'Alpha', 'Asha'), ('b', 'Beta', 'Ben');
    INSERT INTO round_teams (round_id, team_id) VALUES ('open', 'a'), ('open', 'b'), ('closed', 'a');
    INSERT INTO criteria (id, round_id, name, max_marks, weight, position) VALUES ('c', 'open', 'Impact', 10, 1, 1);
    INSERT INTO evaluations (id, round_id, team_id, judge_id, marks_json, total, remarks) VALUES
      ('score', 'open', 'a', 'judge', '[{"criterionId":"c","name":"Impact","maxMarks":10,"weight":1,"marks":8}]', 80, 'Useful idea');
  `);
});
afterEach(() => sqlite.close());

describe('read-only results access', () => {
  it.each(['user-admin', 'user-judge'])('lists result rounds for %s', async (user) => {
    const response = await request('/results', user);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json<ResultRound[]>()).toEqual([
      { id: 'closed', name: 'Closed round', position: 1, status: 'closed' },
      { id: 'open', name: 'Open round', position: 2, status: 'open' },
      { id: 'draft', name: 'Draft round', position: 3, status: 'draft' },
    ]);
  });

  it('returns the same scored and unscored results to judges and admins', async () => {
    const judge = await request('/results/open');
    const admin = await request('/results/open', 'user-admin');
    expect(judge.status).toBe(200);
    expect(admin.status).toBe(200);
    const results = await judge.json<RoundResults>();
    expect(results).toEqual(await admin.json());
    expect(results.rows[0]).toMatchObject({ rank: 1, team: { name: 'Alpha' }, evaluation: { total: 80, judge: 'Judge (@judge)', remarks: 'Useful idea' } });
    expect(results.rows[1]).toMatchObject({ rank: null, team: { name: 'Beta' }, evaluation: null });
  });

  it.each(['closed', 'draft'])('allows judges to view the %s round', async (id) => {
    expect((await request(`/results/${id}`)).status).toBe(200);
  });

  it('rejects a judge reset and leaves the score intact', async () => {
    expect((await request('/results/open/teams/a', 'user-judge', 'DELETE')).status).toBe(403);
    expect(sqlite.prepare('SELECT total FROM evaluations WHERE id = ?').get('score')?.total).toBe(80);
  });

  it('lets admins reset a score and reports missing scores', async () => {
    expect((await request('/results/open/teams/a', 'user-admin', 'DELETE')).status).toBe(204);
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM evaluations').get()?.count).toBe(0);
    expect((await request('/results/open/teams/a', 'user-admin', 'DELETE')).status).toBe(404);
  });

  it.each(['/rounds', '/teams', '/accounts'])('keeps %s management admin-only', async (path) => {
    expect((await request(path)).status).toBe(403);
  });

  it.each(['/results', '/results/open'])('rejects anonymous and disabled access to %s', async (path) => {
    expect((await request(path, '')).status).toBe(401);
    expect((await request(path, 'user-disabled')).status).toBe(403);
  });

  it('reports a missing results round', async () => {
    expect((await request('/results/missing')).status).toBe(404);
  });
});

describe('new team CSV flow', () => {
  it('persists PS and Short Desc, ignores other columns, and exposes them while judging', async () => {
    const response = await request('/teams/import', 'user-admin', 'POST', {
      csv: 'Team Name,Team Leader Name,PS,Short Desc,Phone number\nAlpha,Asha Sen,PS-01,"First line, details\nSecond line",9000000000',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ created: 0, updated: 1 });
    const teams = await (await request('/teams', 'user-admin')).json<Team[]>();
    expect(teams[0]).toMatchObject({ name: 'Alpha', teamLead: 'Asha Sen' });
    expect(teams[0].extra).toEqual({ PS: 'PS-01', 'Short Desc': 'First line, details\nSecond line' });
    const judgeTeams = await (await request('/judging/rounds/open/teams')).json<JudgeTeam[]>();
    expect(judgeTeams[0]).toEqual({
      id: 'a', name: 'Alpha', teamLead: 'Asha Sen', ps: 'PS-01',
      shortDesc: 'First line, details\nSecond line', status: 'judged-by-you',
    });
  });

  it('adds a team manually with PS and description that judges can see', async () => {
    const created = await request('/teams', 'user-admin', 'POST', {
      name: 'Gamma', teamLead: 'Gita', ps: ' PS-07 ', shortDesc: 'Triage chatbot',
    });
    expect(created.status).toBe(201);
    const team = await created.json<Team>();
    expect(team.extra).toEqual({ PS: 'PS-07', 'Short Desc': 'Triage chatbot' });
    sqlite.prepare('INSERT INTO round_teams (round_id, team_id) VALUES (?, ?)').run('open', team.id);
    const judgeTeams = await (await request('/judging/rounds/open/teams')).json<JudgeTeam[]>();
    expect(judgeTeams.find((t) => t.id === team.id)).toMatchObject({ ps: 'PS-07', shortDesc: 'Triage chatbot' });

    const patched = await request(`/teams/${team.id}`, 'user-admin', 'PATCH', { shortDesc: '' });
    expect((await patched.json<Team>()).extra).toEqual({ PS: 'PS-07' });
    expect((await request('/teams', 'user-admin', 'POST', { name: 'Delta', teamLead: 'Dev', ps: 5 })).status).toBe(400);
    expect((await request('/teams', 'user-admin', 'POST', { name: 'Eta', teamLead: 'Esha' })).status).toBe(201);
  });

  it('validates all rows before changing any existing team', async () => {
    const response = await request('/teams/import', 'user-admin', 'POST', {
      csv: 'Team Name,Team Leader Name,PS,Short Desc\nAlpha,Changed,PS-01,Updated\nBeta,,PS-02,Missing leader',
    });
    expect(response.status).toBe(400);
    expect(sqlite.prepare('SELECT team_lead FROM teams WHERE id = ?').get('a')?.team_lead).toBe('Asha');
  });

  it('does not allow judges to import teams', async () => {
    expect((await request('/teams/import', 'user-judge', 'POST', {
      csv: 'Team Name,Team Leader Name,PS,Short Desc\nOther,Person,PS-03,Test',
    })).status).toBe(403);
  });
});
