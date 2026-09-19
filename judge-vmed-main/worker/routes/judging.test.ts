/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { URL } from 'node:url';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { JudgeTeam } from '../../shared/api';
import type { AccountRow, AppEnv } from '../types';
import { judging } from './judging';

let sqlite: DatabaseSync;
let queries: number;
let rowsReturned: number;

// Execute the route's actual SQL against the applied migrations. Only the D1
// transport is substituted; joins, constraints and result shapes are real.
class Statement {
  constructor(private sql: string, private params: SQLInputValue[] = []) {}
  bind(...params: SQLInputValue[]) { return new Statement(this.sql, params); }
  async all() {
    queries++;
    const results = sqlite.prepare(this.sql).all(...this.params);
    rowsReturned += results.length;
    return { results };
  }
}
const db = {
  prepare: (sql: string) => new Statement(sql),
  batch: (statements: Statement[]) => Promise.all(statements.map((statement) => statement.all())),
};
const judge: AccountRow = {
  id: 'judge-a', role: 'judge', email: null, username: 'judge_a', display_name: 'Judge A',
  clerk_user_id: 'user-a', active: 1, created_at: '2026-09-14T00:00:00Z',
};
function appFor(account = judge) {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => { c.set('account', account); await next(); });
  app.onError((error, c) => {
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
    throw error;
  });
  return app.route('/judging', judging);
}

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  const migrations = new URL('../../migrations/', import.meta.url);
  for (const file of readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  sqlite.exec(`
    INSERT INTO accounts (id, role, username, display_name, clerk_user_id) VALUES
      ('judge-a', 'judge', 'judge_a', 'Judge A', 'user-a'),
      ('judge-b', 'judge', 'judge_b', 'Judge B', 'user-b');
    INSERT INTO rounds (id, name, position, status) VALUES
      ('open', 'Open round', 1, 'open'), ('closed', 'Closed round', 2, 'closed');
    INSERT INTO teams (id, name, team_lead) VALUES
      ('a', 'alpha', 'Asha'), ('b', 'Beta', 'Ben'), ('c', 'Gamma', 'Chen'), ('d', 'Other', 'Dia');
    INSERT INTO round_teams (round_id, team_id) VALUES ('open', 'a'), ('open', 'b'), ('open', 'c'), ('closed', 'd');
    INSERT INTO evaluations (id, round_id, team_id, judge_id, marks_json, total) VALUES
      ('e-a', 'open', 'a', 'judge-a', '[]', 80), ('e-b', 'open', 'b', 'judge-b', '[]', 70);
  `);
  queries = 0;
  rowsReturned = 0;
});
afterEach(() => sqlite.close());

describe('judging team lookup', () => {
  it('returns sorted round members with the correct status for each judge', async () => {
    const response = await appFor().request('/judging/rounds/open/teams', undefined, { DB: db });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { id: 'a', name: 'alpha', teamLead: 'Asha', ps: '', shortDesc: '', status: 'judged-by-you' },
      { id: 'b', name: 'Beta', teamLead: 'Ben', ps: '', shortDesc: '', status: 'judged' },
      { id: 'c', name: 'Gamma', teamLead: 'Chen', ps: '', shortDesc: '', status: 'available' },
    ]);
  });

  it.each([['missing', 404], ['closed', 409]])('rejects the %s round', async (id, status) => {
    const response = await appFor().request(`/judging/rounds/${id}/teams`, undefined, { DB: db });
    expect(response.status).toBe(status);
  });

  it('still restricts the endpoint to judges', async () => {
    const response = await appFor({ ...judge, role: 'admin' })
      .request('/judging/rounds/open/teams', undefined, { DB: db });
    expect(response.status).toBe(403);
    expect(queries).toBe(0);
  });

  it('loads 2000 teams with two queries without fetching unused criteria, memberships or counts', async () => {
    const insertTeam = sqlite.prepare('INSERT INTO teams (id, name, team_lead) VALUES (?, ?, ?)');
    const insertMember = sqlite.prepare("INSERT INTO round_teams (round_id, team_id) VALUES ('open', ?)");
    for (let i = 3; i < 2000; i++) {
      insertTeam.run(`team-${i}`, `Team ${i}`, `Lead ${i}`);
      insertMember.run(`team-${i}`);
    }
    const response = await appFor().request('/judging/rounds/open/teams', undefined, { DB: db });
    expect(response.status).toBe(200);
    expect(await response.json<JudgeTeam[]>()).toHaveLength(2000);
    expect(queries).toBe(2);
    expect(rowsReturned).toBe(2001);
  });
});
