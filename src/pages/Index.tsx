import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import AuthPage from '@/components/AuthPage';
import Dashboard from '@/components/Dashboard';
import LandingPage from '@/components/LandingPage';

export default function Index() {
  const { user, loading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground font-display text-lg">Loading...</div>
      </div>
    );
  }

  if (user) return <Dashboard />;
  if (showAuth) return <AuthPage />;
  return <LandingPage onGetStarted={() => setShowAuth(true)} />;
}
