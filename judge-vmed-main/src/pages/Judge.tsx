import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { type SyntheticEvent, useEffect, useMemo, useState } from 'react';
import type { JudgeRound, JudgeTeam, JudgeTeamStatus } from '../../shared/api';
import { weightedTotal } from '../../shared/scoring';
import { ApiError, useApi, useDebounced, useResource } from '../api';
import {
  Badge,
  Button,
  Empty,
  ErrorBanner,
  Field,
  Loading,
  Modal,
  PageHeading,
  RoundBadge,
  SearchInput,
  StatCard,
  useAction,
  useToast,
} from '../components/ui';

const STATUS_LABEL: Record<JudgeTeamStatus, string> = {
  available: 'Available',
  'judged-by-you': 'Judged by you',
  judged: 'Already judged',
};
const STATUS_TONE: Record<JudgeTeamStatus, string> = {
  available: 'green',
  'judged-by-you': 'blue',
  judged: 'neutral',
};

const MAX_MATCHES = 50;

export function JudgePage() {
  const api = useApi();
  const toast = useToast();
  const action = useAction();
  const rounds = useResource<JudgeRound[]>('/judging/rounds', 15000);
  const [roundId, setRoundId] = useState('');
  const [query, setQuery] = useState('');
  const term = useDebounced(query);
  const [selected, setSelected] = useState<JudgeTeam | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState('');

  const teams = useResource<JudgeTeam[]>(roundId ? `/judging/rounds/${roundId}/teams` : null);

  useEffect(() => {
    if (!rounds.data || roundId) return;
    if (rounds.data.length === 1) setRoundId(rounds.data[0].id);
  }, [rounds.data, roundId]);

  const round = rounds.data?.find((item) => item.id === roundId) ?? null;
  const teamList = teams.data ?? [];

  const matches = useMemo(() => {
    const q = term.trim().toLowerCase();
    const list = q
      ? teamList.filter(
          (team) =>
            team.name.toLowerCase().includes(q) || team.teamLead.toLowerCase().includes(q),
        )
      : teamList;
    return list.slice(0, MAX_MATCHES);
  }, [teamList, term]);

  const available = teamList.filter((team) => team.status === 'available').length;
  const mine = teamList.filter((team) => team.status === 'judged-by-you').length;

  const preview = useMemo(() => {
    if (!round) return null;
    const entries = round.criteria.map((criterion) => ({
      marks:
        marks[criterion.id] === undefined || marks[criterion.id] === ''
          ? Number.NaN
          : Number(marks[criterion.id]),
      maxMarks: criterion.maxMarks,
      weight: criterion.weight,
    }));
    if (entries.some((entry) => !Number.isFinite(entry.marks))) return null;
    return weightedTotal(entries);
  }, [round, marks]);

  function changeRound(id: string) {
    setRoundId(id);
    setSelected(null);
    setQuery('');
  }

  function choose(team: JudgeTeam) {
    if (team.status !== 'available') return;
    setSelected(team);
    setMarks({});
    setRemarks('');
    action.setError('');
  }

  async function submit() {
    if (!round || !selected) return;
    try {
      await api.post(`/judging/rounds/${round.id}/teams/${selected.id}/evaluation`, {
        marks: Object.fromEntries(
          round.criteria.map((criterion) => [criterion.id, Number(marks[criterion.id])]),
        ),
        remarks,
      });
      toast(`Submitted scores for ${selected.name}.`);
      setConfirming(false);
      setSelected(null);
      setQuery('');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConfirming(false);
        setSelected(null);
      }
      throw err;
    } finally {
      teams.reload();
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="A FRESH PERSPECTIVE"
        title="Make every score count."
        description="Find your next team, explore their idea, and give it your considered score."
      />
      <ErrorBanner message={rounds.error} retry={rounds.reload} />
      {rounds.loading && !rounds.data ? (
        <Loading />
      ) : !rounds.data?.length ? (
        <section className="card">
          <Empty
            icon={Clock}
            title="A moment before the next big idea"
            description="No round is open for judging right now. Your administrator will open the next round when it’s ready."
          />
        </section>
      ) : (
        <>
          <section className="card">
            <div className="table-toolbar">
              <select
                aria-label="Judging round"
                value={roundId}
                onChange={(e) => changeRound(e.target.value)}
              >
                <option value="">Choose a round</option>
                {rounds.data.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              {round && <RoundBadge status="open" />}
              <span className="toolbar-count">
                {round ? `${available} of ${teamList.length} available` : ''}
              </span>
            </div>
          </section>

          {round && !selected && (
            <div className="stats-grid judge-stats">
              <StatCard
                icon={Users}
                label="Teams in round"
                value={String(teamList.length).padStart(2, '0')}
                detail="Ideas waiting to be discovered"
              />
              <StatCard
                icon={Clock}
                label="Available to judge"
                value={String(available).padStart(2, '0')}
                detail="Choose a team below"
                amber
              />
              <StatCard
                icon={CheckCircle2}
                label="Your evaluations"
                value={String(mine).padStart(2, '0')}
                detail="Your perspective, recorded"
                green
              />
            </div>
          )}

          {round && (
            <div className="judging-steps" aria-label="Judging progress">
              <span className={!selected ? 'current' : ''} aria-current={!selected ? 'step' : undefined}>
                <b>01</b> Choose a team
              </span>
              <ChevronRight size={16} />
              <span className={selected ? 'current' : ''} aria-current={selected ? 'step' : undefined}>
                <b>02</b> Score the idea
              </span>
            </div>
          )}

          {round && !selected && (
            <section className="card">
              <div className="table-toolbar">
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="Type a team name or team lead…"
                />
                <span className="toolbar-count">
                  {matches.length === teamList.length
                    ? `${teamList.length} teams`
                    : `${matches.length} of ${teamList.length} teams`}
                </span>
              </div>
              <ErrorBanner message={teams.error} retry={teams.reload} />
              {teams.loading && !teams.data ? (
                <Loading />
              ) : !matches.length ? (
                <Empty
                  icon={Search}
                  title={teamList.length ? 'No teams match' : 'No teams yet'}
                  description={
                    teamList.length
                      ? 'Try a different name or team lead.'
                      : 'No teams have been added to this round yet.'
                  }
                />
              ) : (
                <div className="picklist">
                  {matches.map((team) => (
                    <button
                      key={team.id}
                      type="button"
                      disabled={team.status !== 'available'}
                      onClick={() => choose(team)}
                    >
                      <strong>
                        {team.name} <span className="muted">{team.teamLead}</span>
                      </strong>
                      <span className="team-pick-footer">
                        <Badge tone={STATUS_TONE[team.status]} dot={team.status === 'available'}>
                          {STATUS_LABEL[team.status]}
                        </Badge>
                        {team.status === 'available' && <ArrowRight size={16} />}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {!term && teamList.length > MAX_MATCHES && (
                <p className="table-note">
                  Showing the first {MAX_MATCHES}. Type to search all {teamList.length} teams.
                </p>
              )}
            </section>
          )}

          {round && selected && (
            <section className="card">
              <div className="section-heading">
                <div>
                  <h2>{selected.name}</h2>
                  <p>Lead · {selected.teamLead}</p>
                </div>
                <Button
                  variant="secondary"
                  disabled={action.busy}
                  onClick={() => setSelected(null)}
                >
                  Choose another team
                </Button>
              </div>
              <dl className="team-brief">
                <div>
                  <dt>PS</dt>
                  <dd>{selected.ps || 'Not provided'}</dd>
                </div>
                <div>
                  <dt>Short Desc</dt>
                  <dd>{selected.shortDesc || 'Not provided'}</dd>
                </div>
              </dl>
              <form
                onSubmit={(e: SyntheticEvent) => {
                  e.preventDefault();
                  setConfirming(true);
                }}
              >
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Criterion</th>
                        <th className="num">Weightage</th>
                        <th>Marks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {round.criteria.map((criterion) => (
                        <tr key={criterion.id}>
                          <td>{criterion.name}</td>
                          <td className="num">{criterion.weight}</td>
                          <td>
                            <span className="marks-cell">
                              <input
                                required
                                aria-label={`Marks for ${criterion.name}, maximum ${criterion.maxMarks}`}
                                type="number"
                                inputMode="decimal"
                                min={0}
                                max={criterion.maxMarks}
                                step={0.01}
                                value={marks[criterion.id] ?? ''}
                                onChange={(e) =>
                                  setMarks({ ...marks, [criterion.id]: e.target.value })
                                }
                              />
                              <span className="muted">/ {criterion.maxMarks}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="card-body">
                  <Field label="Remarks (optional)">
                    <textarea
                      maxLength={2000}
                      placeholder="What stood out? Leave a little context for your score."
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                    />
                  </Field>
                  <p className="scoring-notice">
                    <ShieldCheck size={15} />
                    Review your marks before submitting. Submitted scores are final and cannot be
                    edited.
                  </p>
                </div>
                <div className="submit-bar">
                  <span className="score-preview">
                    <span className="muted">Weighted score</span>
                    <span className="total">{preview === null ? '–' : preview.toFixed(2)}</span>
                    <span className="muted">/ 100</span>
                  </span>
                  <Button type="submit" icon={ArrowRight} disabled={preview === null}>
                    Submit scores
                  </Button>
                </div>
              </form>
            </section>
          )}
        </>
      )}
      {confirming && selected && round && (
        <Modal
          title="Submit these scores?"
          description={`${selected.name} · ${round.name}`}
          onClose={() => setConfirming(false)}
          busy={action.busy}
        >
          <p className="modal-copy">
            Weighted score <strong>{preview?.toFixed(2) ?? '–'} / 100</strong>. Scores cannot be
            changed after submitting.
          </p>
          <ErrorBanner message={action.error} />
          <div className="modal-actions">
            <Button variant="secondary" disabled={action.busy} onClick={() => setConfirming(false)}>
              Keep editing
            </Button>
            <Button
              busy={action.busy}
              icon={CheckCircle2}
              onClick={() => void action.run(submit)}
            >
              Submit final scores
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
