function closeServerModal() {
      const modal = document.getElementById('serverModal');
      if (modal) modal.style.display = 'none';
    }



    var SUPABASE_PROJECT_URL = 'https://vezruyffzmabhtylxigc.supabase.co';
    var SUPABASE_ANON_KEY = localStorage.getItem('supabase_anon_key') || 'sb_publishable_NBReVvac6_FUBe969fLbOw_ZGZjcwKM';
    var GOOGLE_CLIENT_ID = localStorage.getItem('google_client_id') || '194944801134-etvtpajb04e1jdkrmiv07sjupsqul29p.apps.googleusercontent.com';
    var supabaseClient = null;
    var currentMemberSession = null;
    var _memberSecureState = { role: 'free', status: 'none', email: '', name: '', expires_at: null };

    function setMemberSecureData(patch) {
      if (patch && typeof patch === 'object') {
        Object.assign(_memberSecureState, patch);
      }
    }

    try {
      Object.defineProperty(window, 'currentMemberProfile', {
        get: function() {
          return Object.freeze({ ..._memberSecureState });
        },
        set: function() {
          return false;
        },
        configurable: false
      });
    } catch (e) {}

    function verifyProLicenseIntegrity() {
      if (!currentMemberSession || !currentMemberSession.user || !currentMemberSession.user.email) return false;
      if (!currentMemberSession.access_token) return false;
      if (_memberSecureState.role !== 'pro' || _memberSecureState.status !== 'active') return false;
      if (_memberSecureState.email !== currentMemberSession.user.email) return false;
      if (_memberSecureState.expires_at && new Date(_memberSecureState.expires_at) <= new Date()) return false;
      return true;
    }

    try {
      Object.defineProperty(window, 'isMemberProActive', {
        value: verifyProLicenseIntegrity,
        writable: false,
        configurable: false
      });
    } catch (e) {
      window.isMemberProActive = verifyProLicenseIntegrity;
    }

    function initSupabase() {
      localStorage.removeItem('duta_pro_token');
      if (typeof window.supabase === 'undefined') return;
      if (!SUPABASE_ANON_KEY) {
        SUPABASE_ANON_KEY = localStorage.getItem('supabase_anon_key') || 'sb_publishable_NBReVvac6_FUBe969fLbOw_ZGZjcwKM';
      }
      if (SUPABASE_ANON_KEY) {
        try {
          supabaseClient = window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_ANON_KEY, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true
            }
          });
          supabaseClient.auth.onAuthStateChange(async (event, session) => {
            currentMemberSession = session;
            if (session && session.user) {
              await fetchMemberProfile(session.user);
            } else {
              setMemberSecureData({ role: 'free', status: 'none', email: '', name: '', expires_at: null });
              updateMemberUI();
            }
          });
        } catch (err) {}
      }
      updateMemberUI();
      initGoogleIdentityServices();
    }

    function initGoogleIdentityServices() {
      if (!GOOGLE_CLIENT_ID) {
        GOOGLE_CLIENT_ID = localStorage.getItem('google_client_id') || '194944801134-etvtpajb04e1jdkrmiv07sjupsqul29p.apps.googleusercontent.com';
      }
      const slot = document.getElementById('gisButtonSlot');
      const btn = document.getElementById('btnGoogleAuth');

      if (window.location.protocol === 'file:') {
        if (slot) {
          slot.innerHTML = '<div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: var(--radius-sm); padding: 0.75rem 1rem; font-size: 0.73rem; color: #92400e; line-height: 1.45; text-align: center; width: 100%; max-width: 360px; margin-bottom: 0.25rem;"><div style="font-weight: 700; margin-bottom: 4px;">Pemberitahuan Protokol Berkas (file://)</div><div>Kebijakan keamanan Google OAuth melarang login dari berkas lokal. Buka aplikasi melalui domain resmi:</div><a href="https://geospasi.dutamik.id" class="btn btn-sm" style="background-color: #0f3b73; color: #ffffff; text-decoration: none; padding: 6px 14px; font-weight: 700; border-radius: 4px; display: inline-block; margin-top: 8px;">Buka geospasi.dutamik.id</a></div>';
        }
        if (btn) btn.style.display = 'none';
        return;
      }

      if (typeof window.google === 'undefined' || !window.google.accounts || !window.google.accounts.id) {
        if (btn) btn.style.display = 'inline-flex';
        setTimeout(() => {
          if (typeof window.google !== 'undefined' && window.google.accounts && window.google.accounts.id) {
            initGoogleIdentityServices();
          }
        }, 600);
        return;
      }
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleSignInResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
          context: 'signin'
        });
        if (slot) {
          slot.innerHTML = '';
          window.google.accounts.id.renderButton(slot, {
            theme: 'outline',
            size: 'large',
            type: 'standard',
            shape: 'rectangular',
            text: 'signin_with',
            logo_alignment: 'left',
            width: 320
          });
          if (btn) btn.style.display = 'none';
        }
      } catch (err) {
        if (btn) btn.style.display = 'inline-flex';
      }
    }

    async function handleGoogleSignInResponse(response) {
      if (!response || !response.credential) {
        showToast('Gagal memperoleh otentikasi Google.', 'crimson');
        return;
      }
      if (!ensureSupabaseClient()) return;
      showToast('Memverifikasi identitas akun Google...', 'info');
      try {
        const { data, error } = await supabaseClient.auth.signInWithIdToken({
          provider: 'google',
          token: response.credential
        });
        if (error) {
          showToast('Otentikasi gagal: ' + error.message, 'crimson');
          return;
        }
        showToast('Berhasil masuk dengan Akun Google.', 'success');
        if (data && data.user) {
          await fetchMemberProfile(data.user);
        }
        closeMemberModal();
      } catch (err) {
        showToast('Terjadi kesalahan verifikasi: ' + err.message, 'crimson');
      }
    }

    function configureGoogleClientId() {
      openServerModal();
    }

    async function fetchMemberProfile(user) {
      if (!supabaseClient || !user) return;
      const email = user.email || '';
      const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Member';
      setMemberSecureData({ email, name });
      try {
        const { data, error } = await supabaseClient
          .from('members')
          .select('role, status, expires_at')
          .eq('email', user.email)
          .maybeSingle();

        if (data && !error) {
          setMemberSecureData({
            role: (data.role || 'free').toLowerCase(),
            status: (data.status || 'active').toLowerCase(),
            expires_at: data.expires_at || null
          });
        } else {
          setMemberSecureData({
            role: 'free',
            status: 'active'
          });
        }
      } catch (e) {
        setMemberSecureData({ role: 'free' });
      }
      updateMemberUI();
    }

    async function loginWithGoogle() {
      if (!ensureSupabaseClient()) return;
      if (window.location.protocol === 'file:') {
        showToast('Otentikasi Google membutuhkan koneksi online. Silakan buka aplikasi pada domain resmi https://geospasi.dutamik.id', 'warn');
        return;
      }
      if (!GOOGLE_CLIENT_ID) {
        GOOGLE_CLIENT_ID = localStorage.getItem('google_client_id') || '194944801134-etvtpajb04e1jdkrmiv07sjupsqul29p.apps.googleusercontent.com';
      }
      if (GOOGLE_CLIENT_ID && typeof window.google !== 'undefined' && window.google.accounts && window.google.accounts.id) {
        initGoogleIdentityServices();
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            const hasGisButton = document.querySelector('#gisButtonSlot iframe') || document.querySelector('#gisButtonSlot div[role="button"]');
            if (hasGisButton) {
              showToast('Silakan klik tombol Google Sign In di dalam modal akun.', 'info');
            } else {
              fallbackGoogleOAuthRedirect();
            }
          }
        });
        return;
      }
      fallbackGoogleOAuthRedirect();
    }

    async function fallbackGoogleOAuthRedirect() {
      if (window.location.protocol === 'file:') {
        showToast('Otentikasi Google membutuhkan koneksi online. Silakan buka aplikasi pada domain resmi https://geospasi.dutamik.id', 'warn');
        return;
      }
      try {
        const redirectUrl = window.location.origin + window.location.pathname;
        const { error } = await supabaseClient.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl
          }
        });
        if (error) {
          if (error.message && error.message.includes('redirect_uri')) {
            showToast('Konfigurasi Google OAuth: Tambahkan https://vezruyffzmabhtylxigc.supabase.co/auth/v1/callback ke Authorized redirect URIs Google Cloud.', 'crimson');
          } else {
            showToast('Gagal memproses login Google: ' + error.message, 'crimson');
          }
        }
      } catch (err) {
        showToast('Terjadi kesalahan otentikasi Google: ' + err.message, 'crimson');
      }
    }

    async function logoutMember() {
      if (supabaseClient) {
        try {
          await supabaseClient.auth.signOut();
        } catch (e) {}
      }
      currentMemberSession = null;
      setMemberSecureData({ role: 'free', status: 'none', email: '', name: '', expires_at: null });
      localStorage.removeItem('duta_pro_token');
      updateMemberUI();
      showToast('Anda telah keluar dari akun.', 'info');
    }

    function ensureSupabaseClient() {
      if (!supabaseClient) {
        initSupabase();
      }
      return !!supabaseClient;
    }

    

    function updateMemberUI() {
      const headerBtn = document.getElementById('btnHeaderMember');
      const headerText = document.getElementById('headerMemberText');
      const headerBadge = document.getElementById('headerMemberBadge');
      const guestBody = document.getElementById('memberModalBodyGuest');
      const userBody = document.getElementById('memberModalBodyUser');

      const isPro = isMemberProActive();
      const isLoggedIn = !!currentMemberSession?.user;

      if (headerBadge) {
        if (isPro) {
          headerBadge.textContent = 'PRO';
          headerBadge.className = 'tier-tag pro';
        } else {
          headerBadge.textContent = 'FREE';
          headerBadge.className = 'tier-tag free';
        }
      }

      if (headerText) {
        if (isLoggedIn) {
          headerText.textContent = (currentMemberProfile.name || 'Member').substring(0, 10);
        } else {
          headerText.textContent = 'Member';
        }
      }

      const attrInputIds = ['shpPemrakarsa', 'shpKegiatan', 'shpTahun', 'shpProvinsi', 'shpKeterangan', 'shpLayer'];
      const tabBtnOss = document.getElementById('tabBtnOss');
      const tabBtnCustom = document.getElementById('tabBtnCustom');
      const attrModeBadge = document.getElementById('attrModeBadge');
      const boxEkspor = document.getElementById('boxEkspor');

      if (!isPro) {
        attrInputIds.forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            el.disabled = true;
            el.style.backgroundColor = 'var(--bg-subtle)';
            el.style.cursor = 'not-allowed';
          }
        });
        const shpLayer = document.getElementById('shpLayer');
        if (shpLayer) shpLayer.value = 'geospasi.dutamik.id';

        if (tabBtnCustom) {
          tabBtnCustom.disabled = true;
          tabBtnCustom.style.opacity = '0.5';
          tabBtnCustom.style.cursor = 'not-allowed';
        }
        if (tabBtnOss) {
          tabBtnOss.disabled = true;
          tabBtnOss.style.cursor = 'default';
        }
        if (attrModeBadge) {
          attrModeBadge.className = 'badge-pill';
          attrModeBadge.style.backgroundColor = '#f1f5f9';
          attrModeBadge.style.color = '#475569';
          attrModeBadge.innerText = 'GRATIS: LAYER ONLY (MAKS 150 M²)';
        }
        let freeNotice = document.getElementById('shpFreeAttrNotice');
        if (!freeNotice && boxEkspor) {
          freeNotice = document.createElement('div');
          freeNotice.id = 'shpFreeAttrNotice';
          freeNotice.style.cssText = 'font-size:0.71rem;background:#f8fafc;border:1px solid #cbd5e1;padding:6px 10px;border-radius:4px;color:#334155;margin:6px 0;line-height:1.4;';
          freeNotice.innerHTML = '<b>Mode Akun Gratis:</b> Atribut terkunci pada <code>LAYER: geospasi.dutamik.id</code> (Maks luas 150 m²). Berkas: <code>geospasi.zip</code>. <a href="javascript:void(0)" onclick="openMemberModal()" style="color:#0284c7;font-weight:600;text-decoration:none;">Upgrade ke PRO</a> untuk atribut kustom &amp; luas tanpa batas.';
          const tabNav = boxEkspor.querySelector('div[style*="border-bottom"]');
          if (tabNav) {
            boxEkspor.insertBefore(freeNotice, tabNav);
          }
        } else if (freeNotice) {
          freeNotice.style.display = 'block';
        }
      } else {
        attrInputIds.forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            el.disabled = false;
            el.style.backgroundColor = '';
            el.style.cursor = '';
          }
        });
        if (tabBtnCustom) {
          tabBtnCustom.disabled = false;
          tabBtnCustom.style.opacity = '1';
          tabBtnCustom.style.cursor = 'pointer';
        }
        if (tabBtnOss) {
          tabBtnOss.disabled = false;
          tabBtnOss.style.cursor = 'pointer';
        }
        if (attrModeBadge) {
          attrModeBadge.className = 'badge-pill blue';
          attrModeBadge.style.backgroundColor = '';
          attrModeBadge.style.color = '';
          attrModeBadge.innerText = 'PRO: OSS & KUSTOM';
        }
        const freeNotice = document.getElementById('shpFreeAttrNotice');
        if (freeNotice) {
          freeNotice.style.display = 'none';
        }
      }

      if (isLoggedIn) {
        if (guestBody) guestBody.style.display = 'none';
        if (userBody) userBody.style.display = 'flex';

        const nameEl = document.getElementById('memberProfileName');
        const emailEl = document.getElementById('memberProfileEmail');
        const avatarEl = document.getElementById('memberAvatarInitials');
        const badgeEl = document.getElementById('memberProfileBadge');
        const alertEl = document.getElementById('memberStatusAlert');
        const upgradeBtn = document.getElementById('btnUpgradeWa');
        const qrisBtn = document.getElementById('btnUpgradeQris');
        const thankYouCard = document.getElementById('proMemberThankYouCard');

        if (nameEl) nameEl.textContent = currentMemberProfile.name || 'Member Duta GeoSpasi';
        if (emailEl) emailEl.textContent = currentMemberProfile.email || '-';
        if (avatarEl) avatarEl.textContent = (currentMemberProfile.name || currentMemberProfile.email || 'M').charAt(0).toUpperCase();

        if (isPro) {
          if (badgeEl) {
            badgeEl.className = 'member-plan-badge pro';
            badgeEl.textContent = 'PRO MEMBER RESMI';
          }
          if (alertEl) {
            alertEl.style.display = 'none';
          }
          if (thankYouCard) thankYouCard.style.display = 'block';
          if (qrisBtn) qrisBtn.style.display = 'none';
          if (upgradeBtn) upgradeBtn.style.display = 'none';
        } else {
          if (badgeEl) {
            badgeEl.className = 'member-plan-badge free';
            badgeEl.textContent = 'FREE TIER';
          }
          if (alertEl) {
            alertEl.style.display = 'block';
            alertEl.innerHTML = 'Akun Anda saat ini berstatus <strong>FREE TIER</strong>. Hak akses ekspor Shapefile dibatasi maksimal luas 150 m² dengan atribut LAYER: geospasi.dutamik.id. Lakukan pembayaran via QRIS untuk aktivasi status PRO Lifetime.';
          }
          if (thankYouCard) thankYouCard.style.display = 'none';
          if (qrisBtn) qrisBtn.style.display = 'flex';
          if (upgradeBtn) upgradeBtn.style.display = 'flex';
        }
      } else {
        if (guestBody) guestBody.style.display = 'flex';
        if (userBody) userBody.style.display = 'none';
      }
    }

    function openMemberModal() {
      updateMemberUI();
      const modal = document.getElementById('memberModal');
      if (modal) modal.style.display = 'flex';
      initGoogleIdentityServices();
    }

    function closeMemberModal() {
      const modal = document.getElementById('memberModal');
      if (modal) modal.style.display = 'none';
    }

    var currentPaymentDetails = {
      baseAmount: 75000,
      uniqueCode: 100,
      totalAmount: 75100
    };

    function applyPaymentDetailsToUI(email, details) {
      const emailInput = document.getElementById('qrisBuyerEmail');
      if (emailInput) {
        emailInput.value = email;
        emailInput.readOnly = true;
      }
      const totalDisplay = document.getElementById('qrisTotalDisplay');
      if (totalDisplay) {
        totalDisplay.textContent = 'Rp ' + Number(details.totalAmount).toLocaleString('id-ID');
      }
      const codeDisplay = document.getElementById('qrisUniqueCodeDisplay');
      if (codeDisplay) {
        codeDisplay.textContent = String(details.uniqueCode);
      }
    }

    async function generateQrisPayment(targetEmail) {
      const email = (currentMemberSession?.user?.email || targetEmail || '').trim();
      const base = 75000;

      if (supabaseClient && currentMemberSession && currentMemberSession.user) {
        try {
          const { data, error } = await supabaseClient.rpc('create_pending_payment', {
            p_plan: 'pro_annual',
            p_base_amount: base
          });
          if (data && !error) {
            currentPaymentDetails = {
              baseAmount: Number(data.base_amount || base),
              uniqueCode: Number(data.unique_code),
              totalAmount: Number(data.total_amount),
              id: data.id
            };
            applyPaymentDetailsToUI(email, currentPaymentDetails);
            return;
          }
        } catch (rpcErr) {}
      }

      const code = 100 + ((Date.now() + Math.floor(Math.random() * 899)) % 899);
      const total = base + code;
      currentPaymentDetails = {
        baseAmount: base,
        uniqueCode: code,
        totalAmount: total,
        id: null
      };
      applyPaymentDetailsToUI(email, currentPaymentDetails);
      await savePendingPaymentRecord(email, base, code, total);
    }

    async function savePendingPaymentRecord(email, base, code, total) {
      if (!supabaseClient || !email) return;
      try {
        const { data } = await supabaseClient.from('payments').insert([
          {
            email: email,
            base_amount: base,
            unique_code: code,
            total_amount: total,
            status: 'pending'
          }
        ]).select('id');
        if (data && data[0] && data[0].id) {
          currentPaymentDetails.id = data[0].id;
        }
      } catch (e) {}
    }

    function openQrisPaymentModal() {
      if (!currentMemberSession || !currentMemberSession.user || !currentMemberSession.user.email) {
        showToast('Wajib login dengan Akun Google terlebih dahulu sebelum aktivasi status PRO.', 'warn');
        openMemberModal();
        return;
      }
      const userEmail = currentMemberSession.user.email;
      generateQrisPayment(userEmail);
      const modal = document.getElementById('qrisPaymentModal');
      if (modal) modal.style.display = 'flex';
    }

    function closeQrisPaymentModal() {
      const modal = document.getElementById('qrisPaymentModal');
      if (modal) modal.style.display = 'none';
    }

    function copyQrisAmount() {
      const num = currentPaymentDetails.totalAmount || 75000;
      navigator.clipboard.writeText(String(num)).then(() => {
        showToast('Nominal transfer Rp ' + num.toLocaleString('id-ID') + ' disalin.', 'success');
      }).catch(() => {
        showToast('Nominal: ' + num, 'info');
      });
    }

    function confirmPaymentWhatsApp() {
      const email = document.getElementById('qrisBuyerEmail')?.value.trim() || currentMemberProfile?.email || '-';
      if (!email || !email.includes('@')) {
        showToast('Masukkan alamat email Anda terlebih dahulu.', 'warn');
        return;
      }
      const total = currentPaymentDetails.totalAmount;
      const code = currentPaymentDetails.uniqueCode;
      const text = encodeURIComponent(
        'Halo Admin Duta Digital Agensi, saya telah melakukan transfer pembayaran QRIS untuk aktivasi Member PRO Duta GeoSpasi:\n\n' +
        '• Email Akun: ' + email + '\n' +
        '• Total Transfer: Rp ' + total.toLocaleString('id-ID') + '\n' +
        '• Kode Unik 3 Digit: ' + code + '\n' +
        '• Tanggal: ' + new Date().toLocaleDateString('id-ID') + '\n\n' +
        'Mohon diverifikasi agar status PRO segera aktif. Bukti transfer terlampir. Terima kasih!'
      );
      window.open('https://wa.me/6283130300094?text=' + text, '_blank');
    }

    async function checkPaymentStatusLive() {
      const email = currentMemberSession?.user?.email || document.getElementById('qrisBuyerEmail')?.value.trim();
      if (!email || !email.includes('@')) {
        showToast('Masukkan alamat email yang valid untuk memeriksa status.', 'warn');
        return;
      }
      showToast('Memeriksa status verifikasi pembayaran di database...', 'info');
      if (supabaseClient) {
        try {
          const { data } = await supabaseClient
            .from('members')
            .select('role, status')
            .eq('email', email)
            .maybeSingle();

          if (data && data.role === 'pro' && data.status === 'active') {
            setMemberSecureData({ role: 'pro', status: 'active' });
            updateMemberUI();
            showToast('Selamat! Pembayaran terverifikasi, Akun Anda telah menjadi PRO MEMBER!', 'success');
            closeQrisPaymentModal();
            closeMemberModal();
            return;
          }
        } catch (e) {}
      }
      showToast('Pembayaran belum diverifikasi. Jika sudah transfer, silakan konfirmasi via WhatsApp agar admin segera mengaktifkan akun Anda.', 'warn');
    }

    async function cancelAndClearCurrentPendingPayment() {
      if (!currentMemberSession || !currentMemberSession.user || !currentMemberSession.user.email) {
        closeQrisPaymentModal();
        return;
      }
      const authEmail = currentMemberSession.user.email;
      if (!confirm('Konfirmasi: Batalkan transaksi dan hapus data tagihan QRIS yang belum dibayar ini?')) return;
      if (supabaseClient) {
        try {
          let query = supabaseClient.from('payments').delete().eq('email', authEmail).eq('status', 'pending');
          if (currentPaymentDetails && currentPaymentDetails.id) {
            query = query.eq('id', currentPaymentDetails.id);
          }
          const { error } = await query;
          if (error) {
            showToast('Gagal membatalkan tagihan: ' + error.message, 'warn');
            return;
          }
          currentPaymentDetails = {};
          showToast('Data tagihan berhasil dibatalkan dan dihapus.', 'info');
          closeQrisPaymentModal();
        } catch (e) {
          showToast('Gagal membatalkan tagihan.', 'warn');
        }
      } else {
        closeQrisPaymentModal();
      }
    }

    window.initSupabase = initSupabase;
    window.ensureSupabaseClient = ensureSupabaseClient;
    window.initGoogleIdentityServices = initGoogleIdentityServices;
    window.handleGoogleSignInResponse = handleGoogleSignInResponse;
    window.configureGoogleClientId = configureGoogleClientId;
    window.fetchMemberProfile = fetchMemberProfile;
    window.loginWithGoogle = loginWithGoogle;
    window.fallbackGoogleOAuthRedirect = fallbackGoogleOAuthRedirect;
    window.logoutMember = logoutMember;
    window.verifyProLicenseIntegrity = verifyProLicenseIntegrity;
    window.updateMemberUI = updateMemberUI;
    window.openMemberModal = openMemberModal;
    window.closeMemberModal = closeMemberModal;
    window.generateQrisPayment = generateQrisPayment;
    window.savePendingPaymentRecord = savePendingPaymentRecord;
    window.openQrisPaymentModal = openQrisPaymentModal;
    window.closeQrisPaymentModal = closeQrisPaymentModal;
    window.copyQrisAmount = copyQrisAmount;
    window.confirmPaymentWhatsApp = confirmPaymentWhatsApp;
    window.checkPaymentStatusLive = checkPaymentStatusLive;
    window.cancelAndClearCurrentPendingPayment = cancelAndClearCurrentPendingPayment;

