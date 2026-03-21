import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Camera, Globe, TreePine, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ARCameraTab from '@/components/tabs/ARCameraTab';
import GlobalDatabaseTab from '@/components/tabs/GlobalDatabaseTab';
import FamilyTreeTab from '@/components/tabs/FamilyTreeTab';

type Tab = 'camera' | 'database' | 'tree';

const tabs: { id: Tab; label: string; icon: typeof Camera }[] = [
  { id: 'camera', label: 'AR Camera', icon: Camera },
  { id: 'database', label: 'Global Database', icon: Globe },
  { id: 'tree', label: 'Family Tree', icon: TreePine },
];

export default function Dashboard() {
  const { user, signOut } = useAuth();
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
        <div className="container flex gap-1 py-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
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
      <main className="container py-8">
        <div className="animate-fade-in" key={activeTab}>
          {activeTab === 'camera' && <ARCameraTab />}
          {activeTab === 'database' && <GlobalDatabaseTab />}
          {activeTab === 'tree' && <FamilyTreeTab />}
        </div>
      </main>
    </div>
  );
}
