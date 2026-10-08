function handlePoiTypeChange(type) {
      const uploadBox = document.getElementById('customIconUploadBox');
      if (uploadBox) {
        uploadBox.style.display = (type === 'kustom') ? 'block' : 'none';
      }
    }

    function handleCustomPoiIconUpload(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        showToast('Pilih berkas gambar valid (PNG, JPG, SVG).', 'warn');
        return;
      }
      const reader = new FileReader();
      reader.onload = function(e) {
        customUploadedIconDataUrl = e.target.result;
        const imgPrev = document.getElementById('customIconPreviewImg');
        const statusTxt = document.getElementById('customIconStatusText');
        if (imgPrev) {
          imgPrev.src = customUploadedIconDataUrl;
          imgPrev.style.display = 'block';
        }
        if (statusTxt) {
          statusTxt.innerText = 'Ikon kustom siap digunakan';
          statusTxt.style.color = '#166534';
        }
        showToast('Ikon kustom berhasil dimuat!', 'success');
      };
      reader.readAsDataURL(file);
    }

    function getPoiTypeDetails(type, customImg = null) {
      if (type === 'sumur_bor') {
        return {
          label: 'Titik Sumur Bor / Air Tanah',
          color: '#0284c7',
          border: '#0369a1',
          prefix: 'SB',
          isCustomImg: false,
          svg: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="#ffffff"/><line x1="12" y1="2" x2="12" y2="7"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="2" y1="12" x2="7" y2="12"/><line x1="17" y1="12" x2="21" y2="12"/></svg>'
        };
      } else if (type === 'bm') {
        return {
          label: 'Titik Kontrol Geodesi / BM',
          color: '#ea580c',
          border: '#c2410c',
          prefix: 'BM',
          isCustomImg: false,
          svg: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5"><polygon points="12,2 22,20 2,20" fill="rgba(255,255,255,0.4)" stroke="#ffffff" stroke-width="2"/><circle cx="12" cy="14" r="2.5" fill="#ffffff"/></svg>'
        };
      } else if (type === 'fasilitas') {
        return {
          label: 'Fasilitas / Bangunan Penunjang',
          color: '#6366f1',
          border: '#4f46e5',
          prefix: 'FS',
          isCustomImg: false,
          svg: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5"><path d="M3 21h18M5 21V7l8-4v18M13 11l6 3v7"/></svg>'
        };
      } else {
        if (customImg) {
          return {
            label: 'Titik Khusus (Ikon Kustom)',
            color: '#059669',
            border: '#047857',
            prefix: 'TK',
            isCustomImg: true,
            customUrl: customImg
          };
        }
        return {
          label: 'Titik Khusus Lapangan',
          color: '#059669',
          border: '#047857',
          prefix: 'TK',
          isCustomImg: false,
          svg: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5"><polygon points="12,2 15,8 22,9 17,14 18,21 12,17 6,21 7,14 2,9 9,8" fill="#ffffff"/></svg>'
        };
      }
    }

    function toggleAddPoiMode() {
      isAddingPoi = !isAddingPoi;
      const btn = document.getElementById('btnStartAddPoi');
      const txt = document.getElementById('textBtnAddPoi');
      const mapEl = document.getElementById('map');
      if (isAddingPoi) {
        if (btn) btn.style.backgroundColor = '#ea580c';
        if (txt) txt.innerText = 'Klik Peta untuk Menaruh (Batal)';
        if (mapEl) mapEl.style.cursor = 'crosshair';
        showToast('Mode tambah titik aktif. Klik lokasi yang diinginkan pada peta.', 'info');
      } else {
        if (btn) btn.style.backgroundColor = '';
        if (txt) txt.innerText = 'Tambah Titik di Peta';
        if (mapEl) mapEl.style.cursor = '';
      }
    }

    function handleMapAddPoi(latlng) {
      const type = document.getElementById('selCustomPoiType')?.value || 'sumur_bor';
      const nameInput = document.getElementById('inputCustomPoiName');
      const iconImg = (type === 'kustom' && customUploadedIconDataUrl) ? customUploadedIconDataUrl : null;
      const details = getPoiTypeDetails(type, iconImg);
      const sameCount = customPois.filter(p => p.type === type).length + 1;
      const finalName = nameInput?.value.trim() || (details.prefix + '-' + sameCount);

      const poi = {
        id: 'poi_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        type: type,
        name: finalName,
        customIconUrl: iconImg,
        lat: Number(latlng.lat.toFixed(7)),
        lng: Number(latlng.lng.toFixed(7))
      };

      customPois.push(poi);
      if (nameInput) nameInput.value = '';

      createPoiMapMarker(poi);
      renderCustomPoiList();
      showToast('Titik ' + poi.name + ' (' + details.label + ') berhasil ditambahkan.', 'success');
      toggleAddPoiMode();
    }

    function createPoiMapMarker(poi) {
      const details = getPoiTypeDetails(poi.type, poi.customIconUrl);
      let innerSymbolHtml = '';
      if (details.isCustomImg && details.customUrl) {
        innerSymbolHtml = '<img src="' + details.customUrl + '" style="width:16px; height:16px; object-fit:contain;" alt="icon">';
      } else {
        innerSymbolHtml = details.svg;
      }

      const divIcon = L.divIcon({
        className: 'custom-poi-divicon',
        html: '<div class="custom-poi-marker-wrap" id="poi_marker_' + escapeHtml(poi.id) + '">' +
          '<div class="custom-poi-label">' + escapeHtml(poi.name) + '</div>' +
          '<div class="custom-poi-pin" style="background-color: ' + details.color + '; border-color: ' + details.border + ';">' +
            '<div class="custom-poi-pin-icon">' + innerSymbolHtml + '</div>' +
          '</div>' +
        '</div>',
        iconSize: [24, 38],
        iconAnchor: [12, 38]
      });

      const marker = L.marker([poi.lat, poi.lng], { icon: divIcon, draggable: true }).addTo(map);
      marker.on('dragend', function(e) {
        const pos = e.target.getLatLng();
        poi.lat = Number(pos.lat.toFixed(7));
        poi.lng = Number(pos.lng.toFixed(7));
        renderCustomPoiList();
        showToast('Posisi ' + escapeHtml(poi.name) + ' diperbarui.', 'info');
      });

      poiMarkersMap.set(poi.id, marker);
    }

    function deleteCustomPoi(id) {
      const marker = poiMarkersMap.get(id);
      if (marker && map) map.removeLayer(marker);
      poiMarkersMap.delete(id);
      customPois = customPois.filter(p => p.id !== id);
      renderCustomPoiList();
      showToast('Titik data berhasil dihapus.', 'info');
    }

    function editCustomPoiName(id, newName) {
      const poi = customPois.find(p => p.id === id);
      if (!poi) return;
      poi.name = newName.trim() || poi.name;
      const marker = poiMarkersMap.get(id);
      if (marker) {
        map.removeLayer(marker);
        createPoiMapMarker(poi);
      }
    }

    function clearAllCustomPois() {
      poiMarkersMap.forEach(m => map.removeLayer(m));
      poiMarkersMap.clear();
      customPois = [];
      renderCustomPoiList();
      showToast('Seluruh titik data kustom berhasil dibersihkan.', 'info');
    }

    function renderCustomPoiList() {
      const listEl = document.getElementById('customPoiList');
      const badgeCount = document.getElementById('badgePoiCount');
      if (badgeCount) badgeCount.innerText = customPois.length + ' Titik';
      if (!listEl) return;
      if (customPois.length === 0) {
        listEl.style.display = 'none';
        listEl.innerHTML = '';
        return;
      }
      listEl.style.display = 'block';
      let html = '';
      customPois.forEach(poi => {
        const details = getPoiTypeDetails(poi.type, poi.customIconUrl);
        html += '<div class="poi-item-row">' +
          '<div class="poi-item-info">' +
            '<span class="poi-type-badge" style="background-color: ' + details.color + ';">' + details.prefix + '</span>' +
            '<input type="text" class="poi-name-input" value="' + escapeHtml(poi.name) + '" onchange="editCustomPoiName(\'' + escapeHtml(poi.id) + '\', this.value)" title="Ubah nama titik">' +
          '</div>' +
          '<span style="font-size: 0.64rem; font-family: \'JetBrains Mono\', monospace; color: var(--text-muted);">' + poi.lat.toFixed(4) + ', ' + poi.lng.toFixed(4) + '</span>' +
          '<button type="button" class="poi-del-btn" onclick="deleteCustomPoi(\'' + escapeHtml(poi.id) + '\')" title="Hapus Titik">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>';
      });
      listEl.innerHTML = html;
    }
