import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Plus, Unlink, Loader2, TreePine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useConnections } from '@/components/FamilyConnections';

const RELATIONSHIP_TYPES = [
  { value: 'parent', label: 'Parent', dash: '', color: 'hsl(18 62% 45%)' },
  { value: 'child', label: 'Child', dash: '', color: 'hsl(152 28% 42%)' },
  { value: 'sibling', label: 'Sibling', dash: '8 4', color: 'hsl(200 50% 45%)' },
  { value: 'spouse', label: 'Spouse', dash: '2 3', color: 'hsl(340 45% 50%)' },
  { value: 'grandparent', label: 'Grandparent', dash: '12 4', color: 'hsl(25 80% 55%)' },
  { value: 'grandchild', label: 'Grandchild', dash: '12 4', color: 'hsl(45 70% 48%)' },
  { value: 'cousin', label: 'Cousin', dash: '4 6', color: 'hsl(270 40% 55%)' },
  { value: 'uncle_aunt', label: 'Uncle / Aunt', dash: '6 3 2 3', color: 'hsl(160 45% 40%)' },
  { value: 'nephew_niece', label: 'Nephew / Niece', dash: '6 3 2 3', color: 'hsl(30 60% 50%)' },
  { value: 'other', label: 'Other', dash: '3 6', color: 'hsl(0 0% 55%)' },
] as const;

function getRelConfig(value: string) {
  return RELATIONSHIP_TYPES.find(r => r.value === value) || RELATIONSHIP_TYPES[RELATIONSHIP_TYPES.length - 1];
}

const MEMBER_COLORS = [
  { bg: 'hsl(18 62% 45%)', light: 'hsl(18 62% 92%)' },
  { bg: 'hsl(152 28% 42%)', light: 'hsl(152 28% 92%)' },
  { bg: 'hsl(25 80% 55%)', light: 'hsl(25 80% 92%)' },
  { bg: 'hsl(200 50% 45%)', light: 'hsl(200 50% 92%)' },
  { bg: 'hsl(340 45% 50%)', light: 'hsl(340 45% 92%)' },
  { bg: 'hsl(45 70% 48%)', light: 'hsl(45 70% 92%)' },
];

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function FamilyTreeTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: connections = [], isLoading } = useConnections();
  const [showAddForm, setShowAddForm] = useState(false);
  const [username, setUsername] = useState('');
  const [safeword, setSafeword] = useState('');
  const [relationship, setRelationship] = useState('parent');

  const { data: myProfile } = useQuery({
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

  const connect = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('connect_by_safeword', {
        p_safeword: safeword.trim(),
        p_username: username.trim().toLowerCase(),
        p_relationship: relationship,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Family member added!');
      setSafeword('');
      setUsername('');
      setRelationship('parent');
      setShowAddForm(false);
      queryClient.invalidateQueries({ queryKey: ['family-connections'] });
    },
    onError: (err: any) => toast.error(err.message || 'Connection failed'),
  });

  const disconnect = useMutation({
    mutationFn: async (connectionId: string) => {
      const { error } = await supabase.from('family_connections').delete().eq('id', connectionId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Member removed');
      queryClient.invalidateQueries({ queryKey: ['family-connections'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const members = (connections as any[]);
  const myName = myProfile?.full_name || myProfile?.display_name || 'You';
  const myUsername = myProfile?.username || '';

  // Layout
  const svgW = 700;
  const svgH = Math.max(420, members.length > 6 ? 520 : 420);
  const cx = svgW / 2;
  const cy = svgH / 2;
  const centerR = 48;
  const memberR = 36;
  const orbitRadius = Math.min(svgW, svgH) * 0.34;

  const memberPositions = members.map((_: any, i: number) => {
    const angle = (2 * Math.PI * i) / members.length - Math.PI / 2;
    return {
      x: cx + orbitRadius * Math.cos(angle),
      y: cy + orbitRadius * Math.sin(angle),
    };
  });

  // Collect unique relationship types used for the legend
  const usedRelTypes = [...new Set(members.map((m: any) => m.relationship || 'other'))];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="animate-reveal-up flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-foreground">Family Tree</h2>
          <p className="text-muted-foreground mt-1">Connect with family by username & safeword</p>
        </div>
        <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Add Member
        </Button>
      </div>

      {/* Add member form */}
      {showAddForm && (
        <div className="animate-reveal-up bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="font-display text-lg font-semibold text-foreground">Add a Family Member</h3>
          <p className="text-sm text-muted-foreground">
            Enter their username, safeword, and your relationship to connect.
          </p>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Username <span className="text-destructive">*</span></label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="e.g. grandma_rose"
              className="bg-background font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Their safeword <span className="text-destructive">*</span></label>
            <Input
              value={safeword}
              onChange={(e) => setSafeword(e.target.value)}
              placeholder="Enter their safeword…"
              className="bg-background"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Relationship <span className="text-destructive">*</span></label>
            <div className="flex flex-wrap gap-2">
              {RELATIONSHIP_TYPES.map((rel) => (
                <button
                  key={rel.value}
                  type="button"
                  onClick={() => setRelationship(rel.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 active:scale-[0.96] ${
                    relationship === rel.value
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  }`}
                >
                  {rel.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => connect.mutate()}
              disabled={!safeword.trim() || !username.trim() || connect.isPending}
            >
              {connect.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}
            </Button>
            <Button variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Visual Tree */}
      {isLoading && <p className="text-muted-foreground text-center py-8">Loading…</p>}

      {!isLoading && members.length === 0 && !showAddForm && (
        <div className="text-center py-16 animate-reveal-up">
          <TreePine className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground font-medium">Your family tree is empty</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Click "Add Member" and enter a family member's username & safeword to start building
          </p>
        </div>
      )}

      {!isLoading && members.length > 0 && (
        <>
          <div className="animate-reveal-up stagger-1">
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="w-full max-w-2xl mx-auto"
              style={{ filter: 'drop-shadow(0 2px 8px hsl(var(--foreground) / 0.04))' }}
            >
              <defs>
                <filter id="center-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="8" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="node-shadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="hsl(24 20% 16%)" floodOpacity="0.08" />
                </filter>
              </defs>

              {/* Branch lines with relationship-based styling */}
              {memberPositions.map((pos, i) => {
                const m = members[i];
                const rel = getRelConfig(m.relationship || 'other');
                const midX = (cx + pos.x) / 2;
                const midY = (cy + pos.y) / 2;
                const dx = pos.x - cx;
                const dy = pos.y - cy;
                const len = Math.sqrt(dx * dx + dy * dy);
                const perpX = -dy / len * 18;
                const perpY = dx / len * 18;
                const ctrlX = midX + perpX;
                const ctrlY = midY + perpY;

                return (
                  <g key={`line-${i}`}>
                    <path
                      d={`M ${cx} ${cy} Q ${ctrlX} ${ctrlY} ${pos.x} ${pos.y}`}
                      fill="none"
                      stroke={rel.color}
                      strokeWidth="2.5"
                      strokeDasharray={rel.dash || undefined}
                      opacity="0.45"
                      className="animate-fade-in"
                      style={{ animationDelay: `${200 + i * 80}ms` }}
                    />
                    {/* Relationship label on the branch */}
                    <text
                      x={ctrlX}
                      y={ctrlY - 8}
                      textAnchor="middle"
                      fill={rel.color}
                      fontSize="9"
                      fontWeight="600"
                      fontFamily="var(--font-body)"
                      opacity="0.8"
                    >
                      {rel.label}
                    </text>
                    <circle cx={ctrlX} cy={ctrlY} r="3" fill={rel.color} opacity="0.4" />
                  </g>
                );
              })}

              {/* Member nodes */}
              {memberPositions.map((pos, i) => {
                const m = members[i];
                const color = MEMBER_COLORS[i % MEMBER_COLORS.length];
                const initials = getInitials(m.connected_name || 'U');

                return (
                  <g
                    key={m.id}
                    filter="url(#node-shadow)"
                    className="animate-scale-in cursor-pointer"
                    style={{ animationDelay: `${300 + i * 100}ms`, transformOrigin: `${pos.x}px ${pos.y}px` }}
                  >
                    <circle cx={pos.x} cy={pos.y} r={memberR + 4} fill="none" stroke={color.bg} strokeWidth="2" opacity="0.25" />
                    <circle cx={pos.x} cy={pos.y} r={memberR} fill={color.light} stroke={color.bg} strokeWidth="2.5" />
                    <text x={pos.x} y={pos.y - 2} textAnchor="middle" dominantBaseline="central" fill={color.bg} fontSize="14" fontWeight="700" fontFamily="var(--font-display)" letterSpacing="1">
                      {initials}
                    </text>
                    <text x={pos.x} y={pos.y + memberR + 16} textAnchor="middle" fill="hsl(24 20% 16%)" fontSize="12" fontWeight="600" fontFamily="var(--font-display)">
                      {m.connected_name?.length > 14 ? m.connected_name.slice(0, 13) + '…' : m.connected_name}
                    </text>
                    <text x={pos.x} y={pos.y + memberR + 30} textAnchor="middle" fill="hsl(24 10% 46%)" fontSize="10" fontFamily="var(--font-body)">
                      @{m.connected_username}
                    </text>
                  </g>
                );
              })}

              {/* Center node (You) */}
              <g filter="url(#center-glow)" className="animate-scale-in">
                <circle cx={cx} cy={cy} r={centerR + 8} fill="none" stroke="hsl(18 62% 45%)" strokeWidth="2" opacity="0.15">
                  <animate attributeName="r" values={`${centerR + 6};${centerR + 14};${centerR + 6}`} dur="3s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.15;0.05;0.15" dur="3s" repeatCount="indefinite" />
                </circle>
                <circle cx={cx} cy={cy} r={centerR + 4} fill="none" stroke="hsl(18 62% 45%)" strokeWidth="2.5" opacity="0.3" />
                <circle cx={cx} cy={cy} r={centerR} fill="hsl(18 62% 45%)" />
                <circle cx={cx} cy={cy - 6} r={centerR - 8} fill="hsl(18 62% 55%)" opacity="0.3" />
                <text x={cx} y={cy - 3} textAnchor="middle" dominantBaseline="central" fill="hsl(36 33% 97%)" fontSize="18" fontWeight="700" fontFamily="var(--font-display)" letterSpacing="1.5">
                  {getInitials(myName)}
                </text>
                <text x={cx} y={cy + centerR + 18} textAnchor="middle" fill="hsl(24 20% 16%)" fontSize="14" fontWeight="700" fontFamily="var(--font-display)">
                  {myName}
                </text>
                {myUsername && (
                  <text x={cx} y={cy + centerR + 33} textAnchor="middle" fill="hsl(24 10% 46%)" fontSize="11" fontFamily="var(--font-body)">
                    @{myUsername}
                  </text>
                )}
              </g>
            </svg>
          </div>

          {/* Relationship Legend */}
          {usedRelTypes.length > 0 && (
            <div className="animate-reveal-up stagger-1 bg-card border border-border rounded-xl p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Relationship Key</h4>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {usedRelTypes.map((type) => {
                  const rel = getRelConfig(type);
                  return (
                    <div key={type} className="flex items-center gap-2">
                      <svg width="28" height="8" className="flex-shrink-0">
                        <line
                          x1="0" y1="4" x2="28" y2="4"
                          stroke={rel.color}
                          strokeWidth="2.5"
                          strokeDasharray={rel.dash || undefined}
                        />
                      </svg>
                      <span className="text-xs font-medium text-foreground">{rel.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Connection List */}
      {!isLoading && members.length > 0 && (
        <div className="animate-reveal-up stagger-2 space-y-3">
          <h3 className="font-display text-lg font-semibold text-foreground">
            Connected Members ({members.length})
          </h3>
          {members.map((c: any, i: number) => {
            const color = MEMBER_COLORS[i % MEMBER_COLORS.length];
            const rel = getRelConfig(c.relationship || 'other');
            return (
              <div
                key={c.id}
                className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:shadow-md transition-all duration-300 active:scale-[0.98]"
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold font-display"
                  style={{ backgroundColor: color.light, color: color.bg, border: `2px solid ${color.bg}` }}
                >
                  {getInitials(c.connected_name || 'U')}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{c.connected_name}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground font-mono">@{c.connected_username}</p>
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: rel.color + '18', color: rel.color }}
                    >
                      {rel.label}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive flex-shrink-0"
                  onClick={() => disconnect.mutate(c.id)}
                >
                  <Unlink className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
