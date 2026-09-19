import { KeyRound, Mail, Plus, RefreshCcw, ShieldCheck, Users } from 'lucide-react';
import { useState } from 'react';
import type { Account } from '../../shared/api';
import { useApi, useResource } from '../api';
import {
  Avatar,
  Badge,
  Button,
  dateTime,
  Empty,
  ErrorBanner,
  Field,
  Loading,
  Modal,
  PageHeading,
  useAction,
  useToast,
} from '../components/ui';

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function AccountsPage({ me }: { me: Account }) {
  const api = useApi();
  const resource = useResource<Account[]>('/accounts');
  const action = useAction();
  const toast = useToast();
  const [create, setCreate] = useState<'admin' | 'judge' | null>(null);
  const [password, setPassword] = useState<Account | null>(null);
  const [toggle, setToggle] = useState<Account | null>(null);
  return (
    <>
      <PageHeading
        eyebrow="THE PEOPLE BEHIND THE PERSPECTIVE"
        title="Access & roles"
        description="Welcome your judges and give your event team the access they need."
        actions={
          <>
            <Button variant="secondary" icon={ShieldCheck} onClick={() => setCreate('admin')}>
              Add admin
            </Button>
            <Button icon={Plus} onClick={() => setCreate('judge')}>
              Add judge
            </Button>
          </>
        }
      />
      <div className="role-cards">
        <div className="card">
          <span className="role-icon">
            <ShieldCheck size={22} />
          </span>
          <div>
            <h2>Admins</h2>
            <p>Manage teams, rounds, results, and the judging panel.</p>
            <Badge>
              <Mail size={12} />
              Email sign-in only
            </Badge>
          </div>
        </div>
        <div className="card">
          <span className="role-icon">
            <KeyRound size={22} />
          </span>
          <div>
            <h2>Judges</h2>
            <p>Score the teams assigned to each open round.</p>
            <Badge>
              <KeyRound size={12} />
              Username &amp; password
            </Badge>
          </div>
        </div>
      </div>
      <section className="card">
        <div className="section-heading">
          <h2>
            Workspace members <span className="count-label">{resource.data?.length || 0}</span>
          </h2>
        </div>
        <ErrorBanner message={resource.error} retry={resource.reload} />
        {resource.loading && !resource.data ? (
          <Loading />
        ) : !resource.data?.length ? (
          <Empty
            icon={Users}
            title="No workspace members"
            description="Add an admin or a judge to begin."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Sign-in</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th className="align-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="person-cell">
                        <Avatar name={a.displayName} />
                        <div>
                          <strong>
                            {a.displayName}
                            {me.id === a.id && <span className="you-label">You</span>}
                          </strong>
                          <small>Added {dateTime(a.createdAt)}</small>
                        </div>
                      </div>
                    </td>
                    <td className={a.username ? 'mono' : ''}>
                      {a.role === 'admin' ? a.email : a.username}
                    </td>
                    <td>
                      <Badge tone={a.role === 'admin' ? 'green' : 'neutral'}>
                        {a.role === 'admin' ? 'Admin' : 'Judge'}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={!a.active ? 'red' : a.linked ? 'green' : 'amber'} dot={a.active && a.linked}>
                        {!a.active ? 'Disabled' : a.linked ? 'Active' : 'Invited'}
                      </Badge>
                    </td>
                    <td>
                      <div className="table-actions">
                        {a.role === 'judge' && (
                          <button
                            className="icon-button"
                            title="Reset password"
                            aria-label={`Reset password for ${a.displayName}`}
                            onClick={() => setPassword(a)}
                          >
                            <KeyRound size={17} />
                          </button>
                        )}
                        {a.id !== me.id && (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              action.setError('');
                              setToggle(a);
                            }}
                          >
                            {a.active ? 'Disable' : 'Enable'}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {create && (
        <CreateAccount
          role={create}
          onClose={() => setCreate(null)}
          onSaved={(message) => {
            setCreate(null);
            resource.reload();
            toast(message);
          }}
        />
      )}
      {password && (
        <ResetPassword
          account={password}
          onClose={() => setPassword(null)}
          onSaved={(username) => {
            setPassword(null);
            toast(`Password for ${username} was reset. Share it securely.`);
          }}
        />
      )}
      {toggle && (
        <Modal
          title={`${toggle.active ? 'Disable' : 'Enable'} access?`}
          description={toggle.displayName}
          onClose={() => setToggle(null)}
          busy={action.busy}
        >
          <p className="modal-copy">
            {toggle.active
              ? 'This member will immediately lose access to the judging console, including with an existing session.'
              : 'This member will be able to use the judging console again.'}
          </p>
          <ErrorBanner message={action.error} />
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setToggle(null)} disabled={action.busy}>
              Cancel
            </Button>
            <Button
              variant={toggle.active ? 'danger' : 'primary'}
              busy={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await api.patch(`/accounts/${toggle.id}`, { active: !toggle.active });
                  toast(`${toggle.displayName} ${toggle.active ? 'disabled' : 'enabled'}.`);
                  setToggle(null);
                  resource.reload();
                })
              }
            >
              {toggle.active ? 'Disable access' : 'Enable access'}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function CreateAccount({
  role,
  onClose,
  onSaved,
}: {
  role: 'admin' | 'judge';
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const api = useApi();
  const action = useAction();
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState(generatePassword());
  return (
    <Modal
      title={role === 'admin' ? 'Add an admin' : 'Add a judge'}
      description={
        role === 'admin'
          ? 'They sign in with their email. An invitation email is sent.'
          : 'Create their username and password in Clerk.'
      }
      onClose={onClose}
      busy={action.busy}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            if (role === 'admin') {
              await api.post('/accounts/admins', { email: login, displayName: name });
              onSaved(`Invitation sent to ${login}. They sign in with that email.`);
            } else {
              await api.post('/accounts/judges', {
                username: login,
                displayName: name,
                password,
              });
              onSaved(`Judge created. Username "${login.toLowerCase()}", password "${password}".`);
            }
          });
        }}
      >
        <Field label="Full name">
          <input
            required
            autoFocus
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field
          label={role === 'admin' ? 'Email address' : 'Username'}
          hint={role === 'judge' ? '4 to 64 letters, numbers, underscores or hyphens.' : undefined}
        >
          <input
            type={role === 'admin' ? 'email' : 'text'}
            required
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="off"
            maxLength={role === 'admin' ? 254 : 64}
            minLength={role === 'judge' ? 4 : undefined}
            pattern={role === 'judge' ? '[a-zA-Z0-9_-]{4,64}' : undefined}
          />
        </Field>
        {role === 'judge' && (
          <div className="field">
            <span>Password</span>
            <span className="row">
              <input
                required
                minLength={8}
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <Button
                variant="secondary"
                icon={RefreshCcw}
                onClick={() => setPassword(generatePassword())}
              >
                Generate
              </Button>
            </span>
            <small>At least 8 characters. Share it with this judge securely.</small>
          </div>
        )}
        <p className="form-note">
          {role === 'admin'
            ? 'Admins can manage the entire judging workspace and add other admins.'
            : 'Judges can score teams in open rounds. Passwords are handled by Clerk and are never saved in the judging database.'}
        </p>
        <ErrorBanner message={action.error} />
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={action.busy}>
            Cancel
          </Button>
          <Button type="submit" busy={action.busy} icon={Plus}>
            Create {role === 'admin' ? 'admin' : 'judge'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPassword({
  account,
  onClose,
  onSaved,
}: {
  account: Account;
  onClose: () => void;
  onSaved: (username: string) => void;
}) {
  const api = useApi();
  const action = useAction();
  const [password, setPassword] = useState(generatePassword());
  return (
    <Modal
      title="Reset judge password"
      description={`${account.displayName} · ${account.username}`}
      onClose={onClose}
      busy={action.busy}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            await api.post(`/accounts/${account.id}/password`, { password });
            onSaved(account.username || account.displayName);
          });
        }}
      >
        <div className="field">
          <span>New password</span>
          <span className="row">
            <input
              required
              minLength={8}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <Button variant="secondary" icon={RefreshCcw} onClick={() => setPassword(generatePassword())}>
              Generate
            </Button>
          </span>
          <small>At least 8 characters.</small>
        </div>
        <p className="form-note">
          Existing sessions may be signed out. Share the new password directly with the judge.
        </p>
        <ErrorBanner message={action.error} />
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={action.busy}>
            Cancel
          </Button>
          <Button type="submit" busy={action.busy} icon={KeyRound}>
            Reset password
          </Button>
        </div>
      </form>
    </Modal>
  );
}
