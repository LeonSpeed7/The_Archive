import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLogin) {
      if (!fullName.trim()) {
        toast.error('Full name is required');
        return;
      }
      if (!username.trim()) {
        toast.error('Username is required');
        return;
      }
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(username.trim())) {
        toast.error('Username must be 3–30 characters (letters, numbers, underscores)');
        return;
      }
    }
    setLoading(true);
    try {
      if (isLogin) {
        await signIn(email, password);
        toast.success('Welcome back!');
      } else {
        await signUp(email, password, fullName.trim(), username.trim().toLowerCase());
        toast.success('Account created! Check your email to confirm.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(180deg, hsl(var(--teal-50)) 0%, hsl(var(--background)) 60%)' }}>
      <div className="w-full max-w-md">
        <div className="animate-reveal-up text-center mb-10">
          <h1 className="font-display text-4xl font-bold tracking-tight leading-[1.1]" style={{ color: 'hsl(var(--teal-900))' }}>
            The Archive
          </h1>
          <p className="mt-3 text-lg" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Preserve your stories. Connect your past.
          </p>
        </div>

        <div className="animate-reveal-up stagger-2 rounded-xl border p-8 shadow-lg" style={{ backgroundColor: 'hsl(var(--teal-50))', borderColor: 'hsl(var(--teal-200))', boxShadow: '0 8px 32px hsl(var(--teal-900) / 0.06)' }}>
          <h2 className="font-display text-xl font-semibold mb-6" style={{ color: 'hsl(var(--teal-900))' }}>
            {isLogin ? 'Welcome back' : 'Create your account'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>
                    Full Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    required
                    className="bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>
                    Username <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="e.g. grandma_rose"
                    required
                    maxLength={30}
                    className="bg-background font-mono"
                  />
                  <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Others will use this to add you as a family member
                  </p>
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>
                Email <span className="text-destructive">*</span>
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="bg-background"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>
                Password <span className="text-destructive">*</span>
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="bg-background"
              />
            </div>
            <Button
              type="submit"
              className="w-full mt-2 text-white"
              disabled={loading}
              style={{ backgroundColor: 'hsl(var(--teal-cta))' }}
            >
              {loading ? 'Please wait...' : isLogin ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm transition-colors duration-[var(--duration-state)]"
              style={{ color: 'hsl(var(--teal-500))' }}
            >
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
