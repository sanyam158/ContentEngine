import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Script2Thread } from './pages/Script2Thread';
import { Noise2Article } from './pages/Noise2Article';
import { SavedArticles } from './pages/SavedArticles';
import { TestImagePrompts } from './pages/TestImagePrompts';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#09090b] bg-grid bg-noise relative">
        {/* Top gradient glow */}
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-red-600/[0.06] blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10 max-w-xl mx-auto px-4 py-12 sm:py-16">
          {/* Header */}
          <header className="mb-10 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
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
              <h1 className="text-xl font-semibold text-white tracking-tight">Script2Thread</h1>
            </div>

            {/* Navigation tabs */}
            <nav className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `flex-1 text-center py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-red-600/20 text-red-400 border border-red-500/20'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'
                  }`
                }
              >
                Script2Thread
              </NavLink>
              <NavLink
                to="/noise2article"
                className={({ isActive }) =>
                  `flex-1 text-center py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-red-600/20 text-red-400 border border-red-500/20'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'
                  }`
                }
              >
                Noise2Article
              </NavLink>
              <NavLink
                to="/saved"
                className={({ isActive }) =>
                  `flex-1 text-center py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-red-600/20 text-red-400 border border-red-500/20'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'
                  }`
                }
              >
                Saved Articles
              </NavLink>

            </nav>
          </header>

          {/* Routes */}
          <Routes>
            <Route path="/" element={<Script2Thread />} />
            <Route path="/noise2article" element={<Noise2Article />} />
            <Route path="/saved" element={<SavedArticles />} />
            <Route path="/test-image" element={<TestImagePrompts />} />
          </Routes>

          {/* Footer */}
          <footer className="mt-8 text-center text-xs text-zinc-700">
            <p>Built with Gemini, Tavily & Composio</p>
          </footer>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
