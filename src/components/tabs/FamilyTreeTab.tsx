import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Plus, Unlink, Loader2, TreePine, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useConnections } from '@/components/FamilyConnections';

/* ─── Constants ─── */

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

const GENERATION_MAP: Record<string, number> = {
  grandparent: -2, parent: -1, uncle_aunt: -1,
  sibling: 0, spouse: 0, cousin: 0, other: 0,
  child: 1, nephew_niece: 1, grandchild: 2,
};

const GENERATION_LABELS: Record<number, string> = {
  [-2]: 'Grandparents',
  [-1]: 'Parents & Elders',
  [0]: 'Your Generation',
  [1]: 'Children & Young',
  [2]: 'Grandchildren',
};

const GENDER_CONFIG: Record<string, { shape: 'circle' | 'rect' | 'diamond'; fill: string; stroke: string; label: string }> = {
  male:             { shape: 'rect',    fill: 'hsl(210 45% 94%)', stroke: 'hsl(210 45% 42%)', label: 'Male (Square)' },
  female:           { shape: 'circle',  fill: 'hsl(340 45% 94%)', stroke: 'hsl(340 45% 48%)', label: 'Female (Circle)' },
  other:            { shape: 'diamond', fill: 'hsl(45 60% 94%)',  stroke: 'hsl(45 60% 45%)',  label: 'Other (Diamond)' },
  prefer_not_to_say:{ shape: 'rect',    fill: 'hsl(0 0% 94%)',    stroke: 'hsl(0 0% 50%)',    label: 'Unspecified' },
};

const NODE_W = 120;
const NODE_H = 56;
const NODE_R = 28; // circle/diamond radius
const LEVEL_GAP = 120;
const SIBLING_GAP = 160;
const SPOUSE_GAP = 140;

/* ─── Helpers ─── */

function getRelConfig(v: string) {
  return RELATIONSHIP_TYPES.find(r => r.value === v) || RELATIONSHIP_TYPES[RELATIONSHIP_TYPES.length - 1];
}
function getGender(g: string) { return GENDER_CONFIG[g] || GENDER_CONFIG.prefer_not_to_say; }
function initials(n: string) { return n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }

/* ─── Types ─── */

interface TNode {
  id: string; name: string; username: string; gender: string;
  relationship: string; generation: number; isYou?: boolean;
  userId?: string;
}

interface NPos { x: number; y: number; node: TNode; }

/* ─── Layout ─── */

function computeLayout(members: any[], myName: string, myUsername: string, myGender: string) {
  const nodes: TNode[] = [
    { id: 'you', name: myName, username: myUsername, gender: myGender, relationship: 'self', generation: 0, isYou: true },
    ...members.map((m: any) => ({
      id: m.id,
      name: m.connected_name,
      username: m.connected_username,
      gender: m.connected_gender || 'prefer_not_to_say',
      relationship: m.relationship || 'other',
      generation: GENERATION_MAP[m.relationship] ?? 0,
      userId: m.connected_user_id,
    })),
  ];

  const genGroups = new Map<number, TNode[]>();
  for (const n of nodes) {
    if (!genGroups.has(n.generation)) genGroups.set(n.generation, []);
    genGroups.get(n.generation)!.push(n);
  }

  const sortedGens = [...genGroups.keys()].sort((a, b) => a - b);
  const maxInRow = Math.max(...[...genGroups.values()].map(g => g.length));
  const canvasW = Math.max(700, maxInRow * SIBLING_GAP + 200);
  const centerX = canvasW / 2;
  const padding = 80;

  const positions: NPos[] = [];
  for (const gen of sortedGens) {
    const group = genGroups.get(gen)!;
    if (gen === 0) group.sort((a, b) => (a.isYou ? -1 : 0) - (b.isYou ? -1 : 0));
    const y = padding + sortedGens.indexOf(gen) * LEVEL_GAP;
    
    // Position spouses closer together in generation 0
    if (gen === 0) {
      const you = group.find(n => n.isYou);
      const spouses = group.filter(n => n.relationship === 'spouse');
      const others = group.filter(n => !n.isYou && n.relationship !== 'spouse');
      const arranged = you ? [you, ...spouses, ...others] : group;
      
      let x = centerX - ((arranged.length - 1) * SIBLING_GAP) / 2;
      arranged.forEach((node, i) => {
        // Spouses are closer to "You"
        const actualX = i === 0 ? x : (i <= spouses.length ? x + i * SPOUSE_GAP : x + spouses.length * SPOUSE_GAP + (i - spouses.length) * SIBLING_GAP);
        positions.push({ x: i === 0 ? centerX : actualX, y, node });
      });
    } else {
      const startX = centerX - ((group.length - 1) * SIBLING_GAP) / 2;
      group.forEach((node, i) => {
        positions.push({ x: startX + i * SIBLING_GAP, y, node });
      });
    }
  }

  const canvasH = padding * 2 + sortedGens.length * LEVEL_GAP;
  return { positions, canvasW, canvasH, sortedGens, genGroups };
}

/* ─── SVG Node Shape (Box/Circle/Diamond) ─── */

function NodeShape({ x, y, node }: { x: number; y: number; node: TNode }) {
  const gc = getGender(node.gender);
  const ini = initials(node.name);
  const truncName = node.name.length > 14 ? node.name.slice(0, 13) + '…' : node.name;
  const isYou = !!node.isYou;
  const strokeW = isYou ? 3 : 2;

  // Shape dimensions
  const w = isYou ? NODE_W + 16 : NODE_W;
  const h = isYou ? NODE_H + 8 : NODE_H;
  const r = isYou ? NODE_R + 4 : NODE_R;

  return (
    <g className="cursor-pointer" style={{ transition: 'opacity 0.3s' }}>
      {/* Glow for "You" */}
      {isYou && gc.shape === 'rect' && (
        <rect x={x - w / 2 - 4} y={y - h / 2 - 4} width={w + 8} height={h + 8} rx={14}
          fill="none" stroke={gc.stroke} strokeWidth={1} opacity={0.15}
        >
          <animate attributeName="opacity" values="0.15;0.05;0.15" dur="3s" repeatCount="indefinite" />
        </rect>
      )}
      {isYou && gc.shape === 'circle' && (
        <circle cx={x} cy={y} r={r + 6} fill="none" stroke={gc.stroke} strokeWidth={1} opacity={0.15}>
          <animate attributeName="opacity" values="0.15;0.05;0.15" dur="3s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Main shape */}
      {gc.shape === 'rect' && (
        <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={10}
          fill={gc.fill} stroke={gc.stroke} strokeWidth={strokeW}
          className="drop-shadow-sm"
        />
      )}
      {gc.shape === 'circle' && (
        <circle cx={x} cy={y} r={r} fill={gc.fill} stroke={gc.stroke} strokeWidth={strokeW}
          className="drop-shadow-sm"
        />
      )}
      {gc.shape === 'diamond' && (
        <polygon
          points={`${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`}
          fill={gc.fill} stroke={gc.stroke} strokeWidth={strokeW}
          className="drop-shadow-sm"
        />
      )}

      {/* Initials */}
      <text x={x} y={y - 4} textAnchor="middle" dominantBaseline="central"
        fill={gc.stroke} fontSize={isYou ? 15 : 13} fontWeight="700"
        fontFamily="var(--font-display)" letterSpacing="0.5"
      >
        {ini}
      </text>

      {/* Name inside shape */}
      <text x={x} y={y + 12} textAnchor="middle" dominantBaseline="central"
        fill={gc.stroke} fontSize="9" fontWeight="500"
        fontFamily="var(--font-body)" opacity={0.8}
      >
        {isYou ? 'You' : truncName}
      </text>

      {/* Username below */}
      {node.username && (
        <text x={x} y={y + (gc.shape === 'rect' ? h / 2 + 14 : r + 14)} textAnchor="middle"
          fill="hsl(var(--muted-foreground))" fontSize="9" fontFamily="var(--font-body)"
        >
          @{node.username}
        </text>
      )}
    </g>
  );
}

/* ─── Connection Lines ─── */

function ConnectionLine({ from, to, relationship }: { from: NPos; to: NPos; relationship: string }) {
  const rel = getRelConfig(relationship);
  const fromGc = getGender(from.node.gender);
  const toGc = getGender(to.node.gender);
  const dy = to.y - from.y;
  const dx = to.x - from.x;

  // Calculate exit/entry points based on shapes
  const getEdgeY = (pos: NPos, direction: 'top' | 'bottom') => {
    const gc = getGender(pos.node.gender);
    const isYou = pos.node.isYou;
    if (gc.shape === 'rect') {
      const h = isYou ? NODE_H + 8 : NODE_H;
      return direction === 'bottom' ? pos.y + h / 2 : pos.y - h / 2;
    }
    const r = isYou ? NODE_R + 4 : NODE_R;
    return direction === 'bottom' ? pos.y + r : pos.y - r;
  };

  // Same generation — horizontal connector
  if (Math.abs(dy) < 10) {
    const isSpouse = relationship === 'spouse';
    const fromEdgeX = from.x + (dx > 0 ? (fromGc.shape === 'rect' ? (from.node.isYou ? (NODE_W + 16) / 2 : NODE_W / 2) : (from.node.isYou ? NODE_R + 4 : NODE_R)) : -(fromGc.shape === 'rect' ? (from.node.isYou ? (NODE_W + 16) / 2 : NODE_W / 2) : (from.node.isYou ? NODE_R + 4 : NODE_R)));
    const toEdgeX = to.x + (dx > 0 ? -(toGc.shape === 'rect' ? NODE_W / 2 : NODE_R) : (toGc.shape === 'rect' ? NODE_W / 2 : NODE_R));

    if (isSpouse) {
      // Double line for marriage
      return (
        <g>
          <line x1={fromEdgeX} y1={from.y - 3} x2={toEdgeX} y2={to.y - 3}
            stroke={rel.color} strokeWidth={1.5} opacity={0.6} />
          <line x1={fromEdgeX} y1={from.y + 3} x2={toEdgeX} y2={to.y + 3}
            stroke={rel.color} strokeWidth={1.5} opacity={0.6} />
        </g>
      );
    }

    // Curved horizontal for siblings/cousins
    const midX = (fromEdgeX + toEdgeX) / 2;
    const curveY = from.y - 30;
    return (
      <g>
        <path
          d={`M ${fromEdgeX} ${from.y} C ${fromEdgeX} ${curveY}, ${toEdgeX} ${curveY}, ${toEdgeX} ${to.y}`}
          fill="none" stroke={rel.color} strokeWidth={1.5}
          strokeDasharray={rel.dash || undefined} opacity={0.5}
        />
        <text x={midX} y={curveY - 4} textAnchor="middle" fill={rel.color}
          fontSize="8" fontWeight="600" opacity="0.7" fontFamily="var(--font-body)">
          {rel.label}
        </text>
      </g>
    );
  }

  // Different generation — vertical tree connector with right angles
  const fromY = dy > 0 ? getEdgeY(from, 'bottom') : getEdgeY(from, 'top');
  const toY = dy > 0 ? getEdgeY(to, 'top') : getEdgeY(to, 'bottom');
  const midY = (fromY + toY) / 2;

  return (
    <g>
      {/* Vertical from parent */}
      <line x1={from.x} y1={fromY} x2={from.x} y2={midY}
        stroke={rel.color} strokeWidth={1.5} strokeDasharray={rel.dash || undefined} opacity={0.5} />
      {/* Horizontal bridge */}
      <line x1={from.x} y1={midY} x2={to.x} y2={midY}
        stroke={rel.color} strokeWidth={1.5} strokeDasharray={rel.dash || undefined} opacity={0.5} />
      {/* Vertical to child */}
      <line x1={to.x} y1={midY} x2={to.x} y2={toY}
        stroke={rel.color} strokeWidth={1.5} strokeDasharray={rel.dash || undefined} opacity={0.5} />
      {/* Relationship label */}
      <text x={(from.x + to.x) / 2} y={midY - 6} textAnchor="middle" fill={rel.color}
        fontSize="8" fontWeight="600" opacity="0.7" fontFamily="var(--font-body)">
        {rel.label}
      </text>
    </g>
  );
}

/* ─── Interactive Tree Canvas ─── */

function InteractiveTree({ members, myName, myUsername, myGender }: {
  members: any[]; myName: string; myUsername: string; myGender: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, panX: 0, panY: 0 });
  const [collapsedGens, setCollapsedGens] = useState<Set<number>>(new Set());

  const { positions, canvasW, canvasH, sortedGens } = computeLayout(members, myName, myUsername, myGender);

  useEffect(() => {
    if (!containerRef.current || positions.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = (rect.width - 24) / canvasW;
    const scaleY = (rect.height - 24) / canvasH;
    const s = Math.min(scaleX, scaleY, 1.2);
    setPan({ x: (rect.width - canvasW * s) / 2, y: (rect.height - canvasH * s) / 2 });
    setZoom(s);
  }, [canvasW, canvasH, positions.length]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [pan]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setPan({
      x: dragRef.current.panX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.panY + (e.clientY - dragRef.current.startY),
    });
  }, [dragging]);

  const handlePointerUp = useCallback(() => setDragging(false), []);

  const toggleGen = (gen: number) => {
    if (gen === 0) return;
    setCollapsedGens(prev => {
      const next = new Set(prev);
      next.has(gen) ? next.delete(gen) : next.add(gen);
      return next;
    });
  };

  const youPos = positions.find(p => p.node.isYou)!;
  const visiblePositions = positions.filter(p => !collapsedGens.has(p.node.generation));

  const usedRels = [...new Set(members.map((m: any) => m.relationship || 'other'))];
  const usedGenders = [...new Set([myGender, ...members.map((m: any) => m.connected_gender || 'prefer_not_to_say')])];

  return (
    <div className="space-y-4">
      {/* Tree Canvas */}
      <div
        ref={containerRef}
        className="relative w-full rounded-xl overflow-hidden select-none"
        style={{
          height: 'clamp(400px, 58vh, 640px)',
          touchAction: 'none',
          background: 'linear-gradient(180deg, hsl(var(--teal-50)) 0%, hsl(var(--background)) 100%)',
          border: '1px solid hsl(var(--teal-200))',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Subtle tree trunk decoration */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 100%, hsl(var(--teal-600)) 0%, transparent 50%)`,
          }}
        />

        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            transition: dragging ? 'none' : 'transform 0.18s ease-out',
          }}
        >
          <svg width={canvasW} height={canvasH} viewBox={`0 0 ${canvasW} ${canvasH}`}>
            <defs>
              <filter id="node-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="hsl(var(--teal-900))" floodOpacity="0.08" />
              </filter>
            </defs>

            {/* Generation labels */}
            {sortedGens.map((gen, gi) => {
              const y = 80 + gi * LEVEL_GAP;
              const isCollapsed = collapsedGens.has(gen);
              return (
                <g key={`gen-${gen}`} opacity={isCollapsed ? 0.3 : 1} style={{ transition: 'opacity 0.3s' }}>
                  <text x={14} y={y - 36} fill="hsl(var(--teal-500))" fontSize="10" fontWeight="700"
                    fontFamily="var(--font-display)" letterSpacing="1.5" opacity="0.5"
                    style={{ textTransform: 'uppercase' } as any}
                  >
                    {GENERATION_LABELS[gen] || `Gen ${gen}`}
                    {isCollapsed ? ' (collapsed)' : ''}
                  </text>
                  {/* Subtle horizontal guide line */}
                  <line x1={14} y1={y - 30} x2={canvasW - 14} y2={y - 30}
                    stroke="hsl(var(--teal-200))" strokeWidth={0.5} opacity={0.4}
                    strokeDasharray="4 6"
                  />
                </g>
              );
            })}

            {/* Connection lines (tree branches) */}
            {visiblePositions.filter(p => !p.node.isYou).map(p => (
              <ConnectionLine
                key={`line-${p.node.id}`}
                from={youPos}
                to={p}
                relationship={p.node.relationship}
              />
            ))}

            {/* Nodes */}
            {visiblePositions.map((p, i) => (
              <g key={p.node.id} filter="url(#node-shadow)"
                className="animate-scale-in"
                style={{ animationDelay: `${0.1 + i * 0.05}s`, transformOrigin: `${p.x}px ${p.y}px` }}
              >
                <NodeShape x={p.x} y={p.y} node={p.node} />
              </g>
            ))}
          </svg>
        </div>

        {/* Collapse toggles */}
        {sortedGens.length > 1 && (
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-1 z-10">
            {sortedGens.filter(g => g !== 0).map(gen => (
              <button
                key={gen}
                onClick={() => toggleGen(gen)}
                className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border transition-colors active:scale-95"
                style={{
                  backgroundColor: 'hsl(var(--background) / 0.85)',
                  borderColor: 'hsl(var(--teal-200))',
                  color: 'hsl(var(--teal-700))',
                  backdropFilter: 'blur(4px)',
                }}
              >
                {collapsedGens.has(gen) ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {GENERATION_LABELS[gen] || `Gen ${gen}`}
              </button>
            ))}
          </div>
        )}

        <p className="absolute top-3 left-3 text-[10px] pointer-events-none select-none"
          style={{ color: 'hsl(var(--teal-400))' }}>
          Drag to pan
        </p>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {usedRels.length > 0 && (
          <div className="rounded-xl p-3" style={{ backgroundColor: 'hsl(var(--teal-50))', border: '1px solid hsl(var(--teal-200))' }}>
            <h4 className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'hsl(var(--teal-500))' }}>Relationships</h4>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {usedRels.map(type => {
                const rel = getRelConfig(type);
                return (
                  <div key={type} className="flex items-center gap-1.5">
                    <svg width="22" height="6" className="flex-shrink-0">
                      <line x1="0" y1="3" x2="22" y2="3" stroke={rel.color} strokeWidth="2"
                        strokeDasharray={rel.dash || undefined}
                      />
                    </svg>
                    <span className="text-[10px] font-medium text-foreground">{rel.label}</span>
                  </div>
                );
              })}
              {usedRels.includes('spouse') && (
                <div className="flex items-center gap-1.5">
                  <svg width="22" height="10" className="flex-shrink-0">
                    <line x1="0" y1="2" x2="22" y2="2" stroke="hsl(340 45% 50%)" strokeWidth="1.5" />
                    <line x1="0" y1="8" x2="22" y2="8" stroke="hsl(340 45% 50%)" strokeWidth="1.5" />
                  </svg>
                  <span className="text-[10px] font-medium text-foreground">Marriage</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="rounded-xl p-3" style={{ backgroundColor: 'hsl(var(--teal-50))', border: '1px solid hsl(var(--teal-200))' }}>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'hsl(var(--teal-500))' }}>Shapes</h4>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {Object.entries(GENDER_CONFIG).filter(([k]) => usedGenders.includes(k)).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5">
                <svg width="18" height="18" viewBox="0 0 18 18" className="flex-shrink-0">
                  {cfg.shape === 'circle' ? (
                    <circle cx="9" cy="9" r="7" fill={cfg.fill} stroke={cfg.stroke} strokeWidth="1.5" />
                  ) : cfg.shape === 'diamond' ? (
                    <polygon points="9,2 16,9 9,16 2,9" fill={cfg.fill} stroke={cfg.stroke} strokeWidth="1.5" />
                  ) : (
                    <rect x="1" y="3" width="16" height="12" rx="3" fill={cfg.fill} stroke={cfg.stroke} strokeWidth="1.5" />
                  )}
                </svg>
                <span className="text-[10px] font-medium text-foreground">{cfg.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */

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
        .select('full_name, username, display_name, gender')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const members = connections as any[];

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
      setSafeword(''); setUsername(''); setRelationship('parent');
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

  const myName = myProfile?.full_name || myProfile?.display_name || 'You';
  const myUsername = myProfile?.username || '';
  const myGender = (myProfile as any)?.gender || 'prefer_not_to_say';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="animate-fade-in flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-foreground">Family Tree</h2>
          <p className="text-muted-foreground mt-1 text-sm">Connect with family · drag to pan</p>
        </div>
        <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Add Member
        </Button>
      </div>

      {showAddForm && (
        <div className="animate-fade-in rounded-xl p-6 space-y-4"
          style={{ backgroundColor: 'hsl(var(--teal-50))', border: '1px solid hsl(var(--teal-200))' }}>
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
                      ? 'text-white shadow-sm'
                      : 'bg-background text-muted-foreground hover:text-foreground'
                  }`}
                  style={relationship === rel.value
                    ? { backgroundColor: 'hsl(var(--teal-500))', borderColor: 'hsl(var(--teal-500))' }
                    : { borderColor: 'hsl(var(--teal-200))' }
                  }
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
              style={{ backgroundColor: 'hsl(var(--teal-500))' }}
              className="text-white"
            >
              {connect.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}
            </Button>
            <Button variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {isLoading && <p className="text-muted-foreground text-center py-8">Loading…</p>}

      {!isLoading && members.length === 0 && !showAddForm && (
        <div className="text-center py-16 animate-fade-in">
          <TreePine className="w-12 h-12 mx-auto mb-4" style={{ color: 'hsl(var(--teal-300))' }} />
          <p className="text-muted-foreground font-medium">Your family tree is empty</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Click "Add Member" and enter a family member's username & safeword to start building
          </p>
        </div>
      )}

      {!isLoading && members.length > 0 && (
        <InteractiveTree
          members={members}
          myName={myName}
          myUsername={myUsername}
          myGender={myGender}
        />
      )}

      {/* Connection List */}
      {!isLoading && members.length > 0 && (
        <div className="animate-fade-in space-y-3">
          <h3 className="font-display text-lg font-semibold text-foreground">
            Connected Members ({members.length})
          </h3>
          {members.map((c: any) => {
            const rel = getRelConfig(c.relationship || 'other');
            const gc = getGender(c.connected_gender || 'prefer_not_to_say');
            return (
              <div
                key={c.id}
                className="rounded-xl p-4 flex items-center gap-4 transition-all duration-300 active:scale-[0.98]"
                style={{
                  backgroundColor: 'hsl(var(--teal-50))',
                  border: '1px solid hsl(var(--teal-200))',
                }}
              >
                <svg width="36" height="36" viewBox="0 0 36 36" className="flex-shrink-0">
                  {gc.shape === 'circle' ? (
                    <circle cx="18" cy="18" r="15" fill={gc.fill} stroke={gc.stroke} strokeWidth="2" />
                  ) : gc.shape === 'diamond' ? (
                    <polygon points="18,3 33,18 18,33 3,18" fill={gc.fill} stroke={gc.stroke} strokeWidth="2" />
                  ) : (
                    <rect x="2" y="6" width="32" height="24" rx="6" fill={gc.fill} stroke={gc.stroke} strokeWidth="2" />
                  )}
                  <text x="18" y="19" textAnchor="middle" dominantBaseline="central" fill={gc.stroke} fontSize="12" fontWeight="700" fontFamily="var(--font-display)">
                    {initials(c.connected_name || 'U')}
                  </text>
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{c.connected_name}</p>
                  <div className="flex items-center gap-2 flex-wrap">
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
