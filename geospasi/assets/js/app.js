function toggleMobileSidebar(forceClose = false) {
      const sb = document.getElementById('sidebar');
      const ov = document.getElementById('mobileOverlay');
      const fab = document.getElementById('mapSidebarFab');
      if (!sb || !ov) return;
      if (forceClose || sb.classList.contains('mobile-open')) {
        sb.classList.remove('mobile-open');
        ov.classList.remove('active');
        if (fab) fab.style.display = 'flex';
      } else {
        sb.classList.add('mobile-open');
        ov.classList.add('active');
        if (fab) fab.style.display = 'none';
      }
      setTimeout(() => map && map.invalidateSize(), 300);
    }

    function toggleContentBox(headerEl) {
      const box = headerEl.closest('.content-box');
      if (box) {
        box.classList.toggle('collapsed');
      }
    }

    function toggleAllContentBoxes(expand) {
      const activePanel = document.querySelector('.tab-view.active');
      if (!activePanel) return;
      const boxes = activePanel.querySelectorAll('.content-box.collapsible');
      boxes.forEach(box => {
        if (expand) {
          box.classList.remove('collapsed');
        } else {
          box.classList.add('collapsed');
        }
      });
    }

    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-view').forEach(panel => panel.classList.remove('active'));

      const btnMap = {
        'tab-bidang': 'btnTabBidang',
        'tab-koordinat': 'btnTabKoordinat',
        'tab-layers': 'btnTabLayers',
        'tab-search': 'btnTabSearch',
        'tab-digitasi': 'btnTabDigitasi',
        'tab-info': 'btnTabInfo'
      };

      const btn = document.getElementById(btnMap[tabId]);
      if (btn) btn.classList.add('active');

      const panel = document.getElementById(tabId);
      if (panel) panel.classList.add('active');

      if (tabId === 'tab-koordinat' && typeof renderCoordinatesTable === 'function') {
        renderCoordinatesTable();
      }
      if (tabId === 'tab-search' && typeof initWilayahDropdowns === 'function') {
        initWilayahDropdowns();
      }
    }

    var lastHoverCoords = { lat: -6.1884, lng: 106.8320 };
    var headerCopyFlip = false;

    function toggleSidebar() {
      const sidebar = document.getElementById('sidebar');
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        toggleMobileSidebar();
      } else {
        sidebar.classList.toggle('collapsed');
        const fab = document.getElementById('mapSidebarFab');
        if (fab) {
          fab.style.display = sidebar.classList.contains('collapsed') ? 'flex' : 'none';
        }
        setTimeout(() => map && map.invalidateSize(), 300);
      }
    }
    function copyActiveCoord(format) {
      if (!format) format = "YX";
      format = format.toUpperCase();
      let lat = activePinData?.lat;
      let lng = activePinData?.lng;
      if (lat === undefined || lng === undefined) {
        lat = lastHoverCoords.lat;
        lng = lastHoverCoords.lng;
      }
      const sLat = lat.toFixed(6);
      const sLng = lng.toFixed(6);
      const val = format === 'XY' ? `${sLng}, ${sLat}` : `${sLat}, ${sLng}`;
      const desc = format === 'XY' ? `X, Y (Longitude, Latitude): ${val}` : `Y, X (Latitude, Longitude): ${val}`;
      navigator.clipboard.writeText(val).then(() => {
        showToast(`Tersalin ${desc}`, 'success');
      }).catch(() => {
        showToast(`Koordinat: ${val}`, 'info');
      });
    }
    function readUrlLocationParams() {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get('open') === 'member' || searchParams.get('action') === 'login') {
        setTimeout(() => {
          openMemberModal();
        }, 350);
      }
      let lat = null, lng = null, zoom = null;
      const rawHash = window.location.hash.replace('#', '');
      const params = new URLSearchParams(rawHash || window.location.search);
      if (params.has('lat') && params.has('lng')) {
        lat = parseFloat(params.get('lat'));
        lng = parseFloat(params.get('lng'));
        zoom = params.has('z') ? parseInt(params.get('z')) : 19;
      }
      if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
        setTimeout(() => {
          map.setView([lat, lng], zoom || 19);
          handleMapClick(lat, lng, true);
        }, 500);
      }
    }

    function closeServerModal() {
      const modal = document.getElementById('serverModal');
      if (modal) modal.style.display = 'none';
    }

    setInterval(checkProxyHealth, 4000);
        function initSidebarResizer() {
      const sidebar = document.getElementById('sidebar');
      const resizer = document.getElementById('sidebarResizer');
      if (!sidebar || !resizer) return;

      const savedWidth = localStorage.getItem('sidebar_width_px');
      if (savedWidth) {
        const w = parseInt(savedWidth, 10);
        if (w >= 280 && w <= 700) {
          document.documentElement.style.setProperty('--sidebar-w', w + 'px');
        }
      }

      let isResizing = false;
      let startX = 0;
      let startWidth = 0;

      resizer.addEventListener('mousedown', function(e) {
        isResizing = true;
        startX = e.clientX;
        startWidth = sidebar.getBoundingClientRect().width;
        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
      });

      window.addEventListener('mousemove', function(e) {
        if (!isResizing) return;
        const diff = e.clientX - startX;
        let newWidth = Math.round(startWidth + diff);
        if (newWidth < 280) newWidth = 280;
        if (newWidth > 700) newWidth = 700;
        document.documentElement.style.setProperty('--sidebar-w', newWidth + 'px');
      });

      window.addEventListener('mouseup', function() {
        if (!isResizing) return;
        isResizing = false;
        resizer.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        const curW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'), 10);
        if (curW) {
          localStorage.setItem('sidebar_width_px', curW);
        }
        if (window.map) {
          window.map.invalidateSize();
        }
      });
    }

window.addEventListener('DOMContentLoaded', () => {
      initMap();
      initSupabase();
      if (typeof updateMemberUI === 'function') updateMemberUI();
      readUrlLocationParams();
      initSidebarResizer();
      if (window.location.protocol === 'file:') {
        const fileBanner = document.getElementById('fileProtocolBanner');
        if (fileBanner) fileBanner.style.display = 'flex';
      }
      if (window.innerWidth <= 768) {
        const fab = document.getElementById('mapSidebarFab');
        if (fab) fab.style.display = 'flex';
      }
    });
