import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Settings, Shield, Camera, User, Accessibility, ChevronRight, Eye, ZoomIn, ZoomOut, RotateCcw, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { useToggleGuidedExploration } from '@/components/GuidedExploration';

// Global zoom state
const ZOOM_KEY = 'app-zoom-level';
function getStoredZoom(): number {
  try { return parseFloat(localStorage.getItem(ZOOM_KEY) || '100'); } catch { return 100; }
}
function setStoredZoom(v: number) {
  localStorage.setItem(ZOOM_KEY, String(v));
  document.documentElement.style.fontSize = `${v}%`;
}

// Apply stored zoom on load
if (typeof window !== 'undefined') {
  const z = getStoredZoom();
  if (z !== 100) document.documentElement.style.fontSize = `${z}%`;
}

function useFullProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['full-profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

function getAvatarUrl(userId: string, avatarUrl: string | null) {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith('http')) return avatarUrl;
  const { data } = supabase.storage.from('avatars').getPublicUrl(avatarUrl);
  return data?.publicUrl || null;
}

export default function ProfileMenu() {
  const { user, signOut } = useAuth();
  const { data: profile } = useFullProfile();
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAccessibility, setShowAccessibility] = useState(false);

  if (!user || !profile) return null;

  const avatarSrc = getAvatarUrl(user.id, profile.avatar_url);
  const displayName = profile.full_name || profile.display_name || user.email?.split('@')[0] || 'User';
  const initials = displayName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setShowSettings(false); setShowAccessibility(false); } }}>
      <PopoverTrigger asChild>
        <button className="relative w-9 h-9 rounded-full overflow-hidden border-2 border-white/20 hover:border-white/50 transition-all duration-200 active:scale-95 flex-shrink-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          {avatarSrc ? (
            <img src={avatarSrc} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs font-bold font-display" style={{ backgroundColor: 'hsl(var(--teal-500))', color: 'white' }}>
              {initials}
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0" sideOffset={8}>
        {showAccessibility ? (
          <AccessibilityPanel profile={profile} userId={user.id} onBack={() => setShowAccessibility(false)} />
        ) : showSettings ? (
          <SettingsPanel profile={profile} userId={user.id} email={user.email || ''} onBack={() => setShowSettings(false)} />
        ) : (
          <MainMenu
            profile={profile}
            userId={user.id}
            email={user.email || ''}
            avatarSrc={avatarSrc}
            displayName={displayName}
            initials={initials}
            onSignOut={() => { setOpen(false); signOut(); }}
            onOpenSettings={() => setShowSettings(true)}
            onOpenAccessibility={() => setShowAccessibility(true)}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ─── Main Menu ─── */
function MainMenu({
  profile, userId, email, avatarSrc, displayName, initials, onSignOut, onOpenSettings, onOpenAccessibility,
}: {
  profile: any; userId: string; email: string; avatarSrc: string | null;
  displayName: string; initials: string; onSignOut: () => void; onOpenSettings: () => void; onOpenAccessibility: () => void;
}) {
  return (
    <div>
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 border-2 border-border">
            {avatarSrc ? (
              <img src={avatarSrc} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm font-bold font-display" style={{ backgroundColor: 'hsl(var(--teal-500))', color: 'white' }}>
                {initials}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground text-sm truncate">{displayName}</p>
            {profile.username && (
              <p className="text-xs text-muted-foreground font-mono truncate">@{profile.username}</p>
            )}
            <p className="text-[11px] text-muted-foreground truncate">{email}</p>
          </div>
        </div>
      </div>

      <div className="p-1.5">
        <MenuButton icon={Settings} label="Account Settings" onClick={onOpenSettings} />
        <MenuButton icon={Accessibility} label="Accessibility" onClick={onOpenAccessibility} />
        <div className="my-1 border-t border-border" />
        <MenuButton icon={LogOut} label="Sign Out" onClick={onSignOut} destructive />
      </div>
    </div>
  );
}

function MenuButton({ icon: Icon, label, onClick, destructive }: { icon: any; label: string; onClick: () => void; destructive?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors active:scale-[0.98] ${
        destructive
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-foreground hover:bg-secondary'
      }`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {label}
      {!destructive && <ChevronRight className="w-3.5 h-3.5 ml-auto text-muted-foreground" />}
    </button>
  );
}

/* ─── Accessibility Panel ─── */
function AccessibilityPanel({ profile, userId, onBack }: { profile: any; userId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const guidedEnabled = (profile as any).guided_exploration ?? true;
  const toggleMut = useToggleGuidedExploration();
  const [zoomLevel, setZoomLevel] = useState(getStoredZoom);

  const handleToggle = () => {
    const newVal = !guidedEnabled;
    toggleMut.mutate(newVal, {
      onSuccess: () => {
        toast.success(newVal ? 'Guided exploration enabled' : 'Guided exploration disabled');
        queryClient.invalidateQueries({ queryKey: ['full-profile'] });
      },
    });
  };

  const updateZoom = (newZoom: number) => {
    const clamped = Math.max(75, Math.min(150, newZoom));
    setZoomLevel(clamped);
    setStoredZoom(clamped);
  };

  return (
    <div>
      <div className="p-3 border-b border-border flex items-center gap-2">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
        </button>
        <h3 className="text-sm font-semibold text-foreground">Accessibility</h3>
      </div>

      <div className="p-4 space-y-5">
        {/* Guided Exploration Toggle */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" style={{ color: 'hsl(var(--teal-500))' }} />
            <span className="text-sm font-semibold text-foreground">Guided Exploration</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Show a step-by-step popup tour when you use the app. Helps new users understand each tab and feature.
          </p>
          <button
            onClick={handleToggle}
            disabled={toggleMut.isPending}
            className="relative w-11 h-6 rounded-full transition-colors duration-200 active:scale-95"
            style={{
              backgroundColor: guidedEnabled ? 'hsl(var(--teal-cta))' : 'hsl(var(--teal-200))',
            }}
          >
            <span
              className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200"
              style={{
                transform: guidedEnabled ? 'translateX(20px)' : 'translateX(0px)',
              }}
            />
          </button>
          <p className="text-[11px] text-muted-foreground">
            {guidedEnabled ? 'Popup tour is visible when you log in.' : 'Tour is hidden. Re-enable anytime.'}
          </p>
        </div>

        {/* Zoom Controls */}
        <div className="border-t border-border pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <ZoomIn className="w-4 h-4" style={{ color: 'hsl(var(--teal-500))' }} />
            <span className="text-sm font-semibold text-foreground">Zoom Level</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Adjust the overall text and interface size for comfort.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => updateZoom(zoomLevel - 10)}
              disabled={zoomLevel <= 75}
              className="w-8 h-8 rounded-lg border flex items-center justify-center transition-all active:scale-95 disabled:opacity-30"
              style={{ borderColor: 'hsl(var(--teal-200))', color: 'hsl(var(--teal-700))' }}
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <div className="flex-1 text-center">
              <span className="text-sm font-semibold font-mono text-foreground">{zoomLevel}%</span>
            </div>
            <button
              onClick={() => updateZoom(zoomLevel + 10)}
              disabled={zoomLevel >= 150}
              className="w-8 h-8 rounded-lg border flex items-center justify-center transition-all active:scale-95 disabled:opacity-30"
              style={{ borderColor: 'hsl(var(--teal-200))', color: 'hsl(var(--teal-700))' }}
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
          {zoomLevel !== 100 && (
            <button
              onClick={() => updateZoom(100)}
              className="flex items-center gap-1.5 text-xs transition-colors hover:underline"
              style={{ color: 'hsl(var(--teal-500))' }}
            >
              <RotateCcw className="w-3 h-3" />
              Reset to 100%
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Settings Panel ─── */
function SettingsPanel({ profile, userId, email, onBack }: { profile: any; userId: string; email: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(profile.full_name || '');
  const [username, setUsername] = useState(profile.username || '');
  const [gender, setGender] = useState((profile as any).gender || 'prefer_not_to_say');
  const [bio, setBio] = useState((profile as any).bio || '');
  const [uploading, setUploading] = useState(false);

  const uploadAvatar = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2MB'); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${userId}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: path }).eq('user_id', userId);
      if (dbErr) throw dbErr;
      toast.success('Profile picture updated!');
      queryClient.invalidateQueries({ queryKey: ['full-profile'] });
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    try {
      if (profile.avatar_url && !profile.avatar_url.startsWith('http')) {
        await supabase.storage.from('avatars').remove([profile.avatar_url]);
      }
      await supabase.from('profiles').update({ avatar_url: null }).eq('user_id', userId);
      toast.success('Profile picture removed');
      queryClient.invalidateQueries({ queryKey: ['full-profile'] });
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const saveProfile = useMutation({
    mutationFn: async () => {
      const trimmedName = fullName.trim();
      const trimmedUser = username.trim().toLowerCase();
      if (!trimmedName) throw new Error('Name is required');
      if (!trimmedUser) throw new Error('Username is required');
      if (!/^[a-z0-9_]{3,30}$/.test(trimmedUser)) throw new Error('Username: 3–30 chars (letters, numbers, _)');
      const { error } = await supabase.from('profiles')
        .update({ full_name: trimmedName, username: trimmedUser, display_name: trimmedName, gender, bio: bio.trim() || null } as any)
        .eq('user_id', userId);
      if (error) {
        if (error.message.includes('duplicate') || error.message.includes('unique')) throw new Error('Username taken');
        throw error;
      }
    },
    onSuccess: () => {
      toast.success('Profile updated!');
      queryClient.invalidateQueries({ queryKey: ['full-profile'] });
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const avatarSrc = getAvatarUrl(userId, profile.avatar_url);
  const initials = (profile.full_name || profile.display_name || 'U').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="max-h-[420px] overflow-y-auto">
      <div className="p-3 border-b border-border flex items-center gap-2">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
        </button>
        <h3 className="text-sm font-semibold text-foreground">Account Settings</h3>
      </div>

      <div className="p-4 space-y-5">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="relative group">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-border">
              {avatarSrc ? (
                <img src={avatarSrc} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-lg font-bold font-display" style={{ backgroundColor: 'hsl(var(--teal-500))', color: 'white' }}>
                  {initials}
                </div>
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              <Camera className="w-5 h-5 text-white" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Change photo'}
            </Button>
            {profile.avatar_url && (
              <Button size="sm" variant="ghost" className="text-xs h-7 text-destructive hover:text-destructive" onClick={removeAvatar}>
                Remove
              </Button>
            )}
          </div>
        </div>

        {/* Name & username */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Full Name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full h-8 px-2.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              className="w-full h-8 px-2.5 text-sm rounded-md border border-border bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              maxLength={30}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Gender</label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="w-full h-8 px-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A short bio about yourself…"
              maxLength={200}
              rows={3}
              className="w-full px-2.5 py-2 text-sm rounded-md border border-border bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{bio.length}/200</p>
          </div>
          <Button size="sm" onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending} className="w-full text-xs">
            {saveProfile.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>

        {/* Safeword */}
        <SafewordSection userId={userId} safeword={profile.safeword} />
      </div>
    </div>
  );
}

/* ─── Safeword Section ─── */
function SafewordSection({ userId, safeword }: { userId: string; safeword: string | null }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [visible, setVisible] = useState(false);
  const [word, setWord] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = word.trim();
      if (trimmed.length < 4) throw new Error('At least 4 characters');
      const { error } = await supabase.from('profiles').update({ safeword: trimmed }).eq('user_id', userId);
      if (error) {
        if (error.message.includes('duplicate') || error.message.includes('unique')) throw new Error('Safeword taken');
        throw error;
      }
    },
    onSuccess: () => {
      toast.success('Safeword updated!');
      setEditing(false);
      setWord('');
      queryClient.invalidateQueries({ queryKey: ['full-profile'] });
      queryClient.invalidateQueries({ queryKey: ['profile-safeword'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="border-t border-border pt-4 space-y-2">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4" style={{ color: 'hsl(var(--teal-cta))' }} />
        <span className="text-xs font-semibold text-foreground">Safeword</span>
      </div>
      {safeword && !editing ? (
        <div className="flex items-center gap-2">
          <code className="bg-secondary px-2 py-1 rounded text-xs font-mono text-foreground">
            {visible ? safeword : '••••••'}
          </code>
          <button onClick={() => setVisible(!visible)} className="text-muted-foreground hover:text-foreground text-xs">
            {visible ? 'Hide' : 'Show'}
          </button>
          <button onClick={() => { setEditing(true); setWord(''); }} className="text-xs font-medium ml-auto" style={{ color: 'hsl(var(--teal-500))' }}>
            Change
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder={safeword ? 'New safeword…' : 'Set a safeword…'}
            className="flex-1 h-7 px-2 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
          <Button size="sm" className="h-7 text-xs px-2" onClick={() => save.mutate()} disabled={word.trim().length < 4 || save.isPending}>
            Save
          </Button>
          {safeword && (
            <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground leading-tight">
        Family members need your safeword to connect with you.
      </p>
    </div>
  );
}
