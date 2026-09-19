import { Download, RefreshCw, RotateCcw, Trophy, Users, CheckCircle2, Clock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ResultRound, Role, RoundResults } from '../../shared/api';
import { downloadBlob, useApi, useResource } from '../api';
import {
  Button,
  Empty,
  ErrorBanner,
  Loading,
  Modal,
  PageHeading,
  RoundBadge,
  StatCard,
  useAction,
  useToast,
} from '../components/ui';

function csvCell(value: string | number): string {
  if (typeof value === 'number') return String(value);
  // Prefix cells a spreadsheet would run as formulas.
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(data: RoundResults) {
  const header = [
    'Rank',
    'Team',
    'Team Lead',
    ...data.criteria.map((c) => `${c.name} (/${c.maxMarks})`),
    'Weighted Score',
    'Judge',
    'Remarks',
    'Submitted At',
  ];
  const lines = data.rows.map((row) => {
    const byName = new Map(row.evaluation?.marks.map((entry) => [entry.name.toLowerCase(), entry.marks]));
    return [
      row.rank ?? '',
      row.team.name,
      row.team.teamLead,
      ...data.criteria.map((c) => byName.get(c.name.toLowerCase()) ?? ''),
      row.evaluation?.total ?? '',
      row.evaluation?.judge ?? '',
      row.evaluation?.remarks ?? '',
      row.evaluation?.submittedAt ?? '',
    ]
      .map(csvCell)
      .join(',');
  });
  downloadBlob(
    new Blob([[header.map(csvCell).join(','), ...lines].join('\r\n')], { type: 'text/csv' }),
    `${data.round.name.replace(/[^a-z0-9]+/gi, '-')}-results.csv`,
  );
}

export function ResultsPage({ role }: { role: Role }) {
  const canReset = role === 'admin';
  const api = useApi();
  const toast = useToast();
  const action = useAction();
  const rounds = useResource<ResultRound[]>('/results');
  const [roundId, setRoundId] = useState('');
  const results = useResource<RoundResults>(roundId ? `/results/${roundId}` : null);
  const [reset, setReset] = useState<{ teamId: string; name: string } | null>(null);

  useEffect(() => {
    if (!rounds.data || roundId) return;
    const open = rounds.data.find((round) => round.status === 'open') ?? rounds.data[0];
    if (open) setRoundId(open.id);
  }, [rounds.data, roundId]);

  const data = results.data && results.data.round.id === roundId ? results.data : null;
  const judged = useMemo(() => data?.rows.filter((row) => row.evaluation).length ?? 0, [data]);
  const highest = useMemo(
    () =>
      data?.rows.reduce<number | null>(
        (best, row) => (row.evaluation ? Math.max(best ?? 0, row.evaluation.total) : best),
        null,
      ),
    [data],
  );

  return (
    <>
      <PageHeading
        eyebrow="THE BIG PICTURE"
        title="Results overview"
        description="Follow the scores. Recognize the standouts. See every idea in perspective."
        actions={
          <Button icon={Download} onClick={() => data && downloadCsv(data)} disabled={!data || !data.rows.length}>
            Export CSV
          </Button>
        }
      />
      <ErrorBanner message={rounds.error} retry={rounds.reload} />
      {rounds.loading && !rounds.data ? (
        <Loading />
      ) : !rounds.data?.length ? (
        <section className="card">
          <Empty
            icon={Trophy}
            title={canReset ? 'The stage is yours to set' : 'No results yet'}
            description={canReset
              ? 'Create a round in Rounds and add teams. Their scores will appear here once judging begins.'
              : 'Results will appear here once an admin adds rounds and judging begins.'}
          />
        </section>
      ) : (
        <>
          <section className="card">
            <div className="table-toolbar">
              <select
                aria-label="Viewing round"
                value={roundId}
                onChange={(e) => setRoundId(e.target.value)}
              >
                {rounds.data.map((round) => (
                  <option key={round.id} value={round.id}>
                    {round.position}. {round.name} ({round.status})
                  </option>
                ))}
              </select>
              {data && <RoundBadge status={data.round.status} />}
              <Button
                variant="ghost"
                icon={RefreshCw}
                busy={results.loading}
                onClick={results.reload}
              >
                Refresh
              </Button>
              <span className="toolbar-count">
                {data ? `${judged} of ${data.rows.length} evaluated` : ''}
              </span>
            </div>
            <ErrorBanner message={results.error} retry={results.reload} />
            {results.loading && !data ? (
              <Loading />
            ) : data ? (
              <>
                <div className="table-wrap">
                  <table className="results-table">
                    <caption className="sr-only">Results for {data.round.name}</caption>
                    <thead>
                      <tr>
                        <th className="num">Rank</th>
                        <th>Team</th>
                        {data.criteria.map((criterion) => (
                          <th key={criterion.id} className="num" title={`Weightage ${criterion.weight}`}>
                            {criterion.name} <span className="muted">/{criterion.maxMarks}</span>
                          </th>
                        ))}
                        <th className="num">Score</th>
                        <th>Judge</th>
                        {canReset && <th>
                          <span className="sr-only">Actions</span>
                        </th>}
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((row) => {
                        const byName = new Map(
                          row.evaluation?.marks.map((entry) => [entry.name.toLowerCase(), entry.marks]),
                        );
                        return (
                          <tr key={row.team.id} className={row.rank === 1 ? 'leading-row' : undefined}>
                            <td className="num">
                              <span
                                className={`rank${row.rank != null && row.rank <= 3 ? ` r${row.rank}` : ''}`}
                              >
                                {row.rank ?? '–'}
                              </span>
                            </td>
                            <td>
                              <span className="team-name">{row.team.name}</span>
                              <small className="muted">{row.team.teamLead}</small>
                            </td>
                            {data.criteria.map((criterion) => (
                              <td key={criterion.id} className="num">
                                {byName.get(criterion.name.toLowerCase()) ?? ''}
                              </td>
                            ))}
                            <td className="num">
                              <strong className="score-cell">
                                {row.evaluation ? row.evaluation.total.toFixed(2) : '–'}
                              </strong>
                            </td>
                            <td>
                              {row.evaluation ? (
                                <>
                                  {row.evaluation.judge}
                                  {row.evaluation.remarks && (
                                    <div className="muted judge-remarks">{row.evaluation.remarks}</div>
                                  )}
                                </>
                              ) : (
                                <span className="muted">Not judged</span>
                              )}
                            </td>
                            {canReset && <td>
                              <div className="table-actions">
                                {row.evaluation && (
                                  <button
                                    className="icon-button"
                                    title="Reset score"
                                    aria-label={`Reset score for ${row.team.name}`}
                                    onClick={() => {
                                      action.setError('');
                                      setReset({ teamId: row.team.id, name: row.team.name });
                                    }}
                                  >
                                    <RotateCcw size={16} />
                                  </button>
                                )}
                              </div>
                            </td>}
                          </tr>
                        );
                      })}
                      {!data.rows.length && (
                        <tr>
                          <td colSpan={(canReset ? 5 : 4) + data.criteria.length} className="muted">
                            This round has no teams yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="table-note">
                  Scores are weighted out of 100. Equal scores share a rank. Refresh to see new
                  submissions.
                </p>
              </>
            ) : null}
          </section>
          {data && (
            <div className="stats-grid">
              <StatCard
                icon={Users}
                label="Teams in round"
                value={String(data.rows.length).padStart(2, '0')}
                detail="Every team, one opportunity"
              />
              <StatCard
                icon={CheckCircle2}
                label="Evaluated"
                value={String(judged).padStart(2, '0')}
                detail={
                  data.rows.length
                    ? `${Math.round((judged / data.rows.length) * 100)}% of this round completed`
                    : 'Waiting for teams'
                }
                green
              />
              <StatCard
                icon={Clock}
                label="Still to judge"
                value={String(data.rows.length - judged).padStart(2, '0')}
                detail="Ready for their moment"
                amber
              />
              <StatCard
                icon={Trophy}
                label="Highest score"
                value={highest == null ? '–' : highest.toFixed(2)}
                detail="Weighted score out of 100"
              />
            </div>
          )}
        </>
      )}
      {canReset && reset && (
        <Modal
          title="Reset this score?"
          description={`${reset.name} · ${results.data?.round.name ?? ''}`}
          onClose={() => setReset(null)}
          busy={action.busy}
        >
          <p className="modal-copy">
            The submitted evaluation is deleted. Any judge can then score this team again.
          </p>
          <ErrorBanner message={action.error} />
          <div className="modal-actions">
            <Button variant="secondary" disabled={action.busy} onClick={() => setReset(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={RotateCcw}
              busy={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await api.del(`/results/${roundId}/teams/${reset.teamId}`);
                  toast(`Score for ${reset.name} was reset.`);
                  setReset(null);
                  results.reload();
                })
              }
            >
              Reset score
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
