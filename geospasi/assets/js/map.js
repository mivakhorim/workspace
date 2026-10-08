async function geocodeAndFly(query, zoomLevel = 14) {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=id&limit=1`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);
            if (!isNaN(lat) && !isNaN(lon)) {
              map.flyTo([lat, lon], zoomLevel, { duration: 1.5 });
            }
          }
        }
      } catch (e) {}
    }

    function updateCoordsTable() {
      if (typeof renderCoordinatesTable === 'function') {
        renderCoordinatesTable();
      }
    }

    function syncActivePolygonPanel() {
      const noPin = document.getElementById('noPinAlert');
      const foundBox = document.getElementById('persilFoundBox');
      if (activeVertices && activeVertices.length >= 3) {
        if (noPin) noPin.style.display = 'none';
        if (foundBox) foundBox.style.display = 'flex';
        const midLat = activeVertices[0].lat;
        const midLng = activeVertices[0].lng;
        const btnBhumi = document.getElementById('btnLinkBhumi');
        if (btnBhumi) btnBhumi.href = `https://bhumi.atrbpn.go.id/peta?latitude=${midLat.toFixed(6)}&longitude=${midLng.toFixed(6)}&zoom=19`;
        const btnGmaps = document.getElementById('btnLinkGoogleMaps');
        if (btnGmaps) btnGmaps.href = `https://www.google.com/maps?q=${midLat.toFixed(6)},${midLng.toFixed(6)}`;
      }
    }

    function toggleMapLegend() {
      const body = document.getElementById('legendBody');
      const chev = document.getElementById('legendChevron');
      if (!body) return;
      body.classList.toggle('collapsed');
      if (chev) {
        chev.style.transform = body.classList.contains('collapsed') ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    }


    var ArcGisExportLayer = L.TileLayer.extend({
      getTileUrl: function(coords) {
        if (!this._map) return '';
        const nwPoint = coords.scaleBy(this.getTileSize());
        const sePoint = nwPoint.add(this.getTileSize());
        const crs = this._map.options.crs;
        const nw = crs.project(this._map.unproject(nwPoint, coords.z));
        const se = crs.project(this._map.unproject(sePoint, coords.z));
        const minX = Math.min(nw.x, se.x);
        const maxX = Math.max(nw.x, se.x);
        const minY = Math.min(nw.y, se.y);
        const maxY = Math.max(nw.y, se.y);
        const bbox = `${minX},${minY},${maxX},${maxY}`;
        let url = `${this._url}?bbox=${bbox}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image`;
        if (this.options.layers) {
          url += `&layers=${encodeURIComponent(this.options.layers)}`;
        }
        return url;
      }
    });

    function initMap() {
      map = L.map('map', {
        center: [DEFAULT_LAT, DEFAULT_LON],
        zoom: DEFAULT_ZOOM,
        maxZoom: 26,
        wheelPxPerZoomLevel: 90,
        zoomControl: false,
        attributionControl: false,
        preferCanvas: false,
        renderer: L.svg({ padding: 0.5 })
      });

      const floatingQuick = document.getElementById('mapFloatingQuickControls');
      if (floatingQuick && typeof L !== 'undefined' && L.DomEvent) {
        L.DomEvent.disableClickPropagation(floatingQuick);
        L.DomEvent.disableScrollPropagation(floatingQuick);
      }

      baseLayers = {
        esri_sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 26,
          maxNativeZoom: 19,
          crossOrigin: 'anonymous'
        }),
        esri_hybrid: L.layerGroup([
          L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 26,
            maxNativeZoom: 19,
            crossOrigin: 'anonymous'
          }),
          L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 26,
            maxNativeZoom: 19,
            crossOrigin: 'anonymous'
          })
        ]),
        osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 26,
          maxNativeZoom: 19,
          crossOrigin: 'anonymous',
          attribution: '&copy; OpenStreetMap'
        }),
        esri_topo: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 26,
          maxNativeZoom: 19,
          crossOrigin: 'anonymous'
        })
      };

      currentBaseLayer = baseLayers.osm;
      currentBaseLayer.addTo(map);

      setupPersilLayer();
      initCekingLayers();
      setupDrawing();

      map.on('click', function(e) {
        if (isAddingPoi) {
          handleMapAddPoi(e.latlng);
          return;
        }
        if (isDrawingPolygon) {
          handleDrawClick(e);
          return;
        }
        if (isMergeMode) {
          handleMergeParcelClick(e.latlng.lat, e.latlng.lng);
          return;
        }
        if (isParcelLocked && activeVertices && activeVertices.length >= 3) {
          showToast('Bidang khusus aktif (hasil import / gabungan / gambar manual). Klik tombol Batal Pilihan terlebih dahulu jika ingin beralih ke bidang lain.', 'warn');
          return;
        }
        handleMapClick(e.latlng.lat, e.latlng.lng, true);
      });

      map.on('mousemove', function(e) {
        lastHoverCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
        const box = document.getElementById('coordsBox');
        if (box) {
          box.innerText = `Lat: ${e.latlng.lat.toFixed(6)}, Lon: ${e.latlng.lng.toFixed(6)}`;
        }
        if (snapEnabled && (isDrawingPolygon || (activeVertices && activeVertices.length >= 3))) {
          handleSnappingMouseMove(e);
        } else if (snapMarker) {
          map.removeLayer(snapMarker);
          snapMarker = null;
          currentSnapPoint = null;
        }
      });

      map.on('zoomend', function() {
        checkZoomLevel();
        if (activeVertices && activeVertices.length >= 3) {
          renderVertexHandles();
          renderEdgeDistanceLabels();
        }
        const box = document.getElementById('coordsBox');
        if (box) {
          const c = map.getCenter();
          box.innerText = `Lat: ${c.lat.toFixed(6)}, Lon: ${c.lng.toFixed(6)}`;
        }
      });

      window.addEventListener('resize', () => {
        const sb = document.getElementById('sidebar');
        const fab = document.getElementById('mapSidebarFab');
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
          if (fab) fab.style.display = (sb && sb.classList.contains('mobile-open')) ? 'none' : 'flex';
        } else {
          if (fab) fab.style.display = (sb && sb.classList.contains('collapsed')) ? 'flex' : 'none';
        }
        map.invalidateSize();
      });

      if (window.innerWidth <= 768) {
        const fab = document.getElementById('mapSidebarFab');
        if (fab) fab.style.display = 'flex';
      }

      checkZoomLevel();
      checkProxyHealth();
    }

    async function syncLiveBpnMap() {
      const icon = document.getElementById('syncIcon');
      const text = document.getElementById('syncText');
      if (icon) icon.style.transform = 'rotate(360deg)';
      if (text) text.innerText = 'Menyinkronkan...';

      const persilBase = getBpnGatewayBase();
      const timestamp = Date.now();
      try {
        if (persilBase) {
          await fetch(`${persilBase}/api/clear-cache`, { method: 'POST' }).catch(() => {});
          if (persilLayer) {
            persilLayer.setUrl(`${persilBase}/persil/{z}/{x}/{y}.webp?live=1&t=${timestamp}`);
            if (!map.hasLayer(persilLayer)) persilLayer.addTo(map);
            persilLayer.redraw();
          }
        } else if (persilLayer) {
          persilLayer.redraw();
        }
        if (currentBaseLayer) {
          currentBaseLayer.redraw();
        }
        if (activePinData && activePinData.lat && activePinData.lng) {
          handleMapClick(activePinData.lat, activePinData.lng, true);
        }
        showToast('Peta dan lapisan bidang tanah diperbarui ke posisi terkini.', 'success');
      } catch (err) {
        showToast('Peta berhasil disegarkan.', 'success');
      } finally {
        if (icon) icon.style.transform = 'none';
        if (text) text.innerText = 'Perbarui Peta';
      }
    }

    function switchBasemap(name) {
      if (currentBaseLayer && map.hasLayer(currentBaseLayer)) {
        map.removeLayer(currentBaseLayer);
      }
      if (baseLayers[name]) {
        currentBaseLayer = baseLayers[name];
        currentBaseLayer.addTo(map);
        Object.keys(cekingLayers).forEach(k => {
          if (cekingLayers[k] && map.hasLayer(cekingLayers[k])) {
            cekingLayers[k].bringToFront();
          }
        });
        if (persilLayer && map.hasLayer(persilLayer)) {
          persilLayer.bringToFront();
        }
      }
    }

    var persilFetchSeq = 0;
    function locateUserGPS() {
      if (!navigator.geolocation) {
        showToast('Perangkat tidak mendukung fitur Geolocation GPS.', 'warn');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          flyToLoc(latitude, longitude, 18, 'Lokasi GPS Anda');
        },
        (err) => {
          showToast('Gagal mengambil lokasi GPS: ' + err.message, 'error');
        },
        { enableHighAccuracy: true }
      );
    }

    function checkZoomLevel() {
      const currentZoom = map.getZoom();
      const zoomText = document.getElementById('currentZoomText');
      if (zoomText) zoomText.innerText = currentZoom;
    }

    function flyToLoc(lat, lon, zoom, label) {
      map.flyTo([lat, lon], zoom, { duration: 1.5 });
      handleMapClick(lat, lon, true);
    }

    function goToCoords() {
      const lat = parseFloat(document.getElementById('inputLat').value);
      const lon = parseFloat(document.getElementById('inputLon').value);
      if (isNaN(lat) || isNaN(lon)) {
        showToast('Harap masukkan angka Latitude dan Longitude yang valid.', 'warn');
        return;
      }
      flyToLoc(lat, lon, 18, 'Koordinat Dicari');
    }

    async function searchLocation() {
      const searchInputEl = document.getElementById('searchInput');
      const q = searchInputEl ? searchInputEl.value.trim() : '';
      const container = document.getElementById('searchResults');
      if (!q || !container) return;

      container.innerHTML = '<div class="search-res-item">Mencari lokasi...</div>';
      container.style.display = 'block';

      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=id&limit=6&addressdetails=1`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data || data.length === 0) {
          container.innerHTML = '<div class="search-res-item" style="color:var(--crimson);">Wilayah tidak ditemukan. Coba nama kota atau kecamatan lain.</div>';
          return;
        }

        container.innerHTML = '';
        data.forEach(item => {
          const div = document.createElement('div');
          div.className = 'search-res-item';
          const titleText = escapeHtml(item.name || item.display_name.split(',')[0]);
          const subText = escapeHtml(item.display_name);
          div.innerHTML = `<strong>${titleText}</strong><br><small style="color:var(--text-muted);">${subText}</small>`;
          div.onclick = () => {
            const lat = parseFloat(item.lat);
            const lon = parseFloat(item.lon);
            flyToLoc(lat, lon, 17, item.display_name.split(',')[0]);
            container.style.display = 'none';
          };
          container.appendChild(div);
        });
      } catch (err) {
        container.innerHTML = `<div class="search-res-item" style="color:var(--crimson);">Gagal mencari: ${escapeHtml(err.message)}</div>`;
      }
    }


    function renderCoordinatesTable() {
      const tableContent = document.getElementById('coordsTableContent');
      const emptyAlert = document.getElementById('coordsEmptyAlert');
      const badgeCount = document.getElementById('coordsVertexCountBadge');
      const tableBody = document.getElementById('coordsTableBody');
      const nibBadge = document.getElementById('coordsNibBadge');
      const statCount = document.getElementById('coordStatCount');
      const statKeliling = document.getElementById('coordStatKeliling');
      const statLuas = document.getElementById('coordStatLuas');

      if (!activeVertices || activeVertices.length < 3) {
        if (tableContent) tableContent.style.display = 'none';
        if (emptyAlert) emptyAlert.style.display = 'block';
        if (badgeCount) badgeCount.innerText = '0 Patok';
        if (statCount) statCount.innerText = '0';
        if (statKeliling) statKeliling.innerText = '0 m';
        if (statLuas) statLuas.innerText = '0 m²';
        return;
      }

      if (tableContent) tableContent.style.display = 'block';
      if (emptyAlert) emptyAlert.style.display = 'none';
      if (badgeCount) badgeCount.innerText = `${activeVertices.length} Patok`;
      if (nibBadge) nibBadge.innerText = `Terdaftar Resmi`;

      const numPts = activeVertices.length;
      let totalPerimeter = 0;
      if (tableBody) tableBody.innerHTML = '';

      activeVertices.forEach((v, idx) => {
        const nextIdx = (idx + 1) % numPts;
        const nextV = activeVertices[nextIdx];
        const dist = map.distance([v.lat, v.lng], [nextV.lat, nextV.lng]);
        totalPerimeter += dist;
        const utm = latLngToUtm(v.lat, v.lng);

        if (tableBody) {
          const tr = document.createElement('tr');
          tr.className = 'coords-row';
          tr.innerHTML = `
            <td style="font-weight:700; color:var(--accent);">P${idx + 1}</td>
            <td>${v.lat.toFixed(7)}</td>
            <td>${v.lng.toFixed(7)}</td>
            <td style="font-size:0.67rem;">${utm.zone} ${utm.easting}, ${utm.northing}</td>
            <td>${dist.toFixed(2)} m</td>
            <td><button class="copy-chip-btn" onclick="copySingleVertexCoords(${idx})" title="Salin koordinat P${idx + 1}">Salin</button></td>
          `;
          tr.onclick = (e) => {
            if (e.target.tagName.toLowerCase() === 'button') return;
            map.panTo([v.lat, v.lng]);
          };
          tableBody.appendChild(tr);
        }
      });

      const luasM2 = calculatePolygonArea(activeVertices);
      if (statCount) statCount.innerText = activeVertices.length;
      if (statKeliling) statKeliling.innerText = `${totalPerimeter.toFixed(2)} m`;
      if (statLuas) statLuas.innerText = formatAreaM2(luasM2);
    }

    function copySingleVertexCoords(idx) {
      if (!activeVertices || !activeVertices[idx]) return;
      const v = activeVertices[idx];
      const utm = latLngToUtm(v.lat, v.lng);
      const text = `Patok P${idx + 1}\nLatitude: ${v.lat.toFixed(7)}\nLongitude: ${v.lng.toFixed(7)}\nUTM: ${utm.zone} ${utm.easting} E, ${utm.northing} N`;
      navigator.clipboard.writeText(text).then(() => {
        showToast(`Koordinat Patok P${idx + 1} disalin ke clipboard!`, 'success');
      });
    }

    function copyAllCoordinatesCsv() {
      ensureActiveVerticesFromDraw();
      if (!activeVertices || activeVertices.length < 3) {
        showToast('Belum ada data koordinat patok bidang aktif.', 'warn');
        return;
      }
      let csv = 'Patok,Latitude,Longitude,UTM_Zona,UTM_X,UTM_Y,Jarak_Meter\n';
      const numPts = activeVertices.length;
      activeVertices.forEach((v, idx) => {
        const nextIdx = (idx + 1) % numPts;
        const nextV = activeVertices[nextIdx];
        const dist = map.distance([v.lat, v.lng], [nextV.lat, nextV.lng]);
        const utm = latLngToUtm(v.lat, v.lng);
        csv += `P${idx + 1},${v.lat.toFixed(7)},${v.lng.toFixed(7)},${utm.zone},${utm.easting},${utm.northing},${dist.toFixed(2)}\n`;
      });
      navigator.clipboard.writeText(csv).then(() => {
        showToast(`Daftar ${activeVertices.length} patok berhasil disalin ke CSV!`, 'success');
      });
    }

    function copyAllCoordinatesText() {
      ensureActiveVerticesFromDraw();
      if (!activeVertices || activeVertices.length < 3) {
        showToast('Belum ada data koordinat patok bidang aktif.', 'warn');
        return;
      }
      const fid = activePinData?.fid || '-';
      const desa = activePinData?.desa || '-';
      const kec = activePinData?.kecamatan || '-';
      const kab = activePinData?.kabkot || '-';
      const prov = activePinData?.provinsi || '-';
      const luasM2 = calculatePolygonArea(activeVertices);

      let lines = [];
      lines.push('DAFTAR TITIK KOORDINAT PATOK BIDANG TANAH KADASTRAL');
      lines.push('====================================================');
      
      lines.push(`Desa / Kelurahan         : ${desa}`);
      lines.push(`Kecamatan                : ${kec}`);
      lines.push(`Kabupaten / Kota         : ${kab}`);
      lines.push(`Provinsi                 : ${prov}`);
      lines.push(`Total Patok Batas        : ${activeVertices.length} Titik`);
      lines.push(`Total Luas Ukur          : ${formatAreaM2(luasM2)} (${formatAreaHa(luasM2)})`);
      lines.push('----------------------------------------------------');
      lines.push('Patok\tLatitude\tLongitude\tJarak Sisi\tUTM (X, Y)');
      lines.push('----------------------------------------------------');
      const numPts = activeVertices.length;
      activeVertices.forEach((v, idx) => {
        const nextIdx = (idx + 1) % numPts;
        const nextV = activeVertices[nextIdx];
        const dist = map.distance([v.lat, v.lng], [nextV.lat, nextV.lng]);
        const utm = latLngToUtm(v.lat, v.lng);
        lines.push(`P${idx + 1}\t${v.lat.toFixed(7)}\t${v.lng.toFixed(7)}\t${dist.toFixed(2)} m\t${utm.zone} ${utm.easting} E, ${utm.northing} N`);
      });
      lines.push('----------------------------------------------------');
      lines.push('Sistem Koordinat: WGS 84 (EPSG:4326) / UTM');
      lines.push('Pengembang: Duta Digital Agensi (dutamik.id)');
      lines.push('Tagline: Duta Media Informasi berKarya');

      const fullText = lines.join('\n');
      navigator.clipboard.writeText(fullText).then(() => {
        showToast('Daftar koordinat patok resmi berhasil disalin ke clipboard!', 'success');
      });
    }

    function resetMapOrientation() {
      map.setView(map.getCenter(), map.getZoom(), { animate: true });
      showToast('Orientasi peta: Arah Utara (North Up)', 'info');
    }


    function cycleCopyHeaderCoords() {
      headerCopyFlip = !headerCopyFlip;
      const lat = lastHoverCoords.lat.toFixed(6);
      const lng = lastHoverCoords.lng.toFixed(6);
      const textToCopy = headerCopyFlip ? `${lng}, ${lat}` : `${lat}, ${lng}`;
      const label = headerCopyFlip ? `X, Y (${lng}, ${lat})` : `Y, X (${lat}, ${lng})`;
      navigator.clipboard.writeText(textToCopy).then(() => {
        showToast(`Koordinat tersalin: ${label}`, 'success');
      }).catch(() => {
        showToast(`Koordinat: ${textToCopy}`, 'info');
      });
    }

    window.copyActiveCoords = copyActiveCoord;
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

    function shareCurrentMapLocation() {
      const c = map.getCenter();
      const z = map.getZoom() || 19;
      const lat = (activePinData?.lat || c.lat).toFixed(6);
      const lng = (activePinData?.lng || c.lng).toFixed(6);
      const fullUrl = `${window.location.origin}${window.location.pathname}#lat=${lat}&lng=${lng}&z=${z}`;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(fullUrl).then(() => {
          showToast(`Tautan peta berhasil disalin ke clipboard: ${fullUrl}`, 'success');
        }).catch(() => {
          showToast(`Tautan peta: ${fullUrl}`, 'info');
        });
      } else {
        showToast(`Tautan peta: ${fullUrl}`, 'info');
      }
    }

    function mapZoomIn() {
      if (typeof map !== 'undefined' && map) {
        map.zoomIn();
      }
    }

    function mapZoomOut() {
      if (typeof map !== 'undefined' && map) {
        map.zoomOut();
      }
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
