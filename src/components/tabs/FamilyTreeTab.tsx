import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Plus, User, Unlink, Loader2, GripVertical, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useConnections } from '@/components/FamilyConnections';

interface TreeNode {
  id: string;
  connectionId: string;
  name: string;
  username: string;
  x: number;
  y: number;
  parentId: string | null;
}

interface TreeLayout {
  nodes: Record<string, { x: number; y: number; parentId: string | null }>;
}

export default function FamilyTreeTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: connections = [], isLoading } = useConnections();
  const [showAddForm, setShowAddForm] = useState(false);
  const [username, setUsername] = useState('');
  const [safeword, setSafeword] = useState('');

  // Tree visualization state
  const [treeLayout, setTreeLayout] = useState<TreeLayout>({ nodes: {} });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connecting, setConnecting] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Load saved layout from localStorage
  useEffect(() => {
    if (user) {
      const saved = localStorage.getItem(`tree-layout-${user.id}`);
      if (saved) {
        try { setTreeLayout(JSON.parse(saved)); } catch {}
      }
    }
  }, [user]);

  // Save layout whenever it changes
  useEffect(() => {
    if (user && Object.keys(treeLayout.nodes).length > 0) {
      localStorage.setItem(`tree-layout-${user.id}`, JSON.stringify(treeLayout));
    }
  }, [treeLayout, user]);

  // Fetch current user's profile
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

  // Build tree nodes from connections
  const treeNodes: TreeNode[] = (connections as any[]).map((c, i) => {
    const saved = treeLayout.nodes[c.id];
    return {
      id: c.id,
      connectionId: c.id,
      name: c.connected_name || 'Unknown',
      username: c.connected_username || '',
      x: saved?.x ?? 100 + (i % 3) * 180,
      y: saved?.y ?? 200 + Math.floor(i / 3) * 140,
      parentId: saved?.parentId ?? null,
    };
  });

  const meNode: TreeNode = {
    id: 'me',
    connectionId: 'me',
    name: myProfile?.full_name || myProfile?.display_name || 'You',
    username: myProfile?.username || '',
    x: treeLayout.nodes['me']?.x ?? 300,
    y: treeLayout.nodes['me']?.y ?? 60,
    parentId: null,
  };

  const allNodes = [meNode, ...treeNodes];

  const handleMouseDown = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.preventDefault();
    const node = allNodes.find(n => n.id === nodeId);
    if (!node) return;

    if (connecting) {
      if (connecting !== nodeId) {
        setTreeLayout(prev => {
          const existing = prev.nodes[connecting] || { x: 0, y: 0, parentId: null };
          return {
            nodes: {
              ...prev.nodes,
              [connecting]: { x: existing.x, y: existing.y, parentId: nodeId },
          },
        }));
      }
      setConnecting(null);
      return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDraggingId(nodeId);
    setDragOffset({
      x: e.clientX / zoom - node.x,
      y: e.clientY / zoom - node.y,
    });
  }, [allNodes, connecting, zoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingId) return;
    const newX = e.clientX / zoom - dragOffset.x;
    const newY = e.clientY / zoom - dragOffset.y;
    const existing = treeLayout.nodes[draggingId] || {};
    setTreeLayout(prev => ({
      nodes: {
        ...prev.nodes,
        [draggingId]: { ...existing, x: newX, y: newY, parentId: existing.parentId ?? null },
      },
    }));
  }, [draggingId, dragOffset, zoom, treeLayout]);

  const handleMouseUp = useCallback(() => {
    setDraggingId(null);
  }, []);

  const removeParentLink = (nodeId: string) => {
    setTreeLayout(prev => ({
      nodes: {
        ...prev.nodes,
        [nodeId]: { ...prev.nodes[nodeId], parentId: null },
      },
    }));
  };

  // Draw lines between parent-child
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const node of allNodes) {
    if (node.parentId) {
      const parent = allNodes.find(n => n.id === node.parentId);
      if (parent) {
        lines.push({ x1: parent.x + 70, y1: parent.y + 40, x2: node.x + 70, y2: node.y });
      }
    }
  }

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

      {/* Visual Tree Canvas */}
      {!isLoading && (connections as any[]).length > 0 && (
        <div className="animate-reveal-up stagger-1 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-foreground">
              Visual Family Tree
            </h3>
            <div className="flex items-center gap-1">
              {connecting && (
                <span className="text-xs text-primary mr-2 font-medium">Click a node to set as parent…</span>
              )}
              <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => setZoom(z => Math.min(z + 0.1, 2))}>
                <ZoomIn className="w-3.5 h-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => setZoom(z => Math.max(z - 0.1, 0.5))}>
                <ZoomOut className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Drag members to arrange. Double-click a member to start linking, then click another to set parent. Right-click a member to remove its parent link.
          </p>
          <div
            ref={canvasRef}
            className="relative bg-card border border-border rounded-xl overflow-hidden select-none"
            style={{ height: 500, cursor: draggingId ? 'grabbing' : 'default' }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
            >
              {lines.map((line, i) => (
                <line
                  key={i}
                  x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  opacity={0.5}
                />
              ))}
            </svg>
            <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', position: 'relative', width: '100%', height: '100%' }}>
              {allNodes.map((node) => (
                <div
                  key={node.id}
                  className={`absolute flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 shadow-md cursor-grab active:cursor-grabbing transition-shadow
                    ${node.id === 'me'
                      ? 'bg-primary text-primary-foreground border-primary shadow-primary/20'
                      : connecting === node.id
                        ? 'bg-accent/30 border-accent shadow-accent/20'
                        : 'bg-card border-border hover:shadow-lg hover:shadow-foreground/5'
                    }
                  `}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: 140,
                    zIndex: draggingId === node.id ? 50 : 10,
                  }}
                  onMouseDown={(e) => handleMouseDown(node.id, e)}
                  onDoubleClick={() => {
                    if (node.id !== 'me') setConnecting(node.id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (node.id !== 'me') removeParentLink(node.id);
                  }}
                >
                  <GripVertical className="w-3.5 h-3.5 opacity-40 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate leading-tight">
                      {node.id === 'me' ? 'You' : node.name}
                    </p>
                    {node.username && (
                      <p className={`text-[10px] truncate font-mono ${node.id === 'me' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                        @{node.username}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Connection List */}
      <div className="animate-reveal-up stagger-2 space-y-3">
        <h3 className="font-display text-lg font-semibold text-foreground">
          Connected Members ({(connections as any[]).length})
        </h3>
        {isLoading && <p className="text-muted-foreground text-center py-8">Loading…</p>}

        {!isLoading && (connections as any[]).length === 0 && !showAddForm && (
          <div className="text-center py-12">
            <User className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No family members connected yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Click "Add Member" and enter a family member's username & safeword
            </p>
          </div>
        )}

        {(connections as any[]).map((c) => (
          <div
            key={c.id}
            className="bg-card border border-border rounded-xl p-5 flex items-center gap-4 hover:shadow-md hover:shadow-foreground/5 transition-all duration-300"
          >
            <div className="w-11 h-11 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{c.connected_name}</p>
              <p className="text-xs text-muted-foreground">@{c.connected_username} · Connected family member</p>
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
        ))}
      </div>
    </div>
  );
}
