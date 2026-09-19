import { useAuth, useClerk } from '@clerk/react';
import { ClipboardList, LogOut, Menu, Trophy, UserCog, Users, X } from 'lucide-react';
import { Suspense, lazy, useEffect, useState } from 'react';
import { AuthGate } from './pages/SignIn';
import type { Account } from '../shared/api';
import { ApiProvider, useResource } from './api';
import { Avatar, ErrorBanner, Loading, ToastProvider } from './components/ui';

const ResultsPage = lazy(() => import('./pages/Results').then((m) => ({ default: m.ResultsPage })));
const RoundsPage = lazy(() => import('./pages/Rounds').then((m) => ({ default: m.RoundsPage })));
const TeamsPage = lazy(() => import('./pages/Teams').then((m) => ({ default: m.TeamsPage })));
const AccountsPage = lazy(() => import('./pages/Accounts').then((m) => ({ default: m.AccountsPage })));
const JudgePage = lazy(() => import('./pages/Judge').then((m) => ({ default: m.JudgePage })));

const adminNav = [
  { path: '/', label: 'Results', icon: Trophy },
  { path: '/rounds', label: 'Rounds', icon: ClipboardList },
  { path: '/teams', label: 'Teams', icon: Users },
  { path: '/accounts', label: 'Accounts', icon: UserCog },
];
const judgeNav = [
  { path: '/', label: 'Judging', icon: ClipboardList },
  { path: '/results', label: 'Results', icon: Trophy },
];
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const path = hash.replace(/^#/, '').split('?')[0] || '/';
  return path;
}
function Shell({ me }: { me: Account }) {
  const { signOut } = useClerk();
  const path = useHashRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const role = me.role;
  const nav = role === 'admin' ? adminNav : judgeNav;
  const resolved = nav.some((n) => n.path === path) ? path : '/';
  const current = nav.find((n) => n.path === resolved) || nav[0];
  useEffect(() => setMenuOpen(false), [resolved]);
  function page() {
    switch (resolved) {
      case '/rounds':
        return <RoundsPage />;
      case '/teams':
        return <TeamsPage />;
      case '/accounts':
        return <AccountsPage me={me} />;
      case '/results':
        return <ResultsPage role={role} />;
      default:
        return role === 'admin' ? <ResultsPage role={role} /> : <JudgePage />;
    }
  }
  const displayName = me.displayName || me.username || me.email || 'Account';
  const signOutButton = (
    <button
      className="icon-button"
      title="Sign out"
      aria-label="Sign out"
      onClick={() => void signOut().then(() => (window.location.hash = '/'))}
    >
      <LogOut size={18} />
    </button>
  );
  return (
    <div className="app-shell">
      {menuOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside className={`sidebar ${menuOpen ? 'mobile-open' : ''}`}>
        <button
          className="icon-button mobile-close"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        >
          <X size={22} />
        </button>
        <a className="brand" href="#/">
          <img src="/vmedithon-shorten.png" alt="" />
          <span>
            VMEDITHON
            <small>Judging console</small>
          </span>
        </a>
        <div className="workspace-label">
          <span className="workspace-icon">
            <ClipboardList size={19} />
          </span>
          <span>
            Judging desk
            <small>{role === 'admin' ? 'Admin workspace' : 'Judge workspace'}</small>
          </span>
        </div>
        <p className="nav-group">WORKSPACE</p>
        <nav>
          {nav.map((item) => (
            <a
              key={item.path}
              className={`nav-link ${resolved === item.path ? 'active' : ''}`}
              href={`#${item.path}`}
            >
              <item.icon size={19} />
              {item.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="account-block">
            <Avatar name={displayName} />
            <div>
              <strong>{displayName}</strong>
              <small>
                {role === 'admin' ? 'Administrator' : 'Judge'} · {me.username || me.email || 'Signed in'}
              </small>
            </div>
            {signOutButton}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-location">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation menu"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={22} />
            </button>
            <span>VMEDITHON</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{current.label}</strong>
          </div>
          <div className="topbar-right">
            <Avatar name={displayName} small />
            <span className="topbar-divider" />
            {signOutButton}
          </div>
        </header>
        <main className="main-content">
          <Suspense fallback={<Loading />}>{page()}</Suspense>
          <footer className="app-footer">
            <span>
              VMEDITHON <span>/ JUDGING CONSOLE</span>
            </span>
            <span>v2.0 · Judging console</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Portal() {
  const { data: me, error, loading, reload } = useResource<Account>('/me');
  if (loading && !me) {
    return (
      <div className="boot-screen">
        <img src="/vmedithon-shorten.png" alt="" />
        <Loading />
      </div>
    );
  }
  if (error || !me) {
    return (
      <div className="boot-screen">
        <img src="/vmedithon-shorten.png" alt="" />
        <h1>VMEDITHON Judging</h1>
        <ErrorBanner message={error || 'Your account does not have access to this workspace.'} retry={reload} />
      </div>
    );
  }
  return <Shell me={me} />;
}
export function App() {
  const { sessionId, getToken } = useAuth();
  return (
    <ToastProvider>
      <AuthGate>
        <ApiProvider key={sessionId} getToken={getToken}>
          <Portal />
        </ApiProvider>
      </AuthGate>
    </ToastProvider>
  );
}
