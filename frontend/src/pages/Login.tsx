import { FormEvent, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!username.trim() || !password) {
      setError('Username and password are required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = await login(username.trim(), password);
    if (!result.success) {
      setError(result.error || 'Invalid username or password.');
    }

    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-[#09090b] bg-grid bg-noise relative">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[560px] h-[260px] bg-red-600/[0.08] blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 min-h-screen px-4 py-10 flex items-center justify-center">
        <div className="glass w-full max-w-md rounded-2xl p-6 sm:p-8 animate-fade-in-up space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 32 32" className="w-7 h-7" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" rx="8" fill="#1a0a0a" />
                <path d="M8 24L24 8" stroke="url(#lg)" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 4" />
                <circle cx="8" cy="24" r="3.5" fill="#dc2626" />
                <circle cx="16" cy="16" r="2.5" fill="#ef4444" />
                <circle cx="24" cy="8" r="3.5" fill="#fca5a5" />
                <defs>
                  <linearGradient id="lg" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0%" stopColor="#dc2626" />
                    <stop offset="100%" stopColor="#fca5a5" />
                  </linearGradient>
                </defs>
              </svg>
              <h1 className="text-xl font-semibold text-white tracking-tight">ContentEngine</h1>
            </div>
            <p className="text-sm text-zinc-500">
              Sign in with a preconfigured account. Signup is currently disabled.
            </p>
          </div>

          {error && (
            <div className="notification bg-red-500/5 border border-red-500/10 text-red-400 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-xs font-medium text-zinc-500 mb-1.5">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Enter your username"
                className="glass-input w-full p-2.5 rounded-lg text-sm"
                disabled={submitting}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-zinc-500 mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                className="glass-input w-full p-2.5 rounded-lg text-sm"
                disabled={submitting}
              />
            </div>

            <button type="submit" disabled={submitting} className="btn-primary w-full text-sm">
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
