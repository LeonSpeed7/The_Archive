import { useState } from 'react';
import { Camera, Globe, TreePine, BookLock, ScanEye } from 'lucide-react';
import ARCameraTab from '@/components/tabs/ARCameraTab';
import GlobalDatabaseTab from '@/components/tabs/GlobalDatabaseTab';
import PersonalDatabaseTab from '@/components/tabs/PersonalDatabaseTab';
import FamilyTreeTab from '@/components/tabs/FamilyTreeTab';
import LiveSenseTab from '@/components/tabs/LiveSenseTab';
import ProfileMenu from '@/components/ProfileMenu';
import GuidedExploration from '@/components/GuidedExploration';

type Tab = 'camera' | 'livesense' | 'personal' | 'database' | 'tree';

const tabs: { id: Tab; label: string; icon: typeof Camera }[] = [
  { id: 'camera', label: 'AI Archiving', icon: Camera },
  { id: 'livesense', label: 'Live Sense', icon: ScanEye },
  { id: 'personal', label: 'My Archive', icon: BookLock },
  { id: 'database', label: 'Community Database', icon: Globe },
  { id: 'tree', label: 'Family Tree', icon: TreePine },
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('camera');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 z-50" style={{ backgroundColor: 'hsl(var(--teal-900))', borderColor: 'hsl(var(--teal-700) / 0.5)' }}>
        <div className="container flex items-center justify-between h-14">
          <button
            onClick={() => setActiveTab('database')}
            className="font-display text-xl font-semibold tracking-tight text-white hover:opacity-80 transition-opacity cursor-pointer"
          >
            The Archive
          </button>
          <ProfileMenu />
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="border-b" style={{ borderColor: 'hsl(var(--teal-200))', backgroundColor: 'hsl(var(--teal-50))' }}>
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
                    : 'hover:bg-[hsl(var(--teal-100))]'
                  }
                  active:scale-[0.97]
                `}
                style={isActive
                  ? { backgroundColor: 'hsl(var(--teal-500))', boxShadow: '0 4px 12px hsl(var(--teal-500) / 0.25)' }
                  : { color: 'hsl(var(--teal-700))' }
                }
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
          {activeTab === 'livesense' && <LiveSenseTab />}
          {activeTab === 'personal' && <PersonalDatabaseTab />}
          {activeTab === 'database' && <GlobalDatabaseTab />}
          {activeTab === 'tree' && <FamilyTreeTab />}
        </div>
      </main>

      {/* Guided Exploration */}
      <GuidedExploration activeTab={activeTab} onNavigateTab={setActiveTab} />
    </div>
  );
}
