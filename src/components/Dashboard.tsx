import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Camera, Globe, TreePine, BookLock } from 'lucide-react';
import ARCameraTab from '@/components/tabs/ARCameraTab';
import GlobalDatabaseTab from '@/components/tabs/GlobalDatabaseTab';
import PersonalDatabaseTab from '@/components/tabs/PersonalDatabaseTab';
import FamilyTreeTab from '@/components/tabs/FamilyTreeTab';
import ProfileMenu from '@/components/ProfileMenu';

type Tab = 'camera' | 'personal' | 'database' | 'tree';

const tabs: { id: Tab; label: string; icon: typeof Camera }[] = [
  { id: 'camera', label: 'AR Camera', icon: Camera },
  { id: 'personal', label: 'My Archive', icon: BookLock },
  { id: 'database', label: 'Global Database', icon: Globe },
  { id: 'tree', label: 'Family Tree', icon: TreePine },
];

function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, username, display_name')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

function ProfileInfo() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');

  const startEditing = () => {
    setFullName(profile?.full_name || profile?.display_name || '');
    setUsername(profile?.username || '');
    setEditing(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const trimmedName = fullName.trim();
      const trimmedUsername = username.trim().toLowerCase();
      if (!trimmedName) throw new Error('Full name is required');
      if (!trimmedUsername) throw new Error('Username is required');
      if (!/^[a-z0-9_]{3,30}$/.test(trimmedUsername)) {
        throw new Error('Username must be 3–30 characters (letters, numbers, underscores)');
      }
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: trimmedName, username: trimmedUsername, display_name: trimmedName })
        .eq('user_id', user!.id);
      if (error) {
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
          throw new Error('That username is already taken');
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success('Profile updated!');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (!profile) return null;

  if (editing) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <UserCircle className="w-4 h-4 text-primary flex-shrink-0" />
        <Input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Full name"
          className="h-8 text-xs bg-background w-36"
          autoFocus
        />
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
          placeholder="username"
          className="h-8 text-xs bg-background w-32 font-mono"
          maxLength={30}
        />
        <Button size="sm" className="h-8 text-xs px-2" onClick={() => save.mutate()} disabled={save.isPending}>
          <Check className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-xs px-2" onClick={() => setEditing(false)}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <UserCircle className="w-4 h-4 text-primary" />
      <span className="font-medium text-foreground">{profile.full_name || profile.display_name}</span>
      <span className="text-muted-foreground font-mono text-xs">@{profile.username || '—'}</span>
      <button onClick={startEditing} className="text-muted-foreground hover:text-foreground transition-colors ml-0.5">
        <Pencil className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const { data: safeword, isLoading: safewordLoading } = useSafeword();
  const [activeTab, setActiveTab] = useState<Tab>('camera');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
            Heritage Archive
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user?.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-4 h-4 mr-1.5" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="border-b border-border bg-card/40">
        <div className="container flex gap-1 py-2 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap
                  transition-all duration-[var(--duration-state)]
                  ${isActive
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }
                  active:scale-[0.97]
                `}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Tab Content */}
      <main className="container py-8 space-y-4">
        {/* Profile info */}
        <div className="animate-reveal-up flex flex-wrap items-center gap-x-6 gap-y-2">
          <ProfileInfo />
          {!safewordLoading && !safeword && null}
          {!safewordLoading && safeword && <SafewordDisplay />}
        </div>

        {/* Safeword setup banner */}
        {!safewordLoading && !safeword && (
          <div className="animate-reveal-up">
            <SafewordSetup />
          </div>
        )}

        <div className="animate-fade-in" key={activeTab}>
          {activeTab === 'camera' && <ARCameraTab />}
          {activeTab === 'personal' && <PersonalDatabaseTab />}
          {activeTab === 'database' && <GlobalDatabaseTab />}
          {activeTab === 'tree' && <FamilyTreeTab />}
        </div>
      </main>
    </div>
  );
}
