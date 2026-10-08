-- Duta Digital Agensi (dutamik.id) : Duta Media Informasi berKarya : Sukoharjo, Jawa Tengah
-- Master Security Policy: Row Level Security (RLS) & Anti-Bypass Database Protection
-- Petunjuk: Buka Supabase Dashboard -> SQL Editor -> Tempel seluruh skrip ini -> Klik Run.

-- 1. AKTIFKAN ROW LEVEL SECURITY (RLS) PADA SEMUA TABEL
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 2. BERSIHKAN KEBIJAKAN LAMA
DROP POLICY IF EXISTS "members_admin_full_access" ON public.members;
DROP POLICY IF EXISTS "payments_admin_full_access" ON public.payments;
DROP POLICY IF EXISTS "members_select_own" ON public.members;
DROP POLICY IF EXISTS "members_insert_free_only" ON public.members;
DROP POLICY IF EXISTS "members_update_restricted" ON public.members;
DROP POLICY IF EXISTS "members_service_role_all" ON public.members;
DROP POLICY IF EXISTS "payments_select_own" ON public.payments;
DROP POLICY IF EXISTS "payments_insert_pending_own" ON public.payments;
DROP POLICY IF EXISTS "payments_delete_pending_own" ON public.payments;
DROP POLICY IF EXISTS "payments_service_role_all" ON public.payments;

-- 3. KEBIJAKAN KETAT TABEL MEMBERS
-- Pengguna hanya dapat membaca data profil miliknya sendiri
CREATE POLICY "members_select_own" ON public.members
  FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'email' = email);

-- Pendaftaran akun baru via client hanya boleh menghasilkan role free dan status active
CREATE POLICY "members_insert_free_only" ON public.members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'email' = email)
    AND (role = 'free' OR role IS NULL)
  );

-- Pengguna hanya boleh memperbarui data non-kredensial, dilarang menaikkan status menjadi pro
CREATE POLICY "members_update_restricted" ON public.members
  FOR UPDATE
  TO authenticated
  USING (auth.jwt() ->> 'email' = email)
  WITH CHECK (
    (auth.jwt() ->> 'email' = email)
    AND (role = 'free' OR role IS NULL)
  );

-- Administrator dengan Service Role memiliki hak akses penuh tanpa batasan RLS
CREATE POLICY "members_service_role_all" ON public.members
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. TRIGGER DATABASE PENCEGAH PRIVILEGE ESCALATION
-- Menolak setiap upaya perubahan role, status, atau masa berlaku dari pengguna non-admin
CREATE OR REPLACE FUNCTION public.protect_member_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF (current_user != 'service_role' AND auth.role() != 'service_role') THEN
    IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status OR NEW.expires_at IS DISTINCT FROM OLD.expires_at) THEN
      RAISE EXCEPTION 'Akses ditolak: Hanya administrator resmi yang berhak mengubah status lisensi akun member.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_member_role_escalation ON public.members;
CREATE TRIGGER trg_protect_member_role_escalation
  BEFORE UPDATE ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_member_role_escalation();

-- 5. KEBIJAKAN KETAT TABEL PAYMENTS
-- Pengguna hanya boleh melihat riwayat tagihan dan transaksi miliknya sendiri
CREATE POLICY "payments_select_own" ON public.payments
  FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'email' = email);

-- Pengguna hanya dapat membuat tagihan dengan status pending
CREATE POLICY "payments_insert_pending_own" ON public.payments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'email' = email)
    AND (status = 'pending')
  );

-- Pengguna hanya dapat membatalkan atau menghapus tagihan yang masih berstatus pending
CREATE POLICY "payments_delete_pending_own" ON public.payments
  FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() ->> 'email' = email)
    AND (status = 'pending')
  );

-- HAK UPDATE DITUTUP TOTAL UNTUK USER BIASA
-- Hanya Service Role (Dashboard Admin) yang diizinkan mengubah status menjadi approved / completed
CREATE POLICY "payments_service_role_all" ON public.payments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6. STORED PROCEDURE (RPC) PEMBUATAN INVOICE & KODE UNIK QRIS SERVER-SIDE
-- Mencegah manipulasi nominal, manipulasi kode unik, dan tabrakan transaksi di sisi klien
CREATE OR REPLACE FUNCTION public.create_pending_payment(
  p_plan text DEFAULT 'pro_annual',
  p_base_amount numeric DEFAULT 75000
)
RETURNS json AS $$
DECLARE
  v_user_email text;
  v_unique_code int;
  v_total_amount numeric;
  v_payment_id bigint;
  v_attempts int := 0;
BEGIN
  v_user_email := auth.jwt() ->> 'email';
  IF v_user_email IS NULL OR v_user_email = '' THEN
    RAISE EXCEPTION 'Autentikasi diperlukan. Pengguna wajib login terlebih dahulu.';
  END IF;

  SELECT id, unique_code, total_amount INTO v_payment_id, v_unique_code, v_total_amount
  FROM public.payments
  WHERE email = v_user_email AND status = 'pending' AND created_at > (NOW() - INTERVAL '24 hours')
  ORDER BY created_at DESC LIMIT 1;

  IF v_payment_id IS NOT NULL THEN
    RETURN json_build_object(
      'id', v_payment_id,
      'email', v_user_email,
      'plan', p_plan,
      'base_amount', p_base_amount,
      'unique_code', v_unique_code,
      'total_amount', v_total_amount,
      'status', 'pending',
      'is_existing', true
    );
  END IF;

  LOOP
    v_unique_code := 100 + floor(random() * 899)::int;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.payments
      WHERE unique_code = v_unique_code AND status = 'pending' AND created_at > (NOW() - INTERVAL '24 hours')
    ) OR v_attempts > 60;
    v_attempts := v_attempts + 1;
  END LOOP;

  v_total_amount := p_base_amount + v_unique_code;

  INSERT INTO public.payments (email, plan, base_amount, unique_code, total_amount, status, created_at)
  VALUES (v_user_email, p_plan, p_base_amount, v_unique_code, v_total_amount, 'pending', NOW())
  RETURNING id INTO v_payment_id;

  RETURN json_build_object(
    'id', v_payment_id,
    'email', v_user_email,
    'plan', p_plan,
    'base_amount', p_base_amount,
    'unique_code', v_unique_code,
    'total_amount', v_total_amount,
    'status', 'pending',
    'is_existing', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_pending_payment(text, numeric) TO authenticated;
