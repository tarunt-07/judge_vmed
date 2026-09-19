import {
  CalendarRange,
  Check,
  CircleStop,
  Layers3,
  ListChecks,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CriterionInput, Round, Team } from '../../shared/api';
import { useApi, useResource } from '../api';
import {
  Badge,
  Button,
  dateTime,
  Empty,
  ErrorBanner,
  Field,
  Loading,
  Modal,
  PageHeading,
  RoundBadge,
  SearchInput,
  useAction,
  useToast,
} from '../components/ui';

export function RoundsPage() {
  const resource = useResource<Round[]>('/rounds', 15000);
  const teams = useResource<Team[]>('/teams');
  const api = useApi();
  const toast = useToast();
  const action = useAction();
  const [create, setCreate] = useState(false);
  const [change, setChange] = useState<Round | null>(null);
  const [removing, setRemoving] = useState<Round | null>(null);
  const [editing, setEditing] = useState<{ round: Round; mode: 'criteria' | 'teams' } | null>(null);

  return (
    <>
      <PageHeading
        eyebrow="SET THE STAGE"
        title="Every round, a new possibility."
        description="Define the criteria, bring in the teams, and open the floor for judging."
        actions={
          <Button icon={Plus} onClick={() => setCreate(true)}>
            Create round
          </Button>
        }
      />
      <div className="info-strip">
        <CalendarRange size={19} />
        <p>
          <strong>Criteria lock once scoring begins.</strong> Each team is judged once per round, and a
          submitted score cannot be edited.
        </p>
      </div>
      <ErrorBanner message={resource.error} retry={resource.reload} />
      {resource.loading && !resource.data ? (
        <Loading />
      ) : !resource.data?.length ? (
        <section className="card">
          <Empty
            icon={Layers3}
            title="Your first round starts here"
            description="Create a round, choose its scoring criteria and participating teams, then open it for judging."
            action={
              <Button icon={Plus} onClick={() => setCreate(true)}>
                Create your first round
              </Button>
            }
          />
        </section>
      ) : (
        <div className="rounds-grid">
          {resource.data.map((round) => (
            <article
              className={`card round-card ${round.status === 'open' ? 'is-live' : ''}`}
              key={round.id}
            >
              <div className="row-between">
                <span className="round-number">ROUND {String(round.position).padStart(2, '0')}</span>
                <RoundBadge status={round.status} />
              </div>
              <h2>{round.name}</h2>
              <p className="round-description">
                {round.criteria.length
                  ? `${round.criteria.length} scoring criteria · ${round.teamIds.length} teams`
                  : 'Add criteria and teams to get this round ready.'}
              </p>
              <div className="round-audience">
                <Users size={16} />
                {round.teamIds.length} {round.teamIds.length === 1 ? 'team' : 'teams'}
                <Badge>{round.criteria.length} criteria</Badge>
              </div>
              <div className="round-progress">
                <div>
                  <strong>{round.evaluationCount}</strong>
                  <span> evaluated</span>
                  <span className="muted">
                    {round.teamIds.length
                      ? Math.round((round.evaluationCount / round.teamIds.length) * 100)
                      : 0}
                    %
                  </span>
                </div>
                <div className="progress-track">
                  <div
                    style={{
                      width: `${round.teamIds.length ? Math.min(100, (round.evaluationCount / round.teamIds.length) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div className="round-card-footer">
                <small>Created {dateTime(round.createdAt)}</small>
                <div className="row">
                  <Button
                    variant="ghost"
                    icon={ListChecks}
                    onClick={() => setEditing({ round, mode: 'criteria' })}
                  >
                    Criteria
                  </Button>
                  <Button
                    variant="ghost"
                    icon={Users}
                    onClick={() => setEditing({ round, mode: 'teams' })}
                  >
                    Teams
                  </Button>
                  <Button
                    variant={round.status === 'open' ? 'danger' : 'secondary'}
                    icon={round.status === 'open' ? CircleStop : round.status === 'closed' ? RotateCcw : Play}
                    onClick={() => {
                      action.setError('');
                      setChange(round);
                    }}
                  >
                    {round.status === 'open'
                      ? 'Close judging'
                      : round.status === 'closed'
                        ? 'Reopen'
                        : 'Open judging'}
                  </Button>
                  <button
                    className="icon-button"
                    title="Delete round"
                    aria-label={`Delete ${round.name}`}
                    onClick={() => {
                      action.setError('');
                      setRemoving(round);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {create && (
        <CreateRound
          onClose={() => setCreate(false)}
          onSaved={(name) => {
            setCreate(false);
            resource.reload();
            toast(`Created ${name}. Add criteria and teams, then open it for judging.`);
          }}
        />
      )}
      {editing?.mode === 'criteria' && (
        <CriteriaEditor
          round={editing.round}
          onClose={() => setEditing(null)}
          onSaved={(count) => {
            setEditing(null);
            resource.reload();
            toast(`Saved ${count} criteria for ${editing.round.name}.`);
          }}
        />
      )}
      {editing?.mode === 'teams' && (
        <TeamPicker
          round={editing.round}
          teams={teams.data ?? []}
          teamsError={teams.error}
          onClose={() => setEditing(null)}
          onSaved={(count) => {
            setEditing(null);
            resource.reload();
            toast(`${editing.round.name} now has ${count} teams.`);
          }}
        />
      )}
      {change && (
        <Modal
          title={
            change.status === 'open'
              ? 'Close judging?'
              : change.status === 'closed'
                ? 'Reopen this round?'
                : 'Open this round for judging?'
          }
          description={change.name}
          onClose={() => setChange(null)}
          busy={action.busy}
        >
          <p className="modal-copy">
            {change.status === 'open'
              ? 'Judges will no longer be able to submit scores. Existing evaluations stay saved.'
              : change.status === 'closed'
                ? 'Judges can score the remaining teams again. Existing evaluations are not affected.'
                : `The ${change.teamIds.length} selected teams become visible to judges, who can start scoring.`}
          </p>
          <ErrorBanner message={action.error} />
          <div className="modal-actions">
            <Button variant="secondary" disabled={action.busy} onClick={() => setChange(null)}>
              Cancel
            </Button>
            <Button
              icon={change.status === 'open' ? CircleStop : Play}
              variant={change.status === 'open' ? 'danger' : 'primary'}
              busy={action.busy}
              onClick={() =>
                void action.run(async () => {
                  const status = change.status === 'open' ? 'closed' : 'open';
                  await api.patch(`/rounds/${change.id}`, { status });
                  toast(
                    status === 'closed'
                      ? `${change.name} is closed for judging.`
                      : `${change.name} is open for judging.`,
                  );
                  setChange(null);
                  resource.reload();
                })
              }
            >
              {change.status === 'open' ? 'Close judging' : 'Open for judging'}
            </Button>
          </div>
        </Modal>
      )}
      {removing && (
        <Modal
          title="Delete this round?"
          description={removing.name}
          onClose={() => setRemoving(null)}
          busy={action.busy}
        >
          <p className="modal-copy">
            The round and its criteria are removed. Submitted evaluations are deleted with it.
          </p>
          <ErrorBanner message={action.error} />
          <div className="modal-actions">
            <Button variant="secondary" disabled={action.busy} onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              busy={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await api.del(`/rounds/${removing.id}`);
                  toast(`Deleted ${removing.name}.`);
                  setRemoving(null);
                  resource.reload();
                })
              }
            >
              Delete round
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function CreateRound({ onClose, onSaved }: { onClose: () => void; onSaved: (name: string) => void }) {
  const api = useApi();
  const action = useAction();
  const [name, setName] = useState('');
  return (
    <Modal
      title="Create a round"
      description="Set up the next stage of judging."
      onClose={onClose}
      busy={action.busy}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            await api.post('/rounds', { name });
            onSaved(name);
          });
        }}
      >
        <Field label="Round name">
          <input
            required
            autoFocus
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Round 1 · Idea presentation"
          />
        </Field>
        <ErrorBanner message={action.error} />
        <div className="modal-actions">
          <Button variant="secondary" disabled={action.busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" icon={Plus} busy={action.busy}>
            Create round
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type CriterionDraft = { name: string; maxMarks: string; weight: string };

function CriteriaEditor({
  round,
  onClose,
  onSaved,
}: {
  round: Round;
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const api = useApi();
  const action = useAction();
  const [rows, setRows] = useState<CriterionDraft[]>(() =>
    round.criteria.length > 0
      ? round.criteria.map((c) => ({
          name: c.name,
          maxMarks: String(c.maxMarks),
          weight: String(c.weight),
        }))
      : [{ name: '', maxMarks: '10', weight: '1' }],
  );
  const totalWeight = rows.reduce(
    (sum, row) => sum + (Number(row.weight) > 0 ? Number(row.weight) : 0),
    0,
  );
  const update = (index: number, patch: Partial<CriterionDraft>) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <Modal
      wide
      title={`Criteria · ${round.name}`}
      description="Each criterion is scored out of its max marks. Weightage decides how much it counts toward the team's score out of 100."
      onClose={onClose}
      busy={action.busy}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            const criteria: CriterionInput[] = rows.map((row) => ({
              name: row.name,
              maxMarks: Number(row.maxMarks),
              weight: Number(row.weight),
            }));
            await api.put(`/rounds/${round.id}/criteria`, { criteria });
            onSaved(criteria.length);
          });
        }}
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Criterion</th>
                <th>Max marks</th>
                <th>Weightage</th>
                <th className="num">Share</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  <td>
                    <input
                      required
                      aria-label={`Criterion ${index + 1} name`}
                      maxLength={120}
                      value={row.name}
                      onChange={(e) => update(index, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      required
                      aria-label={`Criterion ${index + 1} maximum marks`}
                      type="number"
                      min={1}
                      max={1000}
                      step={1}
                      value={row.maxMarks}
                      onChange={(e) => update(index, { maxMarks: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      required
                      aria-label={`Criterion ${index + 1} weightage`}
                      type="number"
                      min={0.01}
                      max={1000}
                      step="any"
                      value={row.weight}
                      onChange={(e) => update(index, { weight: e.target.value })}
                    />
                  </td>
                  <td className="num">
                    {totalWeight > 0 && Number(row.weight) > 0
                      ? `${((Number(row.weight) / totalWeight) * 100).toFixed(1)}%`
                      : '–'}
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="icon-button"
                        title="Remove criterion"
                        aria-label={`Remove criterion ${index + 1}`}
                        disabled={rows.length === 1}
                        onClick={() => setRows(rows.filter((_, i) => i !== index))}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button
          variant="ghost"
          icon={Plus}
          className="criteria-add"
          disabled={rows.length >= 20}
          onClick={() => setRows([...rows, { name: '', maxMarks: '10', weight: '1' }])}
        >
          Add criterion
        </Button>
        <p className="form-note">
          Criteria are locked once a judge submits a score for this round.
        </p>
        <ErrorBanner message={action.error} />
        <div className="modal-actions">
          <Button variant="secondary" disabled={action.busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={action.busy} icon={Check}>
            Save criteria
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TeamPicker({
  round,
  teams,
  teamsError,
  onClose,
  onSaved,
}: {
  round: Round;
  teams: Team[];
  teamsError: string;
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const api = useApi();
  const action = useAction();
  const [selected, setSelected] = useState(() => new Set(round.teamIds));
  const [search, setSearch] = useState('');
  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return teams;
    return teams.filter(
      (team) => team.name.toLowerCase().includes(query) || team.teamLead.toLowerCase().includes(query),
    );
  }, [teams, search]);
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }
  function setShown(checked: boolean) {
    const next = new Set(selected);
    for (const team of shown) {
      if (checked) next.add(team.id);
      else next.delete(team.id);
    }
    setSelected(next);
  }
  return (
    <Modal
      title={`Teams · ${round.name}`}
      description="Choose which teams judges can score in this round."
      onClose={onClose}
      busy={action.busy}
    >
      {teams.length === 0 && !teamsError ? (
        <p className="modal-copy">Add teams in the Teams tab first, then pick them here.</p>
      ) : (
        <div className="team-picker">
          <SearchInput
            placeholder="Search teams…"
            value={search}
            onChange={setSearch}
          />
          <div className="row">
            <Button variant="ghost" onClick={() => setShown(true)}>
              Select shown
            </Button>
            <Button variant="ghost" onClick={() => setShown(false)}>
              Clear shown
            </Button>
          </div>
          <div className="checklist">
            {shown.map((team) => (
              <label key={team.id}>
                <input
                  type="checkbox"
                  checked={selected.has(team.id)}
                  onChange={() => toggle(team.id)}
                />
                <span>
                  {team.name}
                  <small>{team.teamLead}</small>
                </span>
                {selected.has(team.id) && <Check size={16} />}
              </label>
            ))}
            {!shown.length && <p className="modal-copy" style={{ padding: 12 }}>No teams match.</p>}
          </div>
          <small>
            {selected.size} of {teams.length} selected
          </small>
        </div>
      )}
      <ErrorBanner message={action.error || teamsError} />
      <div className="modal-actions">
        <Button variant="secondary" disabled={action.busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          icon={Check}
          busy={action.busy}
          disabled={!teams.length}
          onClick={() =>
            void action.run(async () => {
              const teamIds = [...selected];
              await api.put(`/rounds/${round.id}/teams`, { teamIds });
              onSaved(teamIds.length);
            })
          }
        >
          Save teams
        </Button>
      </div>
    </Modal>
  );
}
