
-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update timestamp function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Global objects table
CREATE TABLE public.objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  history TEXT,
  image_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view objects" ON public.objects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create objects" ON public.objects FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creators can update own objects" ON public.objects FOR UPDATE TO authenticated USING (auth.uid() = created_by);

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON public.objects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Stories (community contributions to objects)
CREATE TABLE public.stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id UUID NOT NULL REFERENCES public.objects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view stories" ON public.stories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can add stories" ON public.stories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own stories" ON public.stories FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Family trees
CREATE TABLE public.family_trees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Family Tree',
  share_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.family_trees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage their trees" ON public.family_trees FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Shared trees viewable by token" ON public.family_trees FOR SELECT TO authenticated USING (is_shared = true);

CREATE TRIGGER update_family_trees_updated_at BEFORE UPDATE ON public.family_trees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Family members
CREATE TABLE public.family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id UUID NOT NULL REFERENCES public.family_trees(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship TEXT,
  bio TEXT,
  photo_url TEXT,
  birth_year INT,
  parent_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage members" ON public.family_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.family_trees WHERE id = tree_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.family_trees WHERE id = tree_id AND user_id = auth.uid()));
CREATE POLICY "Shared tree members viewable" ON public.family_members FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.family_trees WHERE id = tree_id AND is_shared = true));

CREATE TRIGGER update_family_members_updated_at BEFORE UPDATE ON public.family_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Object-to-member links
CREATE TABLE public.object_member_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id UUID NOT NULL REFERENCES public.objects(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(object_id, member_id)
);
ALTER TABLE public.object_member_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own links" ON public.object_member_links FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Member stories
CREATE TABLE public.member_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.member_stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage member stories" ON public.member_stories FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.family_members fm
    JOIN public.family_trees ft ON fm.tree_id = ft.id
    WHERE fm.id = member_id AND ft.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.family_members fm
    JOIN public.family_trees ft ON fm.tree_id = ft.id
    WHERE fm.id = member_id AND ft.user_id = auth.uid()
  ));
CREATE POLICY "Shared member stories viewable" ON public.member_stories FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.family_members fm
    JOIN public.family_trees ft ON fm.tree_id = ft.id
    WHERE fm.id = member_id AND ft.is_shared = true
  ));
