import { useState } from 'react';
import { Camera, Globe, TreePine, BookLock } from 'lucide-react';
import ARCameraTab from '@/components/tabs/ARCameraTab';
import GlobalDatabaseTab from '@/components/tabs/GlobalDatabaseTab';
import PersonalDatabaseTab from '@/components/tabs/PersonalDatabaseTab';
import FamilyTreeTab from '@/components/tabs/FamilyTreeTab';
import ProfileMenu from '@/components/ProfileMenu';

type Tab = 'camera' | 'personal' | 'database' | 'tree';

const tabs: { id: Tab; label: string; icon: typeof Camera; colorVar: string }[] = [
  { id: 'camera', label: 'AI Camera', icon: Camera, colorVar: '--color-camera' },
  { id: 'personal', label: 'My Archive', icon: BookLock, colorVar: '--color-nav' },
  { id: 'database', label: 'Community Database', icon: Globe, colorVar: '--color-community' },
  { id: 'tree', label: 'Family Tree', icon: TreePine, colorVar: '--color-tree' },
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('camera');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-50" style={{ backgroundColor: 'hsl(var(--color-nav))' }}>
        <div className="container flex items-center justify-between h-14">
          <h1 className="font-display text-xl font-semibold tracking-tight text-white">
            The Archive
          </h1>
          <ProfileMenu />
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="border-b border-border bg-card/60">
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
                    ? 'text-white shadow-md'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }
                  active:scale-[0.97]
                `}
                style={isActive ? { backgroundColor: `hsl(var(${tab.colorVar}))`, boxShadow: `0 4px 12px hsl(var(${tab.colorVar}) / 0.25)` } : undefined}
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
          {activeTab === 'personal' && <PersonalDatabaseTab />}
          {activeTab === 'database' && <GlobalDatabaseTab />}
          {activeTab === 'tree' && <FamilyTreeTab />}
        </div>
      </main>
    </div>
  );
}
