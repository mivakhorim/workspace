function createPolygonFromBatchCoords() {
      const raw = document.getElementById('batchCoordsInput')?.value.trim();
      if (!raw) {
        showToast('Masukkan daftar koordinat terlebih dahulu.', 'warn');
        return;
      }
      const lines = raw.split(/\r?\n/);
      const pts = [];
      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx].trim();
        if (!line || line.startsWith('#') || line.startsWith('//')) continue;
        const parts = line.split(/[,\s\t;]+/).filter(Boolean);
        if (parts.length >= 2) {
          let v1 = parseFloat(parts[0]);
          let v2 = parseFloat(parts[1]);
          if (isNaN(v1) || isNaN(v2)) continue;
          let lat, lng;
          if (Math.abs(v1) <= 90 && Math.abs(v2) <= 180) {
            if (v1 > 50 && v2 < 20) {
              lng = v1; lat = v2;
            } else {
              lat = v1; lng = v2;
            }
          } else {
            continue;
          }
          pts.push({ lat, lng });
        }
      }
      if (pts.length < 3) {
        showToast('Dibutuhkan minimal 3 titik koordinat valid untuk membentuk poligon bidang.', 'warn');
        return;
      }
      if (pts[0].lat === pts[pts.length - 1].lat && pts[0].lng === pts[pts.length - 1].lng) {
        pts.pop();
      }
      if (pts.length < 3) {
        showToast('Titik koordinat tidak membentuk bidang (kurang dari 3 titik unik).', 'warn');
        return;
      }
      activeVertices = pts;
      activeMultiParts = [pts];
      activePinData = {
        identifikasi: 'DIGITASI-MANDIRI',
        tipe: 'HAK MILIK / PERIZINAN',
        luas_bpn: Math.round(calculatePolygonArea(pts)),
        luas_ukur: Math.round(calculatePolygonArea(pts)),
        desa: '-',
        kecamatan: '-',
        kabkot: '-',
        provinsi: '-'
      };
      renderCanvasPolygon(true);
      if (activePolygonLayer) {
        map.fitBounds(activePolygonLayer.getBounds(), { padding: [40, 40] });
      }
      const areaM2 = calculatePolygonArea(pts);
      const shpLuas = document.getElementById('shpLuas');
      if (shpLuas) shpLuas.value = (areaM2 / 10000.0).toFixed(6);
      const valLuasM2 = document.getElementById('valLuasM2');
      if (valLuasM2) valLuasM2.innerText = formatAreaM2(areaM2);
      const valLuasHa = document.getElementById('valLuasHa');
      if (valLuasHa) valLuasHa.innerText = formatAreaHa(areaM2);
      showToast(`Poligon berhasil dibentuk dari ${pts.length} titik patok dan siap diekspor!`, 'success');
      syncActivePolygonPanel();
      updateCoordsTable();
      switchTab('tab-bidang');
    }

    function startDelineasiMandiriAtClick() {
      if (!activePinMarker) {
        showToast('Tentukan titik patok terlebih dahulu pada peta.', 'warn');
        return;
      }
      const latlng = activePinMarker.getLatLng();
      const lat = latlng.lat, lng = latlng.lng;
      const deltaLat = 0.000070;
      const deltaLng = 0.000070 / Math.cos(lat * Math.PI / 180);
      const manualBox = [
        { lat: +(lat + deltaLat).toFixed(7), lng: +(lng - deltaLng).toFixed(7) },
        { lat: +(lat + deltaLat).toFixed(7), lng: +(lng + deltaLng).toFixed(7) },
        { lat: +(lat - deltaLat).toFixed(7), lng: +(lng + deltaLng).toFixed(7) },
        { lat: +(lat - deltaLat).toFixed(7), lng: +(lng - deltaLng).toFixed(7) }
      ];
      const estArea = Math.round(calculatePolygonArea(manualBox));
      activePinData = activePinData || {};
      activePinData.lat = lat;
      activePinData.lng = lng;
      activePinData.luas_m2 = estArea;
      activePinData.tipe_hak = 'Delineasi Mandiri';
      rawInitialBboxCoords = manualBox;
      initCanvasRebuilder(lat, lng, estArea, manualBox);
      const notFoundBox = document.getElementById('persilNotFoundBox');
      const foundBox = document.getElementById('persilFoundBox');
      if (notFoundBox) notFoundBox.style.display = 'none';
      if (foundBox) foundBox.style.display = 'flex';
      const badge = document.getElementById('badgeRebuildStatus');
      if (badge) {
        badge.className = 'badge-pill yellow';
        badge.innerText = 'Delineasi Mandiri';
      }
      showToast('Mode delineasi mandiri aktif. Geser titik sudut patok untuk menyesuaikan bentuk bidang.', 'success');
    }

    function copyBidangIdentitas() {
      const fid = activePinData?.fid;
      if (!fid || fid === '-') {
        showToast('Data identifikasi belum tersedia pada bidang ini.', 'warn');
        return;
      }
      navigator.clipboard.writeText(fid).then(() => {
        showToast('Data bidang berhasil disalin!', 'success');
      });
    }

    function copyBidangData() {
      if (!activePinData) {
        showToast('Pilih bidang tanah pada peta terlebih dahulu.', 'warn');
        return;
      }
      const summary = `DATA RESMI BIDANG TANAH KADASTRAL

Tipe Hak: ${activePinData.tipe_hak}
Luas Terdaftar: ${Math.round(activePinData.luas_m2).toLocaleString('id-ID')} m²
Desa: ${activePinData.desa}
Kecamatan: ${activePinData.kecamatan}
Kabupaten: ${activePinData.kabkot}
Provinsi: ${activePinData.provinsi}
Kode Pos: ${activePinData.kodepos || '-'}
Kantah: ${activePinData.kantah}
Koordinat: ${activePinData.lat.toFixed(6)}, ${activePinData.lng.toFixed(6)}`;

      navigator.clipboard.writeText(summary).then(() => {
        showToast('Data lengkap bidang tanah berhasil disalin ke clipboard!', 'success');
      });
    }

    function removeActivePin() {
      if (isDrawingPolygon) {
        cancelCustomPolygonDraw();
      }
      if (isMergeMode) {
        cancelMergeMode();
      }
      if (activePinMarker) {
        map.removeLayer(activePinMarker);
        activePinMarker = null;
      }
      clearCanvasRebuilderLayers();
      isParcelLocked = false;
      activePinData = null;

      const noPin = document.getElementById('noPinAlert');
      const foundBox = document.getElementById('persilFoundBox');
      const notFoundBox = document.getElementById('persilNotFoundBox');
      const loadingBox = document.getElementById('persilLoadingBox');

      if (noPin) noPin.style.display = 'block';
      if (foundBox) foundBox.style.display = 'none';
      if (notFoundBox) notFoundBox.style.display = 'none';
      if (loadingBox) loadingBox.style.display = 'none';

      const hud = document.getElementById('canvasHud');
      if (hud) hud.style.display = 'none';
      showToast('Pilihan bidang dibatalkan. Peta siap untuk memilih atau mendigitasi bidang baru.', 'info');
    }

    function shrinkActivePolygon(pct = 0.04) {
      if (!activeVertices || activeVertices.length < 3) return;
      const cx = activeVertices.reduce((s, v) => s + v.lng, 0) / activeVertices.length;
      const cy = activeVertices.reduce((s, v) => s + v.lat, 0) / activeVertices.length;
      const factor = 1.0 - pct;
      activeVertices = activeVertices.map(v => ({
        lat: cy + (v.lat - cy) * factor,
        lng: cx + (v.lng - cx) * factor
      }));
      renderCanvasPolygon(true);
    }

    function expandActivePolygon(pct = 0.04) {
      shrinkActivePolygon(-pct);
    }

    function snapToPersilBorder() {
      if (rawInitialBboxCoords && rawInitialBboxCoords.length >= 4) {
        activeVertices = rawInitialBboxCoords.map(c => ({ lat: c.lat, lng: c.lng }));
        renderCanvasPolygon(true);
      }
    }

    function clearCanvasRebuilderLayers() {
      isParcelLocked = false;
      activeMultiParts = null;
      if (activePolygonLayer) {
        map.removeLayer(activePolygonLayer);
        activePolygonLayer = null;
      }
      activeVertices = [];
      vertexMarkers.forEach(m => map.removeLayer(m));
      vertexMarkers = [];
      vertexAddMarkers.forEach(m => map.removeLayer(m));
      vertexAddMarkers = [];
      edgeDistMarkers.forEach(m => map.removeLayer(m));
      edgeDistMarkers = [];
      const tb = document.getElementById('mapPrecisionToolbar');
      if (tb) tb.style.display = 'none';
      if (typeof renderCoordinatesTable === 'function') renderCoordinatesTable();
    }

    function cleanAndDeduplicateVertices(coords, minMeters = 1.5, maxDeg = 14.0) {
      if (!coords || coords.length < 3) return coords;
      let pts = coords.map(p => Array.isArray(p) ? { lat: p[1], lng: p[0] } : { lat: p.lat, lng: p.lng });
      if (pts.length > 1 && Math.abs(pts[0].lat - pts[pts.length - 1].lat) < 0.000001 && Math.abs(pts[0].lng - pts[pts.length - 1].lng) < 0.000001) {
        pts.pop();
      }

      let changed = true;
      while (changed && pts.length > 3) {
        changed = false;
        const n = pts.length;
        for (let i = 0; i < n; i++) {
          const p1 = pts[i];
          const p2 = pts[(i + 1) % n];
          const dlat = (p1.lat - p2.lat) * 111320;
          const midLat = (p1.lat + p2.lat) * 0.5;
          const dlng = (p1.lng - p2.lng) * (111320 * Math.cos(midLat * Math.PI / 180));
          const dist = Math.sqrt(dlat * dlat + dlng * dlng);
          if (dist < minMeters) {
            pts[i] = {
              lat: Number(((p1.lat + p2.lat) * 0.5).toFixed(7)),
              lng: Number(((p1.lng + p2.lng) * 0.5).toFixed(7))
            };
            pts.splice((i + 1) % n, 1);
            changed = true;
            break;
          }
        }
      }

      changed = true;
      while (changed && pts.length > 3) {
        changed = false;
        const n = pts.length;
        for (let i = 0; i < n; i++) {
          const pPrev = pts[(i - 1 + n) % n];
          const pCurr = pts[i];
          const pNext = pts[(i + 1) % n];
          const cosLat = Math.cos(pCurr.lat * Math.PI / 180);
          const v1x = (pCurr.lng - pPrev.lng) * cosLat;
          const v1y = pCurr.lat - pPrev.lat;
          const v2x = (pNext.lng - pCurr.lng) * cosLat;
          const v2y = pNext.lat - pCurr.lat;
          const dot = v1x * v2x + v1y * v2y;
          const cross = v1x * v2y - v1y * v2x;
          const angleDeg = Math.abs(Math.atan2(cross, dot) * 180 / Math.PI);
          if (angleDeg < maxDeg || Math.abs(180 - angleDeg) < maxDeg) {
            pts.splice(i, 1);
            changed = true;
            break;
          }
        }
      }
      return pts;
    }

    function cleanActiveVerticesManual() {
      if (!activeVertices || activeVertices.length < 3) return;
      const countBefore = activeVertices.length;
      activeVertices = cleanAndDeduplicateVertices(activeVertices, 1.8, 15.0);
      const countAfter = activeVertices.length;
      renderCanvasPolygon(true);
      if (typeof renderCoordinatesTable === 'function') renderCoordinatesTable();
      if (countBefore !== countAfter) {
        showToast(`Berhasil merapikan patok. ${countBefore - countAfter} titik sudut ganda dibersihkan.`, 'success');
      } else {
        showToast(`Seluruh ${countAfter} titik patok sudah presisi tanpa titik ganda.`, 'info');
      }
    }

    function initCanvasRebuilder(centerLat, centerLng, targetAreaM2 = 60, rawBboxCoords = null) {
      clearCanvasRebuilderLayers();
      currentRotationAngle = 0;

      if (!rawBboxCoords || rawBboxCoords.length < 3) {
        return;
      }

      let pts = rawBboxCoords;
      activeVertices = pts.map(p => Array.isArray(p) ? { lat: p[1], lng: p[0] } : { lat: p.lat, lng: p.lng });
      activeVertices = cleanAndDeduplicateVertices(activeVertices, 0.25, 4.0);

      const toolbar = document.getElementById('mapPrecisionToolbar');
      if (toolbar) toolbar.style.display = 'flex';

      renderCanvasPolygon(true);
    }

    function rotateActivePolygon(deg) {
      if (!activeVertices || activeVertices.length < 3) return;
      currentRotationAngle = (currentRotationAngle + deg) % 360;
      const rad = deg * Math.PI / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);

      const cx = activeVertices.reduce((s, v) => s + v.lng, 0) / activeVertices.length;
      const cy = activeVertices.reduce((s, v) => s + v.lat, 0) / activeVertices.length;

      activeVertices = activeVertices.map(v => {
        const dx = (v.lng - cx) * Math.cos(cy * Math.PI / 180);
        const dy = v.lat - cy;
        const rx = dx * cosA - dy * sinA;
        const ry = dx * sinA + dy * cosA;
        return {
          lat: cy + ry,
          lng: cx + (rx / Math.cos(cy * Math.PI / 180))
        };
      });

      const rotLabel = document.getElementById('rotDegLabel');
      if (rotLabel) rotLabel.innerText = `${currentRotationAngle}°`;
      renderCanvasPolygon(true);
    }

    var isFreeDeleteVertexMode = false;
    function toggleFreeDeleteVertexMode() {
      isFreeDeleteVertexMode = !isFreeDeleteVertexMode;
      const btn = document.getElementById('btnToggleFreeDelete');
      if (btn) {
        btn.classList.toggle('active', isFreeDeleteVertexMode);
        if (isFreeDeleteVertexMode) {
          showToast('Mode Hapus Patok Bebas Aktif: Klik langsung patok mana saja di peta untuk menghapusnya.', 'info');
        } else {
          showToast('Mode Hapus Patok Bebas dinonaktifkan.', 'info');
        }
      }
    }

    function removeVertexAt(idx) {
      if (activeVertices.length <= 3) {
        showToast('Poligon minimal membutuhkan 3 titik sudut patok.', 'warn');
        return;
      }
      activeVertices.splice(idx, 1);
      renderCanvasPolygon(true);
    }

    function renderCanvasPolygon(updateHandles = true) {
      if (!activeVertices || activeVertices.length < 3) return;
      syncActivePolygonPanel();
      
      let latlngs;
      let liveAreaM2;
      if (activeMultiParts && activeMultiParts.length > 1) {
        latlngs = activeMultiParts.map(part => part.map(v => [v.lat, v.lng]));
        liveAreaM2 = activeMultiParts.reduce((sum, part) => sum + calculatePolygonArea(part), 0);
      } else {
        latlngs = activeVertices.map(v => [v.lat, v.lng]);
        liveAreaM2 = calculatePolygonArea(activeVertices);
      }

      if (!activePolygonLayer) {
        activePolygonLayer = L.polygon(latlngs, {
          color: '#ea580c',
          weight: 3.5,
          fillColor: '#ea580c',
          fillOpacity: 0.15,
          interactive: false
        }).addTo(map);
      } else {
        activePolygonLayer.setLatLngs(latlngs);
        activePolygonLayer.setStyle({
          color: '#ea580c',
          weight: 3.5,
          fillColor: '#ea580c',
          fillOpacity: 0.15
        });
      }
      const liveAreaHa = liveAreaM2 / 10000;

      const liveM2El = document.getElementById('canvasLiveAreaM2');
      const liveHaEl = document.getElementById('canvasLiveAreaHa');
      if (liveM2El) liveM2El.innerText = formatAreaM2(liveAreaM2);
      const shpLuasEl = document.getElementById('shpLuasHa') || document.getElementById('shpLuas');
      if (shpLuasEl) shpLuasEl.value = `${(liveAreaM2 / 10000.0).toFixed(6)} Ha`;

      const elValM2 = document.getElementById('valLuasM2'); if (elValM2) elValM2.innerText = formatAreaM2(liveAreaM2);
      const elValHa = document.getElementById('valLuasHa'); if (elValHa) elValHa.innerText = formatAreaHa(liveAreaM2);
      const peri = calculatePolygonPerimeter(activeVertices.map(v => L.latLng(v.lat, v.lng)));
      const elValKel = document.getElementById('valKeliling'); if (elValKel) elValKel.innerText = `${peri.toFixed(2)} m`;
      const elValTitik = document.getElementById('valTitik'); if (elValTitik) elValTitik.innerText = activeVertices.length;

      const hudLive = document.getElementById('hudLiveArea');
      if (hudLive) hudLive.innerText = formatAreaM2(liveAreaM2);

      const targetBpnArea = activePinData?.luas_m2 || 0;
      if (targetBpnArea > 0) {
        const diff = liveAreaM2 - targetBpnArea;
        const pct = Math.max(0, 100 - (Math.abs(diff) / targetBpnArea * 100));
        const diffText = diff >= 0 ? `+${diff.toFixed(2)} m²` : `${diff.toFixed(2)} m²`;
        const diffPctEl = document.getElementById('diffPercentText');
        const diffBpnEl = document.getElementById('diffTargetBpnText');
        if (diffPctEl) diffPctEl.innerText = `${diffText} (Presisi: ${pct.toFixed(2)}%)`;
        if (diffBpnEl) diffBpnEl.innerText = formatAreaM2(targetBpnArea);
      }

      if (updateHandles) {
        renderVertexHandles();
        renderEdgeDistanceLabels();
      } else {
        updateEdgeDistancePositions();
      }
      if (activePolygonLayer && typeof activePolygonLayer.bringToBack === 'function') activePolygonLayer.bringToBack();
      if (activePinMarker && typeof activePinMarker.setZIndexOffset === 'function') activePinMarker.setZIndexOffset(1000);
      if (vertexMarkers && vertexMarkers.length > 0) vertexMarkers.forEach(m => { if (typeof m.setZIndexOffset === 'function') m.setZIndexOffset(2000); });
      if (vertexAddMarkers && vertexAddMarkers.length > 0) vertexAddMarkers.forEach(m => { if (typeof m.setZIndexOffset === 'function') m.setZIndexOffset(1500); });
      if (typeof renderCoordinatesTable === 'function') renderCoordinatesTable();
    }

    function renderVertexHandles() {
      vertexMarkers.forEach(m => map.removeLayer(m));
      vertexMarkers = [];
      vertexAddMarkers.forEach(m => map.removeLayer(m));
      vertexAddMarkers = [];

      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      const partPrefixes = ['A', 'B', 'C', 'D', 'E', 'F'];

      parts.forEach((partList, pIdx) => {
        const pfx = parts.length > 1 ? (partPrefixes[pIdx] || `P${pIdx+1}`) : 'P';
        const numPts = partList.length;

        partList.forEach((v, idx) => {
          const nodeLabel = parts.length > 1 ? `${pfx}${idx + 1}` : `P${idx + 1}`;
          const nodeIcon = L.divIcon({
            className: 'vertex-pin',
            html: `<div class="custom-vertex-node">${nodeLabel}</div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9]
          });

          const marker = L.marker([v.lat, v.lng], {
            icon: nodeIcon,
            draggable: true,
            zIndexOffset: 1000
          }).addTo(map);

          const popupContent = `
            <div style="font-family:'Inter',sans-serif;font-size:11px;padding:3px;min-width:130px;">
              <div style="font-weight:700;margin-bottom:3px;color:var(--text-main);display:flex;justify-content:space-between;">
                <span>Patok ${nodeLabel}</span>
                <span style="font-family:'JetBrains Mono',monospace;color:var(--text-muted);font-size:9.5px;">#${idx+1}</span>
              </div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;color:var(--text-sub);margin-bottom:5px;">
                ${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}
              </div>
              <div style="display:flex;flex-direction:column;gap:4px;">
                <div style="display:flex;align-items:center;gap:5px;font-size:9.5px;color:var(--text-sub);background:var(--bg-subtle);padding:4px 6px;border-radius:4px;border:1px solid var(--border-light);">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                  <span>Tahan &amp; geser patok di peta</span>
                </div>
                <button type="button" class="btn btn-outline" style="padding:3px 6px;font-size:10px;justify-content:center;width:100%;font-weight:600;color:var(--crimson);border-color:#fecdd3;" onclick="window.deleteVertexMarker(${pIdx}, ${idx})">
                  Hapus Patok ${nodeLabel}
                </button>
                ${parts.length > 1 ? `
                <button type="button" class="btn btn-outline" style="padding:3px 6px;font-size:9.5px;justify-content:center;width:100%;font-weight:600;color:#991b1b;border-color:#fca5a5;margin-top:2px;" onclick="window.deletePartEntirely(${pIdx})">
                  Hapus Sisa Garis / Bagian ${pfx}
                </button>` : ''}
              </div>
            </div>
          `;
          marker.bindPopup(popupContent, {
            offset: [0, -10],
            closeButton: false,
            className: 'vertex-action-popup'
          });
          marker.on('click', function(e) {
            if (isFreeDeleteVertexMode) {
              L.DomEvent.stopPropagation(e);
              window.deleteVertexMarker(pIdx, idx);
              return;
            }
          });
          marker.on('mouseover', function() {
            if (!isFreeDeleteVertexMode) this.openPopup();
          });

          marker.on('drag', function(e) {
            const pos = e.target.getLatLng();
            partList[idx] = { lat: pos.lat, lng: pos.lng };
            if (parts.length === 1) activeVertices[idx] = { lat: pos.lat, lng: pos.lng };
            renderCanvasPolygon(false);
          });

          marker.on('dragend', function() {
            renderCanvasPolygon(true);
          });

          marker.on('contextmenu', function(e) {
            L.DomEvent.stopPropagation(e);
            window.deleteVertexMarker(pIdx, idx);
          });

          vertexMarkers.push(marker);

          const nextIdx = (idx + 1) % numPts;
          const nextV = partList[nextIdx];
          const p1 = L.latLng(v.lat, v.lng);
          const p2 = L.latLng(nextV.lat, nextV.lng);
          const dist = p1.distanceTo(p2);

          const curZ = map.getZoom();
          const minAddDist = curZ >= 23 ? 0.6 : (curZ >= 20 ? 1.5 : 3.5);
          if (dist >= minAddDist) {
            const midLat = (v.lat + nextV.lat) / 2;
            const midLng = (v.lng + nextV.lng) / 2;

            const addIcon = L.divIcon({
              className: 'vertex-add',
              html: `<div class="custom-vertex-add">+</div>`,
              iconSize: [14, 14],
              iconAnchor: [7, 7]
            });

            const addMarker = L.marker([midLat, midLng], {
              icon: addIcon,
              zIndexOffset: 900
            }).addTo(map);

            addMarker.on('click', function(e) {
              L.DomEvent.stopPropagation(e);
              if (parts.length === 1) {
                activeVertices.splice(idx + 1, 0, { lat: midLat, lng: midLng });
              } else {
                partList.splice(idx + 1, 0, { lat: midLat, lng: midLng });
              }
              renderCanvasPolygon(true);
            });

            vertexAddMarkers.push(addMarker);
          }
        });
      });
    }

    function renderEdgeDistanceLabels() {
      edgeDistMarkers.forEach(m => map.removeLayer(m));
      edgeDistMarkers = [];

      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];

      parts.forEach(partList => {
        const numPts = partList.length;
        partList.forEach((v, idx) => {
          const nextV = partList[(idx + 1) % numPts];
          const p1 = L.latLng(v.lat, v.lng);
          const p2 = L.latLng(nextV.lat, nextV.lng);
          const dist = p1.distanceTo(p2);

          const curZ = map.getZoom();
          const minLabelDist = curZ >= 23 ? 0.4 : (curZ >= 20 ? 1.0 : 2.5);
          if (dist < minLabelDist) return;

          const midLat = (v.lat + nextV.lat) / 2;
          const midLng = (v.lng + nextV.lng) / 2;

          const labelIcon = L.divIcon({
            className: 'edge-dist',
            html: `<div class="edge-dist-tag">${dist.toFixed(2)} m</div>`,
            iconSize: [64, 22],
            iconAnchor: [32, 26]
          });

          const m = L.marker([midLat, midLng], {
            icon: labelIcon,
            interactive: false,
            zIndexOffset: 800
          }).addTo(map);

          edgeDistMarkers.push(m);
        });
      });
    }

    function updateEdgeDistancePositions() {
      renderEdgeDistanceLabels();
    }

    function findSharedEdgesAndLock(parcelsList, snapThresholdMeters = 3.5) {
      function distM(p1, p2) {
        const dlat = (p1.lat - p2.lat) * 111320;
        const midLat = (p1.lat + p2.lat) * 0.5;
        const dlng = (p1.lng - p2.lng) * (111320 * Math.cos(midLat * Math.PI / 180));
        return Math.hypot(dlat, dlng);
      }

      const parcels = parcelsList.map(p => ({
        fid: p.fid || 'Bidang',
        targetArea: (p.luas && p.luas > 0) ? p.luas : calculatePolygonArea(p.vertices),
        vertices: p.vertices.map(v => ({ lat: v.lat, lng: v.lng, locked: false }))
      }));

      const numP = parcels.length;
      for (let a = 0; a < numP; a++) {
        for (let b = a + 1; b < numP; b++) {
          const polyA = parcels[a].vertices;
          const polyB = parcels[b].vertices;
          const nA = polyA.length;
          const nB = polyB.length;

          for (let i = 0; i < nA; i++) {
            const a1 = polyA[i];
            const a2 = polyA[(i + 1) % nA];

            for (let j = 0; j < nB; j++) {
              const b1 = polyB[j];
              const b2 = polyB[(j + 1) % nB];

              const dOpp1 = distM(a1, b2);
              const dOpp2 = distM(a2, b1);
              if (dOpp1 <= snapThresholdMeters && dOpp2 <= snapThresholdMeters) {
                b2.lat = a1.lat; b2.lng = a1.lng;
                b1.lat = a2.lat; b1.lng = a2.lng;
                a1.locked = true; a2.locked = true;
                b1.locked = true; b2.locked = true;
              }

              const dSame1 = distM(a1, b1);
              const dSame2 = distM(a2, b2);
              if (dSame1 <= snapThresholdMeters && dSame2 <= snapThresholdMeters) {
                b1.lat = a1.lat; b1.lng = a1.lng;
                b2.lat = a2.lat; b2.lng = a2.lng;
                a1.locked = true; a2.locked = true;
                b1.locked = true; b2.locked = true;
              }
            }
          }
        }
      }
      return parcels;
    }

    function scaleParcelConstrained(vertices, targetArea) {
      if (!vertices || vertices.length < 3 || !targetArea || targetArea <= 0) return vertices;
      const curArea = calculatePolygonArea(vertices);
      if (curArea <= 0 || Math.abs(curArea - targetArea) < 0.2) return vertices;

      const lockedIndices = [];
      vertices.forEach((v, idx) => {
        if (v.locked) lockedIndices.push(idx);
      });

      if (lockedIndices.length === 0) {
        const scale = Math.sqrt(targetArea / curArea);
        let cLat = 0, cLng = 0;
        vertices.forEach(v => { cLat += v.lat; cLng += v.lng; });
        cLat /= vertices.length;
        cLng /= vertices.length;

        return vertices.map(v => ({
          lat: Number((cLat + (v.lat - cLat) * scale).toFixed(7)),
          lng: Number((cLng + (v.lng - cLng) * scale).toFixed(7)),
          locked: false
        }));
      }

      if (lockedIndices.length >= vertices.length) {
        return vertices;
      }

      let anchorLat = 0, anchorLng = 0;
      lockedIndices.forEach(idx => {
        anchorLat += vertices[idx].lat;
        anchorLng += vertices[idx].lng;
      });
      anchorLat /= lockedIndices.length;
      anchorLng /= lockedIndices.length;

      function tryScale(s) {
        return vertices.map((v, idx) => {
          if (v.locked) {
            return { lat: v.lat, lng: v.lng, locked: true };
          }
          return {
            lat: Number((anchorLat + (v.lat - anchorLat) * s).toFixed(7)),
            lng: Number((anchorLng + (v.lng - anchorLng) * s).toFixed(7)),
            locked: false
          };
        });
      }

      let low = 0.05, high = 4.0;
      for (let iter = 0; iter < 28; iter++) {
        const mid = (low + high) / 2;
        const cand = tryScale(mid);
        const a = calculatePolygonArea(cand);
        if (a < targetArea) {
          low = mid;
        } else {
          high = mid;
        }
      }

      return tryScale((low + high) / 2);
    }

    function autoScaleToBpnArea() {
      if (!activeVertices || activeVertices.length < 3) {
        showToast('Harap pilih atau digitasi bidang tanah terlebih dahulu.', 'warn');
        return;
      }

      if (isMergeMode && mergeParcelsList && mergeParcelsList.length > 0) {
        mergeParcelsList[0].coords = activeVertices.map(v => [v.lng, v.lat]);
        let curTotalArea = 0;
        const rawParcels = mergeParcelsList.map(p => {
          const pts = p.coords.map(c => Array.isArray(c) ? { lat: c[1], lng: c[0] } : { lat: c.lat, lng: c.lng });
          const a = calculatePolygonArea(pts);
          curTotalArea += a;
          return {
            fid: p.fid || 'Bidang',
            luas: (p.luas && p.luas > 0) ? p.luas : a,
            curArea: a,
            vertices: pts
          };
        });

        if (curTotalArea <= 0) return;

        const targetTotalArea = (activePinData && activePinData.luas_m2 > 0) ? activePinData.luas_m2 : curTotalArea;
        const globalScaleFactor = targetTotalArea / curTotalArea;

        rawParcels.forEach(p => {
          if (p.luas > 0 && Math.abs(p.luas - p.curArea) > 0.5) {
            p.targetArea = p.luas;
          } else {
            p.targetArea = p.curArea * globalScaleFactor;
          }
        });

        const lockedParcels = findSharedEdgesAndLock(rawParcels, 3.5);

        const adjustedParcels = lockedParcels.map(p => ({
          fid: p.fid || 'Bidang',
          luas: p.targetArea,
          vertices: scaleParcelConstrained(p.vertices, p.targetArea)
        }));

        activeVertices = adjustedParcels[0].vertices.map(v => ({ lat: v.lat, lng: v.lng }));
        mergeParcelsList[0].coords = activeVertices.map(v => [v.lng, v.lat]);

        for (let i = 1; i < adjustedParcels.length; i++) {
          const vList = adjustedParcels[i].vertices.map(v => ({ lat: v.lat, lng: v.lng }));
          mergeParcelsList[i].coords = vList.map(v => [v.lng, v.lat]);
          if (mergePreviewLayers[i - 1]) {
            mergePreviewLayers[i - 1].setLatLngs(vList.map(v => [v.lat, v.lng]));
          }
        }

        renderCanvasPolygon(true);
        showToast(`Presisi Batas berhasil: Seluruh ${mergeParcelsList.length} bidang terseleksi telah disesuaikan ukurannya dengan batas persekutuan terkunci presisi tanpa saling menimpa.`, 'success');
        return;
      }

      if (activeMultiParts && activeMultiParts.length > 1) {
        const curTotalArea = activeMultiParts.reduce((sum, part) => sum + calculatePolygonArea(part), 0);
        if (curTotalArea <= 0) return;

        let targetArea = activePinData?.luas_m2 || 0;
        if (!targetArea || targetArea <= 0) {
          const ask = prompt('Masukkan target luas bidang resmi (m²):', Math.round(curTotalArea));
          if (ask && !isNaN(parseFloat(ask)) && parseFloat(ask) > 0) {
            targetArea = parseFloat(ask);
            if (!activePinData) activePinData = {};
            activePinData.luas_m2 = targetArea;
          } else {
            showToast('Penyesuaian luas dibatalkan.', 'info');
            return;
          }
        }

        const scale = Math.sqrt(targetArea / curTotalArea);

        activeMultiParts = activeMultiParts.map(part => {
          let cLat = 0, cLng = 0;
          part.forEach(v => { cLat += v.lat; cLng += v.lng; });
          cLat /= part.length;
          cLng /= part.length;

          return part.map(v => ({
            lat: Number((cLat + (v.lat - cLat) * scale).toFixed(7)),
            lng: Number((cLng + (v.lng - cLng) * scale).toFixed(7))
          }));
        });

        activeVertices = activeMultiParts[0];
        renderCanvasPolygon(true);
        showToast(`Presisi Batas berhasil: Seluruh ${activeMultiParts.length} bagian bidang poligon disesuaikan ukurannya ke ${Math.round(targetArea).toLocaleString('id-ID')} m².`, 'success');
        return;
      }

      const curArea = calculatePolygonArea(activeVertices);
      if (curArea <= 0) return;

      let targetArea = activePinData?.luas_m2 || 0;
      if (!targetArea || targetArea <= 0) {
        const ask = prompt('Masukkan target luas bidang resmi (m²):', Math.round(curArea));
        if (ask && !isNaN(parseFloat(ask)) && parseFloat(ask) > 0) {
          targetArea = parseFloat(ask);
          if (!activePinData) activePinData = {};
          activePinData.luas_m2 = targetArea;
        } else {
          showToast('Penyesuaian luas dibatalkan.', 'info');
          return;
        }
      }

      const scale = Math.sqrt(targetArea / curArea);
      let cLat = 0, cLng = 0;
      activeVertices.forEach(v => { cLat += v.lat; cLng += v.lng; });
      cLat /= activeVertices.length;
      cLng /= activeVertices.length;

      activeVertices = activeVertices.map(v => ({
        lat: Number((cLat + (v.lat - cLat) * scale).toFixed(7)),
        lng: Number((cLng + (v.lng - cLng) * scale).toFixed(7))
      }));

      renderCanvasPolygon(true);
      showToast(`Presisi Batas berhasil: Ukuran poligon disesuaikan ke ${Math.round(targetArea).toLocaleString('id-ID')} m² sesuai catatan luas resmi.`, 'success');
    }

    function toggleMergeMode() {
      if (isMergeMode) {
        cancelMergeMode();
        return;
      }
      if (!activeVertices || activeVertices.length < 3) {
        showToast('Pilih bidang tanah awal terlebih dahulu dengan mengklik peta.', 'warn');
        return;
      }
      isMergeMode = true;
      mergeParcelsList = [];
      mergePreviewLayers.forEach(l => map.removeLayer(l));
      mergePreviewLayers = [];

      mergeParcelsList.push({
        coords: activeVertices.map(v => ({ lat: Number(v.lat.toFixed(7)), lng: Number(v.lng.toFixed(7)) })),
        fid: activePinData?.fid || 'Bidang 1',
        luas: activePinData?.luas_m2 || 0
      });

      const banner = document.getElementById('mergeModeBanner');
      if (banner) {
        banner.style.display = 'flex';
        document.getElementById('mergeCountBadge').innerText = '1';
        const txt = document.getElementById('mergeBannerText');
        if (txt) {
          txt.innerHTML = `<span class="dot-indicator" style="background-color: var(--amber);"></span> <strong>Mode Tambah Bidang (Gabung) Aktif</strong>: Klik bidang tanah tetangga di peta.`;
        }
      }
      const btn = document.getElementById('btnToggleMerge');
      if (btn) {
        btn.classList.add('active');
        const txt = document.getElementById('txtToggleMerge');
        if (txt) txt.innerText = 'Batal Gabung';
      }
    }

    function cancelMergeMode() {
      isMergeMode = false;
      const banner = document.getElementById('mergeModeBanner');
      if (banner) banner.style.display = 'none';
      mergePreviewLayers.forEach(l => map.removeLayer(l));
      mergePreviewLayers = [];
      mergeParcelsList = [];
      const btn = document.getElementById('btnToggleMerge');
      if (btn) {
        btn.classList.remove('active');
        const txt = document.getElementById('txtToggleMerge');
        if (txt) txt.innerText = 'Gabung Bidang';
      }
    }

    function snapSharedBoundaryVertices(newCoords, existingPolys, snapThresholdMeters = 2.5) {
      if (!newCoords || newCoords.length < 3 || !existingPolys || existingPolys.length === 0) {
        return newCoords;
      }
      function distM(p1, p2) {
        const dlat = (p1.lat - p2.lat) * 111320;
        const midLat = (p1.lat + p2.lat) * 0.5;
        const dlng = (p1.lng - p2.lng) * (111320 * Math.cos(midLat * Math.PI / 180));
        return Math.hypot(dlat, dlng);
      }
      function distToSegmentM(p, a, b) {
        const dlat = (b.lat - a.lat) * 111320;
        const midLat = (a.lat + b.lat) * 0.5;
        const dlng = (b.lng - a.lng) * (111320 * Math.cos(midLat * Math.PI / 180));
        const segLen2 = dlat * dlat + dlng * dlng;
        if (segLen2 === 0) return { dist: distM(p, a), pt: a };
        const pLat = (p.lat - a.lat) * 111320;
        const pLng = (p.lng - a.lng) * (111320 * Math.cos(midLat * Math.PI / 180));
        const t = Math.max(0, Math.min(1, (pLat * dlat + pLng * dlng) / segLen2));
        const projLat = a.lat + (t * (b.lat - a.lat));
        const projLng = a.lng + (t * (b.lng - a.lng));
        return { dist: distM(p, { lat: projLat, lng: projLng }), pt: { lat: projLat, lng: projLng } };
      }

      return newCoords.map(v => {
        let bestSnap = null;
        let minD = snapThresholdMeters;
        existingPolys.forEach(poly => {
          if (!poly || poly.length < 3) return;
          const m = poly.length;
          for (let j = 0; j < m; j++) {
            const rawA = poly[j];
            const a = Array.isArray(rawA) ? { lat: rawA[1], lng: rawA[0] } : { lat: rawA.lat, lng: rawA.lng };
            const d = distM(v, a);
            if (d < minD) {
              minD = d;
              bestSnap = { lat: a.lat, lng: a.lng };
            }
          }
          for (let j = 0; j < m; j++) {
            const rawA = poly[j];
            const rawB = poly[(j + 1) % m];
            const a = Array.isArray(rawA) ? { lat: rawA[1], lng: rawA[0] } : { lat: rawA.lat, lng: rawA.lng };
            const b = Array.isArray(rawB) ? { lat: rawB[1], lng: rawB[0] } : { lat: rawB.lat, lng: rawB.lng };
            const res = distToSegmentM(v, a, b);
            if (res.dist < minD) {
              minD = res.dist;
              bestSnap = res.pt;
            }
          }
        });
        return bestSnap ? { lat: Number(bestSnap.lat.toFixed(7)), lng: Number(bestSnap.lng.toFixed(7)) } : { lat: Number(v.lat.toFixed(7)), lng: Number(v.lng.toFixed(7)) };
      });
    }

    async function handleMergeParcelClick(lat, lng) {
      const statusBanner = document.getElementById('mergeBannerText');
      if (statusBanner) {
        statusBanner.innerHTML = '<span class="dot-indicator" style="background-color: var(--amber);"></span> Sedang membaca data batas bidang tanah di titik klik...';
      }
      try {
        const persilData = await fetchPersilCadastreData(lat, lng, map.getZoom() || 19);

        if (!persilData || !persilData.found || !persilData.polygon_coords || persilData.polygon_coords.length < 3) {
          if (statusBanner) {
            statusBanner.innerHTML = '<span class="dot-indicator" style="background-color: var(--crimson);"></span> Bidang tanah tidak terdeteksi pada titik klik. Pastikan klik berada tepat di dalam bidang tanah kadastral terdaftar.';
          }
          showToast('Titik klik berada di luar bidang tanah terdaftar. Silakan klik tepat di dalam bidang yang ingin digabungkan.', 'warn');
          return;
        }

        const isAlreadyAdded = mergeParcelsList.some(p => {
          if (persilData.fid && persilData.fid !== '-' && p.fid === persilData.fid) return true;
          return false;
        });
        if (isAlreadyAdded) {
          if (statusBanner) {
            statusBanner.innerHTML = `<span class="dot-indicator" style="background-color: var(--amber);"></span> Bidang ${persilData.fid || ''} sudah ada dalam daftar gabung.`;
          }
          showToast('Bidang tanah ini sudah terpilih sebelumnya.', 'info');
          return;
        }

        let rawCoords = persilData.polygon_coords.map(p => {
          if (Array.isArray(p)) return { lat: Number(p[1]), lng: Number(p[0]) };
          return { lat: Number(p.lat), lng: Number(p.lng) };
        });
        rawCoords = cleanAndDeduplicateVertices(rawCoords, 0.25, 4.0);

        const existingPolys = [activeVertices, ...mergeParcelsList.map(p => p.coords)];
        const snappedCoords = snapSharedBoundaryVertices(rawCoords, existingPolys, 2.5);

        const newParcelLuas = persilData.luas_m2 || Math.round(calculatePolygonArea(snappedCoords));
        const newParcelFid = persilData.fid && persilData.fid !== '-' ? persilData.fid : `Bidang ${mergeParcelsList.length + 1}`;

        mergeParcelsList.push({
          coords: snappedCoords,
          fid: newParcelFid,
          luas: newParcelLuas
        });

        const latlngs = snappedCoords.map(p => [p.lat, p.lng]);
        const previewLayer = L.polygon(latlngs, {
          color: '#082449',
          weight: 2.5,
          dashArray: '5, 5',
          fillColor: '#0a2e5c',
          fillOpacity: 0.22
        }).addTo(map);
        mergePreviewLayers.push(previewLayer);

        const countBadge = document.getElementById('mergeCountBadge');
        if (countBadge) countBadge.innerText = mergeParcelsList.length;

        if (statusBanner) {
          statusBanner.innerHTML = `<span class="dot-indicator" style="background-color: var(--emerald);"></span> Terpilih: ${newParcelFid} (${Math.round(newParcelLuas).toLocaleString('id-ID')} m²). Total ${mergeParcelsList.length} bidang siap digabung.`;
        }
        showToast(`Bidang ke-${mergeParcelsList.length} (${newParcelFid}) berhasil ditambahkan. Klik 'Selesai' untuk menggabungkan.`, 'success');
      } catch (err) {
        if (statusBanner) {
          statusBanner.innerHTML = `<span class="dot-indicator" style="background-color: var(--crimson);"></span> Gagal memuat bidang: ${err.message}`;
        }
      }
    }

        function clientSideMergeParcels(polygonsList) {
      if (!polygonsList || polygonsList.length === 0) {
        return { success: false, error: 'Tidak ada poligon untuk digabungkan.' };
      }

      function distM(p1, p2) {
        const dlat = (p1.lat - p2.lat) * 111320;
        const midLat = (p1.lat + p2.lat) * 0.5;
        const dlng = (p1.lng - p2.lng) * (111320 * Math.cos(midLat * Math.PI / 180));
        return Math.hypot(dlat, dlng);
      }

      const normPolys = polygonsList.map(poly => {
        return poly.map(p => {
          if (Array.isArray(p)) return { lat: p[1], lng: p[0] };
          return { lat: p.lat, lng: p.lng };
        });
      }).filter(p => p.length >= 3);

      if (normPolys.length === 0) {
        return { success: false, error: 'Format koordinat poligon tidak valid.' };
      }
      if (normPolys.length === 1) {
        const single = normPolys[0];
        const a = calculatePolygonArea(single);
        return {
          success: true,
          is_multipart: false,
          polygon_coords: single,
          all_parts_coords: [single],
          area_m2: a,
          total_parcels_merged: 1,
          total_vertices: single.length
        };
      }

      const edges = [];
      normPolys.forEach((poly, pIdx) => {
        const n = poly.length;
        for (let i = 0; i < n; i++) {
          edges.push({
            from: poly[i],
            to: poly[(i + 1) % n],
            pIdx: pIdx,
            shared: false,
            used: false
          });
        }
      });

      const snapThreshold = 3.5;
      for (let i = 0; i < edges.length; i++) {
        if (edges[i].shared) continue;
        for (let j = i + 1; j < edges.length; j++) {
          if (edges[j].shared || edges[i].pIdx === edges[j].pIdx) continue;
          const d1 = distM(edges[i].from, edges[j].to);
          const d2 = distM(edges[i].to, edges[j].from);
          if (d1 <= snapThreshold && d2 <= snapThreshold) {
            edges[i].shared = true;
            edges[j].shared = true;
            break;
          }
          const d1s = distM(edges[i].from, edges[j].from);
          const d2s = distM(edges[i].to, edges[j].to);
          if (d1s <= snapThreshold && d2s <= snapThreshold) {
            edges[i].shared = true;
            edges[j].shared = true;
            break;
          }
        }
      }

      const boundaryEdges = edges.filter(e => !e.shared);

      if (boundaryEdges.length < 3) {
        let sumArea = 0;
        normPolys.forEach(p => { sumArea += calculatePolygonArea(p); });
        return {
          success: true,
          is_multipart: true,
          all_parts_coords: normPolys,
          polygon_coords: normPolys[0],
          area_m2: sumArea,
          total_parcels_merged: normPolys.length,
          total_vertices: normPolys.reduce((acc, p) => acc + p.length, 0)
        };
      }

      const loops = [];
      while (boundaryEdges.some(e => !e.used)) {
        const startEdge = boundaryEdges.find(e => !e.used);
        startEdge.used = true;
        const loop = [startEdge.from];
        let currTo = startEdge.to;

        let iterations = 0;
        const maxIter = boundaryEdges.length * 2;
        while (iterations < maxIter) {
          iterations++;
          let nextEdge = null;
          let minD = 999999;
          for (let k = 0; k < boundaryEdges.length; k++) {
            const be = boundaryEdges[k];
            if (!be.used) {
              const d = distM(currTo, be.from);
              if (d <= snapThreshold && d < minD) {
                minD = d;
                nextEdge = be;
              }
            }
          }
          if (nextEdge) {
            nextEdge.used = true;
            loop.push(currTo);
            currTo = nextEdge.to;
            if (distM(currTo, loop[0]) <= snapThreshold) {
              break;
            }
          } else {
            break;
          }
        }
        if (loop.length >= 3) {
          const cleanLoop = cleanAndDeduplicateVertices(loop, 1.2, 14.0);
          const loopArea = calculatePolygonArea(cleanLoop);
          if (loopArea >= 12.0) {
            loops.push(cleanLoop);
          }
        }
      }

      if (loops.length === 0) {
        let sumArea = 0;
        normPolys.forEach(p => { sumArea += calculatePolygonArea(p); });
        return {
          success: true,
          is_multipart: false,
          all_parts_coords: [normPolys[0]],
          polygon_coords: normPolys[0],
          area_m2: sumArea,
          total_parcels_merged: normPolys.length,
          total_vertices: normPolys[0].length
        };
      }

      let maxLoopArea = 0;
      loops.forEach(lp => {
        const a = calculatePolygonArea(lp);
        if (a > maxLoopArea) maxLoopArea = a;
      });
      const significantLoops = loops.filter(lp => {
        const a = calculatePolygonArea(lp);
        return a >= Math.max(15.0, maxLoopArea * 0.05);
      });
      const finalLoops = significantLoops.length > 0 ? significantLoops : [loops[0]];

      let totalArea = 0;
      finalLoops.forEach(lp => { totalArea += calculatePolygonArea(lp); });
      const isMultipart = finalLoops.length > 1;

      return {
        success: true,
        is_multipart: isMultipart,
        all_parts_coords: finalLoops,
        polygon_coords: finalLoops[0],
        area_m2: totalArea,
        total_parcels_merged: normPolys.length,
        total_vertices: finalLoops.reduce((acc, l) => acc + l.length, 0)
      };
    }

    async function finishMergeParcels() {
      if (!mergeParcelsList || mergeParcelsList.length < 2) {
        showToast('Minimal harus ada 2 bidang tanah untuk digabungkan.', 'warn');
        return;
      }
      const persilApiBase = getBpnGatewayBase();
      const statusBanner = document.getElementById('mergeBannerText');
      if (statusBanner) {
        statusBanner.innerHTML = '<span class="dot-indicator" style="background-color: var(--amber);"></span> Menggabungkan topologi geometri bidang...';
      }

      let result = null;
      try {
        const payload = {
          polygons: mergeParcelsList.map(p => p.coords)
        };
        const sbRes = await fetch('https://vezruyffzmabhtylxigc.supabase.co/functions/v1/cadastre-gateway?action=merge-parcels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (sbRes.ok) {
          result = await sbRes.json();
        }
      } catch (sbErr) {}

      if ((!result || !result.success) && isProxyActive && persilApiBase && persilApiBase.startsWith('https://')) {
        try {
          const payload = {
            polygons: mergeParcelsList.map(p => p.coords)
          };
          const res = await fetch(`${persilApiBase}/api/merge-parcels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            result = await res.json();
          }
        } catch (netErr) {}
      }

      if (!result || !result.success) {
        result = clientSideMergeParcels(mergeParcelsList.map(p => p.coords));
      }

      if (!result || !result.success || (!result.merged_polygon && !result.polygon_coords && !result.all_parts_coords)) {
        showToast('Gagal menggabungkan bidang: ' + (result?.error || 'Geometri tidak bersinggungan.'), 'error');
        if (statusBanner) {
          statusBanner.innerHTML = '<span class="dot-indicator" style="background-color: var(--crimson);"></span> Gagal menggabungkan bidang tanah.';
        }
        return;
      }

      if (result.is_multipart && result.all_parts_coords && result.all_parts_coords.length > 1) {
        activeMultiParts = result.all_parts_coords.map(part =>
          part.map(p => (Array.isArray(p) ? { lat: p[1], lng: p[0] } : { lat: p.lat, lng: p.lng }))
        );
        activeVertices = activeMultiParts[0];
      } else {
        activeMultiParts = null;
        if (result.polygon_coords && result.polygon_coords.length >= 3) {
          activeVertices = result.polygon_coords.map(p => (Array.isArray(p) ? { lat: p[1], lng: p[0] } : { lat: p.lat, lng: p.lng }));
        } else if (result.merged_polygon && result.merged_polygon.length > 0) {
          const mergedRing = result.merged_polygon[0];
          activeVertices = mergedRing.map(p => ({ lat: p[1], lng: p[0] }));
        }
        activeVertices = cleanAndDeduplicateVertices(activeVertices, 1.2, 14.0);
      }

      
      if (activePinData) {
        activePinData.fid = 'Gabungan Bidang';
        activePinData.luas_m2 = result.area_m2;
        const _elNib = document.getElementById('pinNibText');
        if (_elNib) _elNib.innerText = 'Gabungan ' + (result.total_parcels_merged || mergeParcelsList.length) + ' Bidang';
        const _elLok = document.getElementById('pinLokasiUtamaText');
        if (_elLok) _elLok.innerText = (activePinData.desa !== '-' && activePinData.kecamatan !== '-') ? `${activePinData.desa}, ${activePinData.kecamatan}` : (activePinData.desa !== '-' ? activePinData.desa : 'Bidang Tanah');
        const _elLuas = document.getElementById('pinLuasBpnText');
        if (_elLuas) _elLuas.innerText = formatAreaM2(activePinData.luas_m2);
      }

      const hud = document.getElementById('canvasHud');
      if (hud) {
        hud.style.display = 'flex';
        const elHudNib = document.getElementById('hudNib');
        if (elHudNib) elHudNib.innerText = activePinData?.fid || 'Gabungan Bidang';
        const elHudArea = document.getElementById('hudBpnArea');
        if (elHudArea) elHudArea.innerText = formatAreaM2(result.area_m2);
      }

      const elShpLuas = document.getElementById('shpLuasHa');
      if (elShpLuas) {
        elShpLuas.value = `${(result.area_m2 / 10000.0).toFixed(6)} Ha`;
      }

      isParcelLocked = true;
      renderCanvasPolygon(true);
      cancelMergeMode();
      switchTab('tab-bidang');
      showToast(`Penggabungan berhasil: ${result.total_parcels_merged} bidang digabung menjadi 1 poligon utuh (Luas: ${formatAreaM2(result.area_m2)}, ${result.total_vertices} patok batas).`, 'success');
    }

    function setupDrawing() {
      drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);
    }

    function handleSnappingMouseMove(e) {
      if (!map) return;
      const mousePt = map.latLngToContainerPoint(e.latlng);
      let bestDist = 18;
      let bestTarget = null;

      const candidates = [];
      if (activeVertices && activeVertices.length > 0) {
        activeVertices.forEach(v => candidates.push(L.latLng(v.lat, v.lng)));
      }
      if (customDrawPoints && customDrawPoints.length > 0) {
        customDrawPoints.forEach(p => candidates.push(p));
      }
      if (drawnItems) {
        drawnItems.eachLayer(layer => {
          if (layer.getLatLngs) {
            const lls = layer.getLatLngs();
            const ring = Array.isArray(lls[0]) ? lls[0] : lls;
            ring.forEach(pt => candidates.push(pt));
          }
        });
      }

      for (let cand of candidates) {
        const candPt = map.latLngToContainerPoint(cand);
        const d = mousePt.distanceTo(candPt);
        if (d < bestDist) {
          bestDist = d;
          bestTarget = cand;
        }
      }

      if (bestTarget) {
        currentSnapPoint = bestTarget;
        if (!snapMarker) {
          const snapIcon = L.divIcon({
            className: 'snap-indicator',
            html: '<div class="snap-indicator-icon"></div>',
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          });
          snapMarker = L.marker(bestTarget, { icon: snapIcon, zIndexOffset: 2000 }).addTo(map);
        } else {
          snapMarker.setLatLng(bestTarget);
        }
      } else {
        currentSnapPoint = null;
        if (snapMarker) {
          map.removeLayer(snapMarker);
          snapMarker = null;
        }
      }
    }

    function startDrawPolygon() {
      startCustomPolygonDraw();
    }

    function startCustomPolygonDraw() {
      cancelCustomPolygonDraw();
      isDrawingPolygon = true;
      customDrawPoints = [];
      customDrawUndoStack = [];
      const tb = document.getElementById('smartDrawToolbar');
      if (tb) tb.classList.add('active');
      updateDrawCountBadge();
      showToast('Mode gambar poligon aktif. Klik pada peta untuk membuat patok batas.', 'info');
    }

    function handleDrawClick(e) {
      const latlng = (snapEnabled && currentSnapPoint) ? currentSnapPoint : e.latlng;
      if (customDrawPoints.length >= 3) {
        const firstPt = customDrawPoints[0];
        const pFirst = map.latLngToContainerPoint(firstPt);
        const pCurrent = map.latLngToContainerPoint(latlng);
        if (pFirst.distanceTo(pCurrent) < 22) {
          finishCustomPolygonDraw();
          return;
        }
      }
      customDrawPoints.push(latlng);
      customDrawUndoStack = [];
      renderCustomDrawPoly();
      updateDrawCountBadge();
    }

    function renderCustomDrawPoly() {
      if (customDrawLayer) {
        map.removeLayer(customDrawLayer);
        customDrawLayer = null;
      }
      customDrawMarkers.forEach(m => map.removeLayer(m));
      customDrawMarkers = [];

      if (customDrawPoints.length === 0) return;

      if (customDrawPoints.length >= 2) {
        customDrawLayer = L.polygon(customDrawPoints, {
          color: '#0a2e5c',
          weight: 2.5,
          fillColor: '#0a2e5c',
          fillOpacity: 0.18
        }).addTo(map);
      }

      customDrawPoints.forEach((pt, idx) => {
        const marker = L.circleMarker(pt, {
          radius: 5,
          color: '#0a2e5c',
          fillColor: '#ffffff',
          fillOpacity: 1,
          weight: 2
        }).addTo(map);
        customDrawMarkers.push(marker);
      });
    }

    function undoDrawPoint() {
      if (customDrawPoints.length > 0) {
        customDrawUndoStack.push(customDrawPoints.pop());
        renderCustomDrawPoly();
        updateDrawCountBadge();
      }
    }

    function redoDrawPoint() {
      if (customDrawUndoStack.length > 0) {
        customDrawPoints.push(customDrawUndoStack.pop());
        renderCustomDrawPoly();
        updateDrawCountBadge();
      }
    }

    function zoomToDrawBounds() {
      if (customDrawPoints.length > 0) {
        const bounds = L.latLngBounds(customDrawPoints);
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    }

    function centerDrawLastPoint() {
      if (customDrawPoints.length > 0) {
        map.panTo(customDrawPoints[customDrawPoints.length - 1]);
      }
    }

    function finishCustomPolygonDraw() {
      if (customDrawPoints.length < 3) {
        showToast('Poligon membutuhkan minimal 3 titik patok batas.', 'warn');
        return;
      }
      const finalPts = [...customDrawPoints];
      cancelCustomPolygonDraw();

      activeVertices = finalPts.map(p => ({ lat: p.lat, lng: p.lng }));
      activeMultiParts = null;
      if (!activePinData) {
        const areaM2 = roundArea2(calculatePolygonArea(activeVertices));
        activePinData = {
          fid: 'Digitasi Mandiri',
          tipe_hak: 'Hasil Pengukuran',
          luas_m2: areaM2,
          luas_ha: roundAreaHa6(areaM2),
          desa: '-',
          kecamatan: '-',
          kabkot: '-',
          provinsi: '-'
        };
      }
      isParcelLocked = true;
      renderCanvasPolygon(true);

      switchTab('tab-bidang');
      showToast(`Poligon selesai: ${finalPts.length} patok berhasil dibuat. Bentuk poligon dapat diedit langsung.`, 'success');
    }

    function cancelCustomPolygonDraw() {
      isDrawingPolygon = false;
      customDrawPoints = [];
      customDrawUndoStack = [];
      if (customDrawLayer) {
        map.removeLayer(customDrawLayer);
        customDrawLayer = null;
      }
      customDrawMarkers.forEach(m => map.removeLayer(m));
      customDrawMarkers = [];
      if (snapMarker) {
        map.removeLayer(snapMarker);
        snapMarker = null;
      }
      const tb = document.getElementById('smartDrawToolbar');
      if (tb) tb.classList.remove('active');
    }

    function toggleSnapMode() {
      snapEnabled = !snapEnabled;
      const btn = document.getElementById('btnSnapToggle');
      const txt = document.getElementById('snapText');
      if (btn) btn.classList.toggle('active', snapEnabled);
      if (txt) txt.innerText = snapEnabled ? 'Snap: Aktif' : 'Snap: Mati';
      showToast(snapEnabled ? 'Auto-snapping patok diaktifkan' : 'Auto-snapping patok dinonaktifkan', 'info');
    }

    function updateDrawCountBadge() {
      const el = document.getElementById('drawPointsCount');
      if (el) el.innerText = customDrawPoints.length;
    }
    function addVertexToActivePolygon() {
      if (!activeVertices || activeVertices.length < 3) {
        showToast('Pilih bidang tanah pada peta terlebih dahulu.', 'warn');
        return;
      }
      let maxDist = -1;
      let maxIdx = 0;
      for (let i = 0; i < activeVertices.length; i++) {
        const nextIdx = (i + 1) % activeVertices.length;
        const p1 = L.latLng(activeVertices[i].lat, activeVertices[i].lng);
        const p2 = L.latLng(activeVertices[nextIdx].lat, activeVertices[nextIdx].lng);
        const d = p1.distanceTo(p2);
        if (d > maxDist) {
          maxDist = d;
          maxIdx = i;
        }
      }
      const nextIdx = (maxIdx + 1) % activeVertices.length;
      const midLat = (activeVertices[maxIdx].lat + activeVertices[nextIdx].lat) / 2;
      const midLng = (activeVertices[maxIdx].lng + activeVertices[nextIdx].lng) / 2;
      activeVertices.splice(maxIdx + 1, 0, { lat: midLat, lng: midLng });
      renderCanvasPolygon(true);
      showToast(`Patok baru berhasil ditambahkan (Total: ${activeVertices.length} patok).`, 'success');
    }

    function removeLastVertexFromActive() {
      if (!activeVertices || activeVertices.length <= 3) {
        showToast('Poligon minimal membutuhkan 3 titik patok batas.', 'warn');
        return;
      }
      activeVertices.pop();
      renderCanvasPolygon(true);
      showToast(`Patok terakhir dihapus (sisa: ${activeVertices.length} patok)`, 'info');
    }

    function clearDrawnLayers() {
      drawnItems.clearLayers();
      cancelCustomPolygonDraw();
      clearCanvasRebuilderLayers();
      resetMeasurementLabels();
      showToast('Hasil gambar dan pengukuran berhasil dibersihkan.', 'info');
    }

    function resetMeasurementLabels() {
      const elM2 = document.getElementById('valLuasM2'); if (elM2) elM2.innerText = '0,00 m²';
      const elHa = document.getElementById('valLuasHa'); if (elHa) elHa.innerText = '0,000000 ha';
      const elKel = document.getElementById('valKeliling'); if (elKel) elKel.innerText = '0,00 m';
      const elTitik = document.getElementById('valTitik'); if (elTitik) elTitik.innerText = '0';
    }

    function updateMeasurements(layer) {
      if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
        const latlngs = layer.getLatLngs()[0];
        const areaM2 = calculatePolygonArea(latlngs);
        const perimeterM = calculatePolygonPerimeter(latlngs);

        const elValM2 = document.getElementById('valLuasM2'); if (elValM2) elValM2.innerText = formatAreaM2(areaM2);
        const elValHa = document.getElementById('valLuasHa'); if (elValHa) elValHa.innerText = formatAreaHa(areaM2);
        const elValKel = document.getElementById('valKeliling'); if (elValKel) elValKel.innerText = `${perimeterM.toFixed(2)} m`;
        const elValTitik = document.getElementById('valTitik'); if (elValTitik) elValTitik.innerText = latlngs.length;

        const elLiveM2 = document.getElementById('canvasLiveAreaM2');
        if (elLiveM2) elLiveM2.innerText = formatAreaM2(areaM2);
        const elLiveHa = document.getElementById('canvasLiveAreaHa');
        if (elLiveHa) elLiveHa.innerText = formatAreaHa(areaM2);

        layer.bindPopup(`
          <div style="font-size:0.8rem; font-family:'Plus Jakarta Sans',sans-serif;">
            <strong style="color:#0a2e5c;">Hasil Pengukuran Bidang:</strong><br>
            <strong>Luas:</strong> ${formatAreaM2(areaM2)} (${formatAreaHa(areaM2)})<br>
            <strong>Keliling:</strong> ${perimeterM.toFixed(2)} m<br>
            <strong>Titik Batas:</strong> ${latlngs.length} koordinat
          </div>
        `).openPopup();
      }
    }

    window.focusVertexMarker = function(pIdx, vIdx) {
      if (map) map.closePopup();
      showToast('Tahan dan seret patok dengan kursor 4 mata angin untuk menggeser posisi batas.', 'info');
    };

    window.deleteVertexMarker = function(pIdx, vIdx) {
      if (map) map.closePopup();
      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      if (parts.length > 1) {
        const targetPart = parts[pIdx];
        if (!targetPart || targetPart.length <= 3) {
          parts.splice(pIdx, 1);
          if (parts.length === 1) {
            activeVertices = parts[0];
            activeMultiParts = null;
          } else {
            activeMultiParts = parts;
            activeVertices = parts[0];
          }
          renderCanvasPolygon(true);
          showToast('Sisa garis patok / bagian berhasil dibersihkan.', 'success');
          return;
        } else {
          targetPart.splice(vIdx, 1);
          renderCanvasPolygon(true);
          showToast('Titik patok berhasil dihapus.', 'success');
          return;
        }
      }
      if (activeVertices.length <= 3) {
        showToast('Poligon utama minimal membutuhkan 3 titik sudut patok.', 'warn');
        return;
      }
      removeVertexAt(vIdx);
      showToast('Titik patok berhasil dihapus.', 'success');
    };

    window.deletePartEntirely = function(pIdx) {
      if (map) map.closePopup();
      if (!activeMultiParts || activeMultiParts.length <= 1) {
        showToast('Hanya ada satu bidang aktif.', 'info');
        return;
      }
      activeMultiParts.splice(pIdx, 1);
      if (activeMultiParts.length === 1) {
        activeVertices = activeMultiParts[0];
        activeMultiParts = null;
      } else {
        activeVertices = activeMultiParts[0];
      }
      renderCanvasPolygon(true);
      showToast('Bagian / sisa garis berhasil dihapus.', 'success');
    };

    function cleanInternalDanglingVertices() {
      if (activeMultiParts && activeMultiParts.length > 1) {
        let maxA = 0;
        activeMultiParts.forEach(p => {
          const a = calculatePolygonArea(p);
          if (a > maxA) maxA = a;
        });
        const validParts = activeMultiParts.filter(p => p.length >= 3 && calculatePolygonArea(p) >= Math.max(15.0, maxA * 0.05));
        if (validParts.length > 0) {
          if (validParts.length === 1) {
            activeVertices = validParts[0];
            activeMultiParts = null;
          } else {
            activeMultiParts = validParts;
            activeVertices = validParts[0];
          }
          renderCanvasPolygon(true);
          showToast('Patok sisa dan garis dalam berhasil dibersihkan.', 'success');
          return;
        }
      }
      cleanActiveVerticesManual();
      showToast('Titik sudut batas berhasil dirapikan.', 'success');
    }

    function loadTestParcel(type) {
      clearCanvasRebuilderLayers();
      if (type === 'large' || type === 'pro') {
        activeVertices = [
          { lat: -6.188400, lng: 106.832000 },
          { lat: -6.188400, lng: 106.832180 },
          { lat: -6.188535, lng: 106.832180 },
          { lat: -6.188535, lng: 106.832000 }
        ];
        showToast('Memuat poligon uji 300 m² (Melebihi kuota gratis 150 m²).', 'info');
      } else {
        activeVertices = [
          { lat: -6.188400, lng: 106.832000 },
          { lat: -6.188400, lng: 106.832090 },
          { lat: -6.188490, lng: 106.832090 },
          { lat: -6.188490, lng: 106.832000 }
        ];
        showToast('Memuat poligon uji 100 m² (Masuk kuota gratis <= 150 m²).', 'success');
      }
      isParcelLocked = true;
      if (map) {
        const bounds = L.latLngBounds(activeVertices.map(p => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [60, 60] });
      }
      renderCanvasPolygon(true);
      renderVertexHandles();
      renderEdgeDistanceLabels();
      const area = calculatePolygonArea(activeVertices);
      const hudBpn = document.getElementById('hudBpnArea');
      if (hudBpn) hudBpn.innerText = formatAreaM2(area);
      if (typeof renderCoordinatesTable === 'function') renderCoordinatesTable();
      switchTab('tab-bidang');
    }

    function clearTestParcel() {
      clearCanvasRebuilderLayers();
      const hudBpn = document.getElementById('hudBpnArea');
      if (hudBpn) hudBpn.innerText = '0,00 m²';
      showToast('Data pengujian telah dibersihkan.', 'info');
    }

    window.loadTestParcel = loadTestParcel;
    window.clearTestParcel = clearTestParcel;
