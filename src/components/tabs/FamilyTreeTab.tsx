import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Plus, Unlink, Loader2, TreePine, ZoomIn, ZoomOut, Maximize2, ChevronDown, ChevronRight, Package } from 'lucide-react';
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
  male:             { shape: 'rect',    fill: 'hsl(210 45% 92%)', stroke: 'hsl(210 45% 50%)', label: 'Male (Rectangle)' },
  female:           { shape: 'circle',  fill: 'hsl(340 45% 92%)', stroke: 'hsl(340 45% 55%)', label: 'Female (Circle)' },
  other:            { shape: 'diamond', fill: 'hsl(45 60% 92%)',  stroke: 'hsl(45 60% 50%)',  label: 'Other (Diamond)' },
  prefer_not_to_say:{ shape: 'rect',    fill: 'hsl(0 0% 92%)',    stroke: 'hsl(0 0% 55%)',    label: 'Unspecified' },
};

const NODE_SPACE_X = 170;
const ROW_HEIGHT = 155;
const NODE_R = 26;
const YOU_R = 34;

/* ─── Helpers ─── */

function getRelConfig(v: string) {
  return RELATIONSHIP_TYPES.find(r => r.value === v) || RELATIONSHIP_TYPES[RELATIONSHIP_TYPES.length - 1];
}
function getGender(g: string) { return GENDER_CONFIG[g] || GENDER_CONFIG.prefer_not_to_say; }
function initials(n: string) { return n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }

/* ─── Types ─── */

interface TNode {
  id: string; name: string; username: string; gender: string;
  relationship: string; generation: number; hasObjects?: boolean; isYou?: boolean;
  userId?: string;
}

interface NPos { x: number; y: number; node: TNode; }

/* ─── Layout ─── */

function computeLayout(members: any[], myName: string, myUsername: string, myGender: string, objectCounts: Record<string, number>) {
  const nodes: TNode[] = [
    { id: 'you', name: myName, username: myUsername, gender: myGender, relationship: 'self', generation: 0, isYou: true },
    ...members.map((m: any) => ({
      id: m.id,
      name: m.connected_name,
      username: m.connected_username,
      gender: m.connected_gender || 'prefer_not_to_say',
      relationship: m.relationship || 'other',
      generation: GENERATION_MAP[m.relationship] ?? 0,
      hasObjects: (objectCounts[m.connected_user_id] || 0) > 0,
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
  const canvasW = Math.max(700, maxInRow * NODE_SPACE_X + 200);
  const centerX = canvasW / 2;
  const padding = 80;

  const positions: NPos[] = [];
  for (const gen of sortedGens) {
    const group = genGroups.get(gen)!;
    // Sort so "You" is centered in gen 0
    if (gen === 0) group.sort((a, b) => (a.isYou ? -1 : 0) - (b.isYou ? -1 : 0));
    const y = padding + (sortedGens.indexOf(gen)) * ROW_HEIGHT;
    const startX = centerX - (group.length - 1) * NODE_SPACE_X / 2;
    group.forEach((node, i) => {
      positions.push({ x: startX + i * NODE_SPACE_X, y, node });
    });
  }

  const canvasH = padding * 2 + sortedGens.length * ROW_HEIGHT;
  return { positions, canvasW, canvasH, sortedGens, genGroups };
}

/* ─── SVG Node Renderer ─── */

function NodeShape({ x, y, node, onClick }: { x: number; y: number; node: TNode; onClick?: () => void }) {
  const gc = getGender(node.gender);
  const r = node.isYou ? YOU_R : NODE_R;
  const sw = node.isYou ? 3 : 2;
  const ini = initials(node.name);
  const truncName = node.name.length > 16 ? node.name.slice(0, 15) + '…' : node.name;

  return (
    <g className="cursor-pointer" onClick={onClick} style={{ transition: 'opacity 0.3s' }}>
      {/* Shape */}
      {gc.shape === 'circle' ? (
        <circle cx={x} cy={y} r={r} fill={gc.fill} stroke={gc.stroke} strokeWidth={sw} />
      ) : gc.shape === 'diamond' ? (
        <polygon
          points={`${x},${y - r} ${x + r * 0.9},${y} ${x},${y + r} ${x - r * 0.9},${y}`}
          fill={gc.fill} stroke={gc.stroke} strokeWidth={sw}
        />
      ) : (
        <rect x={x - r * 1.3} y={y - r * 0.85} width={r * 2.6} height={r * 1.7} rx={8}
          fill={gc.fill} stroke={gc.stroke} strokeWidth={sw}
        />
      )}

      {/* Pulse ring for "You" */}
      {node.isYou && (
        <circle cx={x} cy={y} r={r + 8} fill="none" stroke={gc.stroke} strokeWidth={1.5} opacity={0.2}>
          <animate attributeName="r" values={`${r + 6};${r + 14};${r + 6}`} dur="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.2;0.06;0.2" dur="3s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Initials */}
      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="central"
        fill={gc.stroke} fontSize={node.isYou ? 16 : 13} fontWeight="700"
        fontFamily="var(--font-display)" letterSpacing="1"
      >
        {ini}
      </text>

      {/* Name below */}
      <text x={x} y={y + r + 16} textAnchor="middle" fill="hsl(var(--foreground))"
        fontSize="11" fontWeight="600" fontFamily="var(--font-display)"
      >
        {node.isYou ? 'You' : truncName}
      </text>

      {/* Username */}
      {node.username && (
        <text x={x} y={y + r + 29} textAnchor="middle" fill="hsl(var(--muted-foreground))"
          fontSize="9" fontFamily="var(--font-body)"
        >
          @{node.username}
        </text>
      )}

      {/* Objects badge */}
      {node.hasObjects && (
        <g>
          <circle cx={x + r * 0.9} cy={y - r * 0.7} r={8} fill="hsl(var(--primary))" />
          <text x={x + r * 0.9} y={y - r * 0.7 + 1} textAnchor="middle" dominantBaseline="central"
            fill="hsl(var(--primary-foreground))" fontSize="8" fontWeight="700"
          >
            ✦
          </text>
        </g>
      )}
    </g>
  );
}

/* ─── Interactive Tree Canvas ─── */

function InteractiveTree({ members, myName, myUsername, myGender, objectCounts }: {
  members: any[]; myName: string; myUsername: string; myGender: string; objectCounts: Record<string, number>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, panX: 0, panY: 0 });
  const [collapsedGens, setCollapsedGens] = useState<Set<number>>(new Set());

  const { positions, canvasW, canvasH, sortedGens } = computeLayout(members, myName, myUsername, myGender, objectCounts);

  // Fit to container on mount / data change
  useEffect(() => {
    if (!containerRef.current || positions.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = (rect.width - 24) / canvasW;
    const scaleY = (rect.height - 24) / canvasH;
    const s = Math.min(scaleX, scaleY, 1.2);
    setPan({ x: (rect.width - canvasW * s) / 2, y: (rect.height - canvasH * s) / 2 });
    setZoom(s);
  }, [canvasW, canvasH, positions.length]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setZoom(z => Math.max(0.25, Math.min(3, z * factor)));
  }, []);

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

  const resetView = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = (rect.width - 24) / canvasW;
    const scaleY = (rect.height - 24) / canvasH;
    const s = Math.min(scaleX, scaleY, 1.2);
    setPan({ x: (rect.width - canvasW * s) / 2, y: (rect.height - canvasH * s) / 2 });
    setZoom(s);
  }, [canvasW, canvasH]);

  const toggleGen = (gen: number) => {
    if (gen === 0) return; // Can't collapse your own generation
    setCollapsedGens(prev => {
      const next = new Set(prev);
      next.has(gen) ? next.delete(gen) : next.add(gen);
      return next;
    });
  };

  const youPos = positions.find(p => p.node.isYou)!;
  const visiblePositions = positions.filter(p => !collapsedGens.has(p.node.generation));

  // Unique relationship types used
  const usedRels = [...new Set(members.map((m: any) => m.relationship || 'other'))];
  const usedGenders = [...new Set([myGender, ...members.map((m: any) => m.connected_gender || 'prefer_not_to_say')])];

  return (
    <div className="space-y-4">
      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative w-full rounded-xl border border-border bg-card overflow-hidden select-none"
        style={{ height: 'clamp(380px, 55vh, 600px)', touchAction: 'none' }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            transition: dragging ? 'none' : 'transform 0.18s ease-out',
          }}
        >
          <svg width={canvasW} height={canvasH} viewBox={`0 0 ${canvasW} ${canvasH}`}>
            <defs>
              <filter id="tree-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.06" />
              </filter>
            </defs>

            {/* Generation row stripes */}
            {sortedGens.map((gen, gi) => {
              const y = 80 + gi * ROW_HEIGHT;
              const isCollapsed = collapsedGens.has(gen);
              return (
                <g key={`gen-${gen}`} opacity={isCollapsed ? 0.3 : 1} style={{ transition: 'opacity 0.3s' }}>
                  <rect x={0} y={y - 45} width={canvasW} height={ROW_HEIGHT - 10}
                    fill={gen === 0 ? 'hsl(var(--primary) / 0.04)' : gi % 2 === 0 ? 'hsl(var(--foreground) / 0.015)' : 'transparent'}
                    rx={6}
                  />
                  <text x={14} y={y - 28} fill="hsl(var(--muted-foreground))" fontSize="10" fontWeight="600"
                    fontFamily="var(--font-display)" letterSpacing="1.5" opacity="0.6" style={{ textTransform: 'uppercase' }}
                  >
                    {GENERATION_LABELS[gen] || `Gen ${gen}`}
                    {isCollapsed ? ' (collapsed)' : ''}
                  </text>
                </g>
              );
            })}

            {/* Connection lines */}
            {visiblePositions.filter(p => !p.node.isYou).map(p => {
              const rel = getRelConfig(p.node.relationship);
              const dy = p.y - youPos.y;
              const dx = p.x - youPos.x;

              let pathD: string;
              if (Math.abs(dy) < 10) {
                // Same generation: horizontal arc
                const cp = Math.min(Math.abs(dx) * 0.3, 50);
                pathD = `M ${youPos.x + (dx > 0 ? NODE_R + 8 : -NODE_R - 8)} ${youPos.y}
                         C ${youPos.x + dx * 0.3} ${youPos.y - cp}
                           ${p.x - dx * 0.3} ${p.y - cp}
                           ${p.x + (dx > 0 ? -NODE_R - 8 : NODE_R + 8)} ${p.y}`;
              } else {
                // Different generation: vertical bezier
                const midY = youPos.y + dy * 0.5;
                const exitY = dy > 0 ? youPos.y + (youPos.node.isYou ? YOU_R : NODE_R) + 4 : youPos.y - (youPos.node.isYou ? YOU_R : NODE_R) - 4;
                const entryY = dy > 0 ? p.y - NODE_R - 4 : p.y + NODE_R + 4;
                pathD = `M ${youPos.x} ${exitY}
                         C ${youPos.x} ${midY}
                           ${p.x} ${midY}
                           ${p.x} ${entryY}`;
              }

              return (
                <g key={`line-${p.node.id}`}>
                  <path d={pathD} fill="none" stroke={rel.color} strokeWidth={2}
                    strokeDasharray={rel.dash || undefined} opacity={0.5}
                    className="animate-fade-in" style={{ animationDelay: '0.2s' }}
                  />
                  {/* Relationship label at midpoint */}
                  {Math.abs(dy) > 10 && (
                    <text
                      x={(youPos.x + p.x) / 2 + (dx > 0 ? 8 : -8)}
                      y={youPos.y + dy * 0.5 - 6}
                      textAnchor="middle" fill={rel.color} fontSize="8" fontWeight="600"
                      fontFamily="var(--font-body)" opacity="0.7"
                    >
                      {rel.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {visiblePositions.map(p => (
              <g key={p.node.id} filter="url(#tree-shadow)" className="animate-scale-in"
                style={{ animationDelay: `${0.15 + positions.indexOf(p) * 0.06}s`, transformOrigin: `${p.x}px ${p.y}px` }}
              >
                <NodeShape x={p.x} y={p.y} node={p.node} />
              </g>
            ))}

            {/* Marriage/partnership connectors (horizontal double-line for spouses in same gen) */}
            {(() => {
              const gen0 = visiblePositions.filter(p => p.node.generation === 0);
              const youP = gen0.find(p => p.node.isYou);
              const spouses = gen0.filter(p => p.node.relationship === 'spouse');
              if (!youP || spouses.length === 0) return null;
              return spouses.map(sp => (
                <g key={`marriage-${sp.node.id}`}>
                  <line x1={youP.x + (sp.x > youP.x ? YOU_R + 6 : -YOU_R - 6)} y1={youP.y - 3}
                    x2={sp.x + (sp.x > youP.x ? -NODE_R - 6 : NODE_R + 6)} y2={sp.y - 3}
                    stroke="hsl(340 45% 50%)" strokeWidth={1.5} opacity={0.5}
                  />
                  <line x1={youP.x + (sp.x > youP.x ? YOU_R + 6 : -YOU_R - 6)} y1={youP.y + 3}
                    x2={sp.x + (sp.x > youP.x ? -NODE_R - 6 : NODE_R + 6)} y2={sp.y + 3}
                    stroke="hsl(340 45% 50%)" strokeWidth={1.5} opacity={0.5}
                  />
                </g>
              ));
            })()}
          </svg>
        </div>

        {/* Zoom controls */}
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
          <Button size="icon" variant="outline" className="w-8 h-8 bg-card/80 backdrop-blur-sm"
            onClick={() => setZoom(z => Math.min(3, z * 1.25))}>
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="w-8 h-8 bg-card/80 backdrop-blur-sm"
            onClick={() => setZoom(z => Math.max(0.25, z * 0.8))}>
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="w-8 h-8 bg-card/80 backdrop-blur-sm"
            onClick={resetView}>
            <Maximize2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Generation collapse toggles */}
        {sortedGens.length > 1 && (
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-1 z-10">
            {sortedGens.filter(g => g !== 0).map(gen => (
              <button
                key={gen}
                onClick={() => toggleGen(gen)}
                className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md bg-card/80 backdrop-blur-sm border border-border text-muted-foreground hover:text-foreground transition-colors active:scale-95"
              >
                {collapsedGens.has(gen) ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {GENERATION_LABELS[gen] || `Gen ${gen}`}
              </button>
            ))}
          </div>
        )}

        {/* Drag hint */}
        <p className="absolute top-3 left-3 text-[10px] text-muted-foreground/50 pointer-events-none select-none">
          Drag to pan · Scroll to zoom
        </p>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Relationship legend */}
        {usedRels.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-3">
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Relationships</h4>
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
              {/* Marriage indicator */}
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

        {/* Gender / shape legend */}
        <div className="bg-card border border-border rounded-xl p-3">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Shapes</h4>
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
            {/* Objects badge */}
            <div className="flex items-center gap-1.5">
              <svg width="18" height="18" viewBox="0 0 18 18" className="flex-shrink-0">
                <circle cx="9" cy="9" r="6" fill="hsl(var(--primary))" />
                <text x="9" y="10" textAnchor="middle" dominantBaseline="central" fill="hsl(var(--primary-foreground))" fontSize="7" fontWeight="700">✦</text>
              </svg>
              <span className="text-[10px] font-medium text-foreground">Has Objects</span>
            </div>
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

  // Check which connected users have contributed objects
  const { data: objectCounts = {} } = useQuery({
    queryKey: ['connected-object-counts', members.map((m: any) => m.connected_user_id)],
    queryFn: async () => {
      const ids = members.map((m: any) => m.connected_user_id);
      if (ids.length === 0) return {};
      const { data } = await supabase.from('objects').select('created_by').in('created_by', ids);
      const counts: Record<string, number> = {};
      data?.forEach(o => { if (o.created_by) counts[o.created_by] = (counts[o.created_by] || 0) + 1; });
      return counts;
    },
    enabled: members.length > 0,
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
          <p className="text-muted-foreground mt-1 text-sm">Connect with family · drag to pan · scroll to zoom</p>
        </div>
        <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Add Member
        </Button>
      </div>

      {/* Add member form */}
      {showAddForm && (
        <div className="animate-fade-in bg-card border border-border rounded-xl p-6 space-y-4">
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

      {/* Tree */}
      {isLoading && <p className="text-muted-foreground text-center py-8">Loading…</p>}

      {!isLoading && members.length === 0 && !showAddForm && (
        <div className="text-center py-16 animate-fade-in">
          <TreePine className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
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
          objectCounts={objectCounts as Record<string, number>}
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
                className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:shadow-md transition-all duration-300 active:scale-[0.98]"
              >
                {/* Gender-shaped mini icon */}
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
                    {(objectCounts as Record<string, number>)[c.connected_user_id] > 0 && (
                      <span className="text-[10px] font-medium text-primary flex items-center gap-0.5">
                        <Package className="w-3 h-3" /> Objects
                      </span>
                    )}
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
