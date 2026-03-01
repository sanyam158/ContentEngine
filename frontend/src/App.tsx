import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Script2Thread } from './pages/Script2Thread';
import { Noise2Article } from './pages/Noise2Article';
import { Idea2Content } from './pages/Idea2Content';
import { SavedArticles } from './pages/SavedArticles';
import { CaptionedVideoGenerator } from './pages/CaptionedVideoGenerator';
import { TestImagePrompts } from './pages/TestImagePrompts';
import { Login } from './pages/Login';
import { useAuth } from './auth/AuthContext';

function AppShell() {
  const { user, logout } = useAuth();

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#09090b] bg-grid bg-noise relative">
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-red-600/[0.06] blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10 max-w-xl mx-auto px-4 py-12 sm:py-16">
          <header className="mb-10 animate-fade-in">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <svg viewBox="0 0 32 32" className="w-7 h-7" xmlns="http://www.w3.org/2000/svg">
                  <rect width="32" height="32" rx="8" fill="#1a0a0a" />
                  <path d="M8 24L24 8" stroke="url(#hg)" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 4" />
                  <circle cx="8" cy="24" r="3.5" fill="#dc2626" />
                  <circle cx="16" cy="16" r="2.5" fill="#ef4444" />
                  <circle cx="24" cy="8" r="3.5" fill="#fca5a5" />
                  <defs>
                    <linearGradient id="hg" x1="0" y1="1" x2="1" y2="0">
                      <stop offset="0%" stopColor="#dc2626" />
                      <stop offset="100%" stopColor="#fca5a5" />
                    </linearGradient>
                  </defs>
                </svg>
                <h1 className="text-xl font-semibold text-white tracking-tight">ContentEngine</h1>
              </div>

              <div className="flex items-center gap-2">
                <span className="hidden sm:inline text-xs text-zinc-500">
                  {user?.displayName}
                </span>
                <button onClick={logout} className="btn-glass px-3 py-1.5 text-xs rounded-lg">
                  Logout
                </button>
              </div>
            </div>

            <nav className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-x-auto scrollbar-hide">
              {(
                [
                  { to: '/', end: true, label: 'Script2Thread' },
                  { to: '/noise2article', label: 'Noise2Article' },
                  { to: '/idea2content', label: 'Idea2Content' },
                  { to: '/video', label: 'VideoGen' },
                  { to: '/saved', label: 'Saved' },
                ] as Array<{ to: string; end?: boolean; label: string }>
              ).map(({ to, end, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `shrink-0 whitespace-nowrap text-center py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-red-600/20 text-red-400 border border-red-500/20'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          </header>

          <Routes>
            <Route path="/" element={<Script2Thread />} />
            <Route path="/noise2article" element={<Noise2Article />} />
            <Route path="/idea2content" element={<Idea2Content />} />
            <Route path="/video" element={<CaptionedVideoGenerator />} />
            <Route path="/saved" element={<SavedArticles />} />
            <Route path="/test-image" element={<TestImagePrompts />} />
          </Routes>

          <footer className="mt-8 text-center text-xs text-zinc-700">
            <p>Built with Gemini, Tavily and Composio</p>
          </footer>
        </div>
      </div>
    </BrowserRouter>
  );
}

function AppLoading() {
  return (
    <div className="min-h-screen bg-[#09090b] bg-grid bg-noise relative flex items-center justify-center px-4">
      <div className="glass rounded-2xl px-6 py-5 text-sm text-zinc-400 animate-fade-in-up">
        Restoring session...
      </div>
    </div>
  );
}

function App() {
  const { isInitializing, isAuthenticated } = useAuth();

  if (isInitializing) {
    return <AppLoading />;
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return <AppShell />;
}

export default App;
