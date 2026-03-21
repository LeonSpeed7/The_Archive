import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Plus, User, Unlink, Loader2, Heart, TreePine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useConnections } from '@/components/FamilyConnections';

// Warm palette that fits the heritage aesthetic
const MEMBER_COLORS = [
  { bg: 'hsl(18 62% 45%)', light: 'hsl(18 62% 92%)', glow: 'hsl(18 62% 45% / 0.2)' },
  { bg: 'hsl(152 28% 42%)', light: 'hsl(152 28% 92%)', glow: 'hsl(152 28% 42% / 0.2)' },
  { bg: 'hsl(25 80% 55%)', light: 'hsl(25 80% 92%)', glow: 'hsl(25 80% 55% / 0.2)' },
  { bg: 'hsl(200 50% 45%)', light: 'hsl(200 50% 92%)', glow: 'hsl(200 50% 45% / 0.2)' },
  { bg: 'hsl(340 45% 50%)', light: 'hsl(340 45% 92%)', glow: 'hsl(340 45% 50% / 0.2)' },
  { bg: 'hsl(45 70% 48%)', light: 'hsl(45 70% 92%)', glow: 'hsl(45 70% 48% / 0.2)' },
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
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Family member added!');
      setSafeword('');
      setUsername('');
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

  // Layout: center node at (cx, cy), members arranged in a circle around it
  const svgW = 700;
  const svgH = Math.max(420, members.length > 6 ? 520 : 420);
  const cx = svgW / 2;
  const cy = svgH / 2;
  const centerR = 48;
  const memberR = 36;
  const orbitRadius = Math.min(svgW, svgH) * 0.34;

  const memberPositions = members.map((_, i) => {
    const angle = (2 * Math.PI * i) / members.length - Math.PI / 2;
    return {
      x: cx + orbitRadius * Math.cos(angle),
      y: cy + orbitRadius * Math.sin(angle),
    };
  });

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
            Enter their username and safeword to connect. Once connected, you'll both see each other's archived objects in search results.
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
              onKeyDown={(e) => e.key === 'Enter' && safeword.trim() && username.trim() && connect.mutate()}
            />
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
        <div className="animate-reveal-up stagger-1">
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="w-full max-w-2xl mx-auto"
            style={{ filter: 'drop-shadow(0 2px 8px hsl(var(--foreground) / 0.04))' }}
          >
            <defs>
              {/* Glow filter for center */}
              <filter id="center-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {/* Subtle shadow for member nodes */}
              <filter id="node-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="hsl(24 20% 16%)" floodOpacity="0.08" />
              </filter>
            </defs>

            {/* Organic branch lines from center to each member */}
            {memberPositions.map((pos, i) => {
              const color = MEMBER_COLORS[i % MEMBER_COLORS.length];
              // Curved path using a quadratic bezier
              const midX = (cx + pos.x) / 2;
              const midY = (cy + pos.y) / 2;
              // Add slight perpendicular offset for organic feel
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
                    stroke={color.bg}
                    strokeWidth="2"
                    strokeDasharray="6 4"
                    opacity="0.35"
                    className="animate-fade-in"
                    style={{ animationDelay: `${200 + i * 80}ms` }}
                  />
                  {/* Small heart on the midpoint */}
                  <circle
                    cx={ctrlX}
                    cy={ctrlY}
                    r="3"
                    fill={color.bg}
                    opacity="0.5"
                  />
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
                  {/* Outer ring */}
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={memberR + 4}
                    fill="none"
                    stroke={color.bg}
                    strokeWidth="2"
                    opacity="0.25"
                  />
                  {/* Main circle */}
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={memberR}
                    fill={color.light}
                    stroke={color.bg}
                    strokeWidth="2.5"
                  />
                  {/* Initials */}
                  <text
                    x={pos.x}
                    y={pos.y - 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={color.bg}
                    fontSize="14"
                    fontWeight="700"
                    fontFamily="var(--font-display)"
                    letterSpacing="1"
                  >
                    {initials}
                  </text>
                  {/* Name below */}
                  <text
                    x={pos.x}
                    y={pos.y + memberR + 16}
                    textAnchor="middle"
                    fill="hsl(24 20% 16%)"
                    fontSize="12"
                    fontWeight="600"
                    fontFamily="var(--font-display)"
                  >
                    {m.connected_name?.length > 14 ? m.connected_name.slice(0, 13) + '…' : m.connected_name}
                  </text>
                  {/* Username below name */}
                  <text
                    x={pos.x}
                    y={pos.y + memberR + 30}
                    textAnchor="middle"
                    fill="hsl(24 10% 46%)"
                    fontSize="10"
                    fontFamily="var(--font-body)"
                  >
                    @{m.connected_username}
                  </text>
                </g>
              );
            })}

            {/* Center node (You) — rendered last to be on top */}
            <g filter="url(#center-glow)" className="animate-scale-in">
              {/* Pulsing ring */}
              <circle
                cx={cx}
                cy={cy}
                r={centerR + 8}
                fill="none"
                stroke="hsl(18 62% 45%)"
                strokeWidth="2"
                opacity="0.15"
              >
                <animate attributeName="r" values={`${centerR + 6};${centerR + 14};${centerR + 6}`} dur="3s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.15;0.05;0.15" dur="3s" repeatCount="indefinite" />
              </circle>
              {/* Outer ring */}
              <circle
                cx={cx}
                cy={cy}
                r={centerR + 4}
                fill="none"
                stroke="hsl(18 62% 45%)"
                strokeWidth="2.5"
                opacity="0.3"
              />
              {/* Main circle */}
              <circle
                cx={cx}
                cy={cy}
                r={centerR}
                fill="hsl(18 62% 45%)"
              />
              {/* Inner highlight */}
              <circle
                cx={cx}
                cy={cy - 6}
                r={centerR - 8}
                fill="hsl(18 62% 55%)"
                opacity="0.3"
              />
              {/* Initials */}
              <text
                x={cx}
                y={cy - 3}
                textAnchor="middle"
                dominantBaseline="central"
                fill="hsl(36 33% 97%)"
                fontSize="18"
                fontWeight="700"
                fontFamily="var(--font-display)"
                letterSpacing="1.5"
              >
                {getInitials(myName)}
              </text>
              {/* Name below */}
              <text
                x={cx}
                y={cy + centerR + 18}
                textAnchor="middle"
                fill="hsl(24 20% 16%)"
                fontSize="14"
                fontWeight="700"
                fontFamily="var(--font-display)"
              >
                {myName}
              </text>
              {myUsername && (
                <text
                  x={cx}
                  y={cy + centerR + 33}
                  textAnchor="middle"
                  fill="hsl(24 10% 46%)"
                  fontSize="11"
                  fontFamily="var(--font-body)"
                >
                  @{myUsername}
                </text>
              )}
            </g>
          </svg>
        </div>
      )}

      {/* Connection List */}
      {!isLoading && members.length > 0 && (
        <div className="animate-reveal-up stagger-2 space-y-3">
          <h3 className="font-display text-lg font-semibold text-foreground">
            Connected Members ({members.length})
          </h3>
          {members.map((c: any, i: number) => {
            const color = MEMBER_COLORS[i % MEMBER_COLORS.length];
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
                  <p className="text-xs text-muted-foreground font-mono">@{c.connected_username}</p>
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
