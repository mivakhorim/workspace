(function initSecurityShield() {
      const _a = ['Z2Vvc3Bhc2kuZHV0YW1pay5pZA==', 'ZHV0YW1pay5pZA==', 'Z2l0aHViLmlv', 'bG9jYWxob3N0', 'MTI3LjAuMC4x'].map(function(s) {
        try { return atob(s); } catch (e) { return ''; }
      });
      const _h = window.location.hostname;
      const isFile = !_h || window.location.protocol === 'file:';
      const isAllowedHost = _a.some(function(d) {
        return _h === d || _h.endsWith('.' + d);
      });

      if (!isFile && !isAllowedHost) {
        function displayBlockNotice() {
          document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc;color:#0f172a;font-family:system-ui,sans-serif;text-align:center;padding:24px;"><div style="background:#ffffff;padding:32px;border-radius:8px;border:1px solid #cbd5e1;max-width:480px;box-shadow:0 4px 12px rgba(0,0,0,0.05);"><h1 style="font-size:1.6rem;margin:0 0 12px;font-weight:800;color:#0f172a;">403 AKSES TIDAK DIIZINKAN</h1><p style="color:#64748b;margin:0 0 24px;font-size:0.9rem;line-height:1.5;">Aplikasi ini dilindungi oleh Domain Lock resmi Duta Digital Agensi.<br>Penggunaan di luar domain resmi dilarang keras.</p><a href="https://geospasi.dutamik.id" style="display:inline-block;padding:10px 22px;background:#0284c7;color:#ffffff;text-decoration:none;font-weight:700;border-radius:4px;">Kunjungi Domain Resmi</a></div></div>';
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', displayBlockNotice);
        } else {
          displayBlockNotice();
        }
        throw new Error('403: Security Access Denied');
      }
    })();

    window._dgKey = 0x7E3A9;

    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str).replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
      });
    }

    var map = null;
    var persilLayer = null;
    var baseLayers = {};
    var currentBaseLayer = null;
    var drawnItems = null;
    var drawControl = null;
    var isDrawingPolygon = false;
    var isParcelLocked = false;
    var snapEnabled = true;
    var snapMarker = null;
    var currentSnapPoint = null;
    var customDrawPoints = [];
    var customDrawUndoStack = [];
    var customDrawLayer = null;
    var customDrawMarkers = [];
    var isProxyActive = false;
    var activePinMarker = null;
    var activePinData = null;
    var activePinPolygon = null;
    var highlightParcelPolygon = null;

    var activeVertices = [];
    var activeMultiParts = null;
    var activePolygonLayer = null;
    var vertexMarkers = [];
    var vertexAddMarkers = [];
    var edgeDistMarkers = [];
    var rawInitialBboxCoords = null;
    var currentRotationAngle = 0;
    var customPois = [];
    var isAddingPoi = false;
    var poiMarkersMap = new Map();
    var customUploadedIconDataUrl = null;
    var isMergeMode = false;
    var mergeParcelsList = [];
    var mergePreviewLayers = [];

    var DEFAULT_LAT = -6.1884;
    var DEFAULT_LON = 106.8320;
    var DEFAULT_ZOOM = 17;

    var isFreeDeleteVertexMode = false;
    var persilFetchSeq = 0;
    var persilClientCache = new Map();
    var currentAttrTab = 'oss';
    var lastHoverCoords = { lat: -6.1884, lng: 106.8320 };
    var headerCopyFlip = false;
    var cekingLayers = { hutan: null, lsd: null, lbs: null, peruntukan: null, rtrw: null, jalan: null };
    var ArcGisExportLayer = null;
    var SUPABASE_PROJECT_URL = 'https://vezruyffzmabhtylxigc.supabase.co';
    var SUPABASE_ANON_KEY = localStorage.getItem('supabase_anon_key') || 'sb_publishable_NBReVvac6_FUBe969fLbOw_ZGZjcwKM';
    var GOOGLE_CLIENT_ID = localStorage.getItem('google_client_id') || '194944801134-etvtpajb04e1jdkrmiv07sjupsqul29p.apps.googleusercontent.com';
    var supabaseClient = null;
    var currentMemberSession = null;
    var _memberSecureState = { role: 'free', status: 'none', email: '', name: '', expires_at: null };
    var currentPaymentDetails = { baseAmount: 75000, uniqueCode: 100, totalAmount: 75100 };
    var wilayahHierarchyData = null;
    var wilayahHighlightMarker = null;
    var kelurahanHighlightLayer = null;
    var quickWilayahTimer = null;
    var isWilayahDropdownsLoaded = false;
    var currentSelectedWilayah = null;
    var cacheProvinsi = [];
    var cacheKabupaten = new Map();
    var cacheKecamatan = new Map();
    var cacheDesa = new Map();


    function downloadFile(content, fileName, mimeType) {
      const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 200);
    }


    function showToast(message, type = 'info', duration = 2600) {
      const container = document.getElementById('toastContainer');
      if (!container) return;
      const toast = document.createElement('div');
      toast.className = `toast-message ${type}`;
      let icon = '';
      if (type === 'success') {
        icon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:var(--emerald);flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg>';
      } else if (type === 'warn') {
        icon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:var(--amber);flex-shrink:0;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      } else if (type === 'error') {
        icon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:var(--crimson);flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
      } else {
        icon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--accent);flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
      }
      toast.innerHTML = `${icon}<span>${message}</span>`;
      container.appendChild(toast);
      setTimeout(() => {
        toast.style.animation = 'toastSlideOut 0.25s ease forwards';
        setTimeout(() => toast.remove(), 250);
      }, duration);
    }

    function isPointInsideOrNearPolygon(ptLat, ptLng, polyCoords, toleranceMeters = 0.8) {
      if (!polyCoords || polyCoords.length < 3) return false;
      let inside = false;
      for (let i = 0, j = polyCoords.length - 1; i < polyCoords.length; j = i++) {
        const xi = polyCoords[i].lng, yi = polyCoords[i].lat;
        const xj = polyCoords[j].lng, yj = polyCoords[j].lat;
        const intersect = ((yi > ptLat) !== (yj > ptLat)) && (ptLng < (xj - xi) * (ptLat - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      if (inside) return true;
      for (let i = 0, j = polyCoords.length - 1; i < polyCoords.length; j = i++) {
        const p1 = polyCoords[i];
        const p2 = polyCoords[j];
        const midLat = (p1.lat + p2.lat) * 0.5;
        const cosLat = Math.cos(midLat * Math.PI / 180);
        const px = ptLng * 111320 * cosLat;
        const py = ptLat * 111320;
        const ax = p1.lng * 111320 * cosLat;
        const ay = p1.lat * 111320;
        const bx = p2.lng * 111320 * cosLat;
        const by = p2.lat * 111320;
        const abx = bx - ax;
        const aby = by - ay;
        const lenSq = abx * abx + aby * aby;
        let dist = 999999;
        if (lenSq === 0) {
          dist = Math.hypot(px - ax, py - ay);
        } else {
          let t = ((px - ax) * abx + (py - ay) * aby) / lenSq;
          t = Math.max(0, Math.min(1, t));
          dist = Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
        }
        if (dist <= toleranceMeters) return true;
      }
      return false;
    }

    function distancePointToPolygonMeters(lat, lng, coords) {
      if (!coords || coords.length < 3) return Infinity;
      if (isPointInsideOrNearPolygon(lat, lng, coords, 0.5)) return 0;
      let minDist = Infinity;
      const n = coords.length;
      for (let i = 0; i < n; i++) {
        const p1 = coords[i];
        const p2 = coords[(i + 1) % n];
        const midLat = (p1.lat + p2.lat) * 0.5;
        const cosLat = Math.cos(midLat * Math.PI / 180);
        const px = lng * 111320 * cosLat;
        const py = lat * 111320;
        const ax = p1.lng * 111320 * cosLat;
        const ay = p1.lat * 111320;
        const bx = p2.lng * 111320 * cosLat;
        const by = p2.lat * 111320;
        const abx = bx - ax;
        const aby = by - ay;
        const lenSq = abx * abx + aby * aby;
        let dist = Infinity;
        if (lenSq === 0) {
          dist = Math.hypot(px - ax, py - ay);
        } else {
          let t = ((px - ax) * abx + (py - ay) * aby) / lenSq;
          t = Math.max(0, Math.min(1, t));
          dist = Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
        }
        if (dist < minDist) minDist = dist;
      }
      return minDist;
    }

    function parseGeoServerPersilGeoJson(data, clickLat, clickLng) {
      if (!data || !Array.isArray(data.features) || data.features.length === 0) {
        return null;
      }
      let chosenFeat = null;
      let chosenCoords = null;
      let bestDist = Infinity;
      let foundExact = false;

      for (const feat of data.features) {
        const geom = feat.geometry;
        if (!geom) continue;
        let rings = [];
        if (geom.type === 'Polygon' && Array.isArray(geom.coordinates) && geom.coordinates.length > 0) {
          rings = [geom.coordinates[0]];
        } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates) && geom.coordinates.length > 0) {
          rings = geom.coordinates.map(c => c[0]);
        }
        for (const ring of rings) {
          if (!ring || ring.length < 3) continue;
          const coords = ring.map(pt => {
            const unproj = L.CRS.EPSG3857.unproject(L.point(pt[0], pt[1]));
            return { lat: Number(unproj.lat.toFixed(7)), lng: Number(unproj.lng.toFixed(7)) };
          });
          if (coords.length > 1) {
            const first = coords[0];
            const last = coords[coords.length - 1];
            if (Math.abs(first.lat - last.lat) < 0.0000005 && Math.abs(first.lng - last.lng) < 0.0000005) {
              coords.pop();
            }
          }
          if (coords.length < 3) continue;

          if (isPointInsideOrNearPolygon(clickLat, clickLng, coords, 0.5)) {
            chosenFeat = feat;
            chosenCoords = coords;
            foundExact = true;
            break;
          }
          const d = distancePointToPolygonMeters(clickLat, clickLng, coords);
          if (d <= 35.0 && d < bestDist) {
            bestDist = d;
            chosenFeat = feat;
            chosenCoords = coords;
          }
        }
        if (foundExact) break;
      }

      if (!chosenFeat || !chosenCoords || chosenCoords.length < 3) {
        return null;
      }

      const props = chosenFeat.properties || {};
      const nib = props.nib ? String(props.nib).trim() : '-';
      const tipeHak = props.tipehak ? String(props.tipehak).trim() : 'Hak Milik';
      const calcArea = Math.round(calculatePolygonArea(chosenCoords));
      const luasM2 = props.luas && Number(props.luas) > 0 ? Number(props.luas) : calcArea;
      const nomorHak = props.nomor ? String(props.nomor).trim() : '-';
      const tahun = props.tahun ? String(props.tahun).trim() : '2026';

      return {
        found: true,
        is_official_cadastre: true,
        is_auto_traced: false,
        nib: nib,
        tipe_hak: tipeHak,
        luas_m2: luasM2,
        nomor_hak: nomorHak,
        tahun: tahun,
        fid: chosenFeat.id || '-',
        polygon_coords: chosenCoords,
        bbox_coords: chosenCoords,
        status_validasi: 'Kadaster Resmi Presisi',
        source: 'ATLAS GEOSERVER'
      };
    }

    function toDMS(lat, lng) {
      function conv(val, posChar, negChar) {
        const dir = val >= 0 ? posChar : negChar;
        const abs = Math.abs(val);
        const deg = Math.floor(abs);
        const minFloat = (abs - deg) * 60;
        const min = Math.floor(minFloat);
        const sec = ((minFloat - min) * 60).toFixed(2);
        return `${deg}° ${min}' ${sec}" ${dir}`;
      }
      return `${conv(lat, 'LU', 'LS')}, ${conv(lng, 'BT', 'BB')}`;
    }

    function getUtmZone(lat, lng) {
      const zoneNum = Math.floor((lng + 180) / 6) + 1;
      const hemi = lat >= 0 ? 'N' : 'S';
      return `Zona ${zoneNum}${hemi} (WGS 84)`;
    }

        function getUtmCoordinates(lat, lng) {
      const u = latLngToUtm(lat, lng);
      return {
        x: u.easting,
        y: u.northing,
        easting: u.easting,
        northing: u.northing,
        zone: u.zone
      };
    }

function latLngToUtm(lat, lon) {
      const a = 6378137.0;
      const f = 1 / 298.257223563;
      const k0 = 0.9996;
      const e = Math.sqrt(2 * f - f * f);
      const ePrime2 = (e * e) / (1 - e * e);
      const zone = Math.floor((lon + 180) / 6) + 1;
      const lonOrigin = (zone - 1) * 6 - 180 + 3;
      const lonOriginRad = lonOrigin * Math.PI / 180;
      const latRad = lat * Math.PI / 180;
      const lonRad = lon * Math.PI / 180;
      const N = a / Math.sqrt(1 - e * e * Math.sin(latRad) * Math.sin(latRad));
      const T = Math.tan(latRad) * Math.tan(latRad);
      const C = ePrime2 * Math.cos(latRad) * Math.cos(latRad);
      const A = Math.cos(latRad) * (lonRad - lonOriginRad);
      const M = a * ((1 - e * e / 4 - 3 * e * e * e * e / 64 - 5 * e * e * e * e * e * e / 256) * latRad
        - (3 * e * e / 8 + 3 * e * e * e * e / 32 + 45 * e * e * e * e * e * e / 1024) * Math.sin(2 * latRad)
        + (15 * e * e * e * e / 256 + 45 * e * e * e * e * e * e / 1024) * Math.sin(4 * latRad)
        - (35 * e * e * e * e * e * e / 3072) * Math.sin(6 * latRad));
      let utmEasting = k0 * N * (A + (1 - T + C) * A * A * A / 6
        + (5 - 18 * T + T * T + 72 * C - 58 * ePrime2) * A * A * A * A * A / 120) + 500000.0;
      let utmNorthing = k0 * (M + N * Math.tan(latRad) * (A * A / 2
        + (5 - T + 9 * C + 4 * C * C) * A * A * A * A / 24
        + (61 - 58 * T + T * T + 600 * C - 330 * ePrime2) * A * A * A * A * A * A / 720));
      if (lat < 0) {
        utmNorthing += 10000000.0;
      }
      return { zone: zone + (lat >= 0 ? 'N' : 'S'), easting: Math.round(utmEasting), northing: Math.round(utmNorthing) };
    }

    function calculatePolygonArea(coords) {
      const radius = 6378137;
      const len = coords.length;
      if (len < 3) return 0;
      let total = 0;
      for (let i = 0; i < len; i++) {
        const p1 = coords[i];
        const p2 = coords[(i + 1) % len];
        total += (p2.lng - p1.lng) * (Math.PI / 180) * (2 + Math.sin(p1.lat * (Math.PI / 180)) + Math.sin(p2.lat * (Math.PI / 180)));
      }
      return Math.abs(total * radius * radius / 2.0);
    }

    function calculatePolygonPerimeter(coords) {
      let total = 0;
      const len = coords.length;
      for (let i = 0; i < len; i++) {
        total += coords[i].distanceTo(coords[(i + 1) % len]);
      }
      return total;
    }

    function formatAreaM2(val) {
      const num = Number(val) || 0;
      return num.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' m²';
    }

    function formatAreaHa(val) {
      const num = (Number(val) || 0) / 10000.0;
      return num.toLocaleString('id-ID', { minimumFractionDigits: 6, maximumFractionDigits: 6 }) + ' ha';
    }

    function roundArea2(val) {
      return Number((Number(val) || 0).toFixed(2));
    }

    function roundAreaHa6(val) {
      return Number(((Number(val) || 0) / 10000.0).toFixed(6));
    }

    function updateShpLuasDisplay() {
      const el = document.getElementById('shpLuasHa') || document.getElementById('shpLuas');
      if (!el) return;
      let areaM2 = 0;
      if (activeMultiParts && activeMultiParts.length > 1) {
        areaM2 = activeMultiParts.reduce((sum, p) => sum + calculatePolygonArea(p), 0);
      } else if (activeVertices && activeVertices.length >= 3) {
        areaM2 = calculatePolygonArea(activeVertices);
      } else if (typeof drawnItems !== 'undefined') {
        drawnItems.eachLayer(l => {
          if (l instanceof L.Polygon || l instanceof L.Rectangle) {
            const pts = l.getLatLngs()[0];
            if (pts && pts.length >= 3) areaM2 += calculatePolygonArea(pts);
          }
        });
      }
      el.value = `${formatAreaM2(areaM2)} (${formatAreaHa(areaM2)})`;
    }

    
    function ensureActiveVerticesFromDraw() {
      if ((!activeVertices || activeVertices.length < 3) && typeof drawnItems !== 'undefined') {
        const layers = drawnItems.getLayers();
        for (let l of layers) {
          if (l instanceof L.Polygon || l instanceof L.Rectangle) {
            const latlngs = l.getLatLngs()[0];
            if (latlngs && latlngs.length >= 3) {
              activeVertices = latlngs.map(pt => ({ lat: pt.lat, lng: pt.lng }));
              renderCanvasPolygon(true);
              break;
            }
          }
        }
      }
    }

    var printMapInstance = null;
    var printInsetInstance = null;

    function toDmsString(deg, isLng) {
      const absDeg = Math.abs(deg);
      const d = Math.floor(absDeg);
      const m = Math.floor((absDeg - d) * 60);
      const s = Math.round(((absDeg - d) * 60 - m) * 60);
      const hemi = isLng ? (deg >= 0 ? 'E' : 'W') : (deg >= 0 ? 'N' : 'S');
      return `${d}°${m}'${s}"${hemi}`;
    }

    function getNiceDmsStep(degSpan, targetCount = 4) {
      const secSpan = degSpan * 3600;
      const rawSecStep = secSpan / targetCount;
      const steps = [1, 2, 5, 10, 15, 20, 30, 60, 120, 300, 600, 1800, 3600];
      for (let s of steps) {
        if (s >= rawSecStep) return s / 3600;
      }
      return steps[steps.length - 1] / 3600;
    }

    function toDecimalDegreeString(deg, isLng) {
      if (isNaN(deg)) return '-';
      const dir = isLng ? (deg >= 0 ? 'E' : 'W') : (deg >= 0 ? 'S' : 'N');
      return Math.abs(deg).toFixed(5) + '°' + dir;
    }

    function getNiceDegreeStep(degSpan, targetCount = 4) {
      const rough = degSpan / (targetCount || 4);
      const steps = [
        0.0001, 0.0002, 0.00025, 0.0005,
        0.001, 0.002, 0.0025, 0.005,
        0.01, 0.02, 0.025, 0.05,
        0.1, 0.2, 0.25, 0.5, 1.0
      ];
      for (let s of steps) {
        if (s >= rough) return s;
      }
      return steps[steps.length - 1];
    }

    function getStandardScale(rawRatio) {
      const std = [100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000, 5000, 7500, 10000, 15000, 20000, 25000, 50000];
      for (let s of std) {
        if (s >= rawRatio * 0.95) return s;
      }
      return std[std.length - 1];
    }

    function getExactZoomForScale(scale, lat) {
      const metersPerPx = scale * 0.0002645833333333333;
      return Math.log2((156543.03392 * Math.cos(lat * Math.PI / 180)) / metersPerPx);
    }
    function isMobileDevice() {
      return (
        (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) && !/iPad|Tablet/i.test(navigator.userAgent)) ||
        (window.innerWidth <= 700)
      );
    }

    window.initSupabase = function() {};
    window.ensureSupabaseClient = function() { return null; };
    window.initGoogleIdentityServices = function() {};
    window.handleGoogleSignInResponse = function() {};
    window.configureGoogleClientId = function() {};
    window.loginWithGoogle = function() { showToast('Layanan otentikasi sedang offline.', 'warn'); };
    window.fallbackGoogleOAuthRedirect = function() { showToast('Layanan otentikasi sedang offline.', 'warn'); };
    window.logoutMember = function() {};
    window.fetchMemberProfile = function() { return Promise.resolve(null); };
    window.verifyProLicenseIntegrity = function() { return false; };
    window.updateMemberUI = function() {
      const isPro = (typeof isMemberProActive === 'function') ? isMemberProActive() : false;
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
      }
    };
    window.openMemberModal = function() { showToast('Layanan akun sedang offline.', 'info'); };
    window.closeMemberModal = function() {
      const m = document.getElementById('modalMember');
      if (m) m.style.display = 'none';
    };
    window.generateQrisPayment = function() { showToast('Sistem pembayaran sedang offline.', 'warn'); };
    window.savePendingPaymentRecord = function() { return Promise.resolve(); };
    window.openQrisPaymentModal = function() {};
    window.closeQrisPaymentModal = function() {
      const q = document.getElementById('modalQrisPayment');
      if (q) q.style.display = 'none';
    };
    window.copyQrisAmount = function() {};
    window.confirmPaymentWhatsApp = function() {};
    window.checkPaymentStatusLive = function() {};
    window.cancelAndClearCurrentPendingPayment = function() {};
    window.isMemberProActive = function() { return false; };
    window.currentMemberProfile = function() {
      return { role: 'free', status: 'none', email: '', name: '', expires_at: null };
    };
    window.loadTestParcel = function() {};
    window.clearTestParcel = function() {};
    window.handlePrintMapTrigger = function() {};
    window.processDirectMobilePdfPrint = function() {};
    window.formatAreaM2 = formatAreaM2;
    window.formatAreaHa = formatAreaHa;
    window.roundArea2 = roundArea2;
    window.roundAreaHa6 = roundAreaHa6;

