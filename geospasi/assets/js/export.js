function exportCoordinatesXls() {
      if (!isMemberProActive()) {
        showToast('Fitur Ekspor Koordinat Excel khusus Member PRO. Silakan masuk atau upgrade akun.', 'warn');
        openMemberModal();
        return;
      }
      ensureActiveVerticesFromDraw();
      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      if (!parts[0] || parts[0].length < 3) {
        showToast('Pilih atau gambar bidang tanah pada peta terlebih dahulu.', 'warn');
        return;
      }

      const pemrakarsa = (document.getElementById('shpPemrakarsa')?.value.trim() || 'PEMOHON OSS RBA').toUpperCase();
      const kegiatan = (document.getElementById('shpKegiatan')?.value.trim() || 'KKPR / PERIZINAN BERUSAHA').toUpperCase();
      const tahun = document.getElementById('shpTahun')?.value.trim() || '2026';
      const desa = activePinData?.desa || '-';
      const kec = activePinData?.kecamatan || '-';
      const kab = activePinData?.kabkot || '-';
      const prov = activePinData?.provinsi || '-';

      let totalM2 = 0;
      parts.forEach(p => { totalM2 += calculatePolygonArea(p); });
      const luasM2 = Math.round(totalM2);
      const luasHa = (totalM2 / 10000).toFixed(4);

      const rowsData = [];
      parts.forEach((pList, pIdx) => {
        const pfx = parts.length > 1 ? String.fromCharCode(65 + pIdx) : 'P';
        pList.forEach((v, vIdx) => {
          const nodeLabel = `${pfx}${vIdx + 1}`;
          const nextV = pList[(vIdx + 1) % pList.length];
          const dist = L.latLng(v.lat, v.lng).distanceTo(L.latLng(nextV.lat, nextV.lng));
          const utm = getUtmCoordinates(v.lat, v.lng);

          rowsData.push([
            nodeLabel,
            parseFloat(v.lat.toFixed(7)),
            parseFloat(v.lng.toFixed(7)),
            parseFloat(utm.x.toFixed(2)),
            parseFloat(utm.y.toFixed(2)),
            utm.zone,
            parseFloat(dist.toFixed(2))
          ]);
        });
      });

      if (typeof XLSX !== 'undefined') {
        const wb = XLSX.utils.book_new();
        const sheetData = [
          ['DUTAGEOSPASI : DAFTAR KOORDINAT PATOK BATAS TANAH'],
          ['Pengembang: Duta Digital Agensi (dutamik.id) | Tagline: Duta Media Informasi berKarya | Sukoharjo, Jawa Tengah'],
          [],
          ['Pemrakarsa', pemrakarsa, '', 'Kabupaten / Kota', kab],
          ['Kegiatan', kegiatan, '', 'Provinsi', prov],
          ['Tahun', tahun, '', 'Luas Terhitung', `${luasM2.toLocaleString('id-ID')} m² (${luasHa} Ha)`],
          [],
          ['PATOK', 'LATITUDE (DD)', 'LONGITUDE (DD)', 'UTM X (TIMUR)', 'UTM Y (UTARA)', 'ZONA UTM', 'JARAK BATAS (M)'],
          ...rowsData,
          [],
          ['Berkas dihasilkan otomatis oleh sistem DutaGeoSpasi (dutamik.id). Standar Datum WGS 84 dan Proyeksi UTM Nasional Kadastral.']
        ];
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        ws['!cols'] = [
          { wch: 12 },
          { wch: 18 },
          { wch: 18 },
          { wch: 18 },
          { wch: 18 },
          { wch: 12 },
          { wch: 18 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Daftar Patok');
        XLSX.writeFile(wb, 'DutaGeoSpasi_daftar_patok.xlsx');
        showToast('Berkas Excel patok batas (.xlsx) berhasil diunduh.', 'success');
        return;
      }

      let csvContent = `DUTAGEOSPASI : DAFTAR KOORDINAT PATOK BATAS TANAH\r\n`;
      csvContent += `Pengembang: Duta Digital Agensi (dutamik.id) | Tagline: Duta Media Informasi berKarya | Sukoharjo, Jawa Tengah\r\n\r\n`;
      csvContent += `Pemrakarsa,${pemrakarsa},,Kabupaten / Kota,${kab}\r\n`;
      csvContent += `Kegiatan,${kegiatan},,Provinsi,${prov}\r\n`;
      csvContent += `Tahun,${tahun},,Luas Terhitung,"${luasM2.toLocaleString('id-ID')} m² (${luasHa} Ha)"\r\n\r\n`;
      csvContent += `PATOK,LATITUDE (DD),LONGITUDE (DD),UTM X (TIMUR),UTM Y (UTARA),ZONA UTM,JARAK BATAS (M)\r\n`;
      rowsData.forEach(r => {
        csvContent += `${r[0]},${r[1]},${r[2]},${r[3]},${r[4]},${r[5]},${r[6]}\r\n`;
      });
      downloadFile(csvContent, 'DutaGeoSpasi_daftar_patok.csv', 'text/csv;charset=utf-8;');
      showToast('Berkas CSV koordinat patok berhasil diunduh.', 'success');
    }

    function exportCoordinatesOnly() {
      openExportCoordsModal();
    }

    function openExportCoordsModal() {
      if (!isMemberProActive()) {
        showToast('Fitur Ekspor Format CAD & Koordinat khusus Member PRO. Silakan masuk atau upgrade akun.', 'warn');
        openMemberModal();
        return;
      }
      ensureActiveVerticesFromDraw();
      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      if (!parts[0] || parts[0].length < 3) {
        showToast('Pilih atau gambar bidang tanah pada peta terlebih dahulu.', 'warn');
        return;
      }
      const modal = document.getElementById('modalExportCoords');
      if (modal) modal.style.display = 'flex';
    }

    function closeExportCoordsModal() {
      const modal = document.getElementById('modalExportCoords');
      if (modal) modal.style.display = 'none';
    }

    function downloadCoordsMap(fmt = 'txt') {
      if (!window._dgKey || window._dgKey !== 0x7E3A9) {
        showToast('Validasi struktur koordinat gagal.', 'crimson');
        return;
      }
      ensureActiveVerticesFromDraw();
      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      if (!parts[0] || parts[0].length < 3) return;

      const kab = activePinData?.kabkot || '-';
      const prov = activePinData?.provinsi || '-';
      let totalM2 = 0;
      parts.forEach(p => { totalM2 += calculatePolygonArea(p); });
      const luasM2 = Math.round(totalM2);
      const luasHa = (totalM2 / 10000).toFixed(4);

      if (fmt === 'csv') {
        let csv = 'Patok,Latitude,Longitude,UTM_X,UTM_Y,Zona_UTM,Jarak_Meter,Kabupaten,Provinsi\n';
        parts.forEach((pList, pIdx) => {
          const pfx = parts.length > 1 ? String.fromCharCode(65 + pIdx) : 'P';
          pList.forEach((v, idx) => {
            const nextV = pList[(idx + 1) % pList.length];
            const dist = L.latLng(v.lat, v.lng).distanceTo(L.latLng(nextV.lat, nextV.lng));
            const utm = getUtmCoordinates(v.lat, v.lng);
            csv += `${pfx}${idx + 1},${v.lat.toFixed(7)},${v.lng.toFixed(7)},${utm.x.toFixed(2)},${utm.y.toFixed(2)},${utm.zone},${dist.toFixed(2)},"${kab}","${prov}"\n`;
          });
        });
        downloadFile(csv, 'DutaGeoSpasi_koordinat_peta.csv', 'text/csv;charset=utf-8');
        showToast('Koordinat peta (CSV) berhasil diunduh.', 'success');
      } else {
        let txt = '# ====================================================\n';
        txt += '# DUTAGEOSPASI : KOORDINAT PETA WGS84 & UTM\n';
        txt += '# Domain     : https://geospasi.dutamik.id/SHP-Builder\n';
        txt += '# Pengembang : Duta Digital Agensi (dutamik.id)\n';
        txt += `# Lokasi     : Kabupaten ${kab}, Provinsi ${prov}\n`;
        txt += `# Luas Ukur  : ${luasM2.toLocaleString('id-ID')} m² (${luasHa} Ha)\n`;
        txt += '# ====================================================\n\n';
        txt += 'PATOK\tLATITUDE\tLONGITUDE\tUTM_X\tUTM_Y\tZONA\tJARAK(M)\n';
        parts.forEach((pList, pIdx) => {
          const pfx = parts.length > 1 ? String.fromCharCode(65 + pIdx) : 'P';
          pList.forEach((v, idx) => {
            const nextV = pList[(idx + 1) % pList.length];
            const dist = L.latLng(v.lat, v.lng).distanceTo(L.latLng(nextV.lat, nextV.lng));
            const utm = getUtmCoordinates(v.lat, v.lng);
            txt += `${pfx}${idx + 1}\t${v.lat.toFixed(7)}\t${v.lng.toFixed(7)}\t${utm.x.toFixed(2)}\t${utm.y.toFixed(2)}\t${utm.zone}\t${dist.toFixed(2)}\n`;
          });
        });
        downloadFile(txt, 'DutaGeoSpasi_koordinat_peta.txt', 'text/plain;charset=utf-8');
        showToast('Koordinat peta (TXT) berhasil diunduh.', 'success');
      }
    }

    function copyCoordsMapClipboard() {
      ensureActiveVerticesFromDraw();
      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      if (!parts[0] || parts[0].length < 3) return;
      let txt = 'PATOK\tLATITUDE\tLONGITUDE\tUTM_X\tUTM_Y\tJARAK(M)\n';
      parts.forEach((pList, pIdx) => {
        const pfx = parts.length > 1 ? String.fromCharCode(65 + pIdx) : 'P';
        pList.forEach((v, idx) => {
          const nextV = pList[(idx + 1) % pList.length];
          const dist = L.latLng(v.lat, v.lng).distanceTo(L.latLng(nextV.lat, nextV.lng));
          const utm = getUtmCoordinates(v.lat, v.lng);
          txt += `${pfx}${idx + 1}\t${v.lat.toFixed(7)}\t${v.lng.toFixed(7)}\t${utm.x.toFixed(2)}\t${utm.y.toFixed(2)}\t${dist.toFixed(2)}\n`;
        });
      });
      navigator.clipboard.writeText(txt).then(() => {
        showToast('Koordinat peta berhasil disalin ke clipboard.', 'success');
      });
    }

    function downloadCoordsCad(mode = 'scr') {
      if (!window._dgKey || window._dgKey !== 0x7E3A9) {
        showToast('Validasi format CAD gagal.', 'crimson');
        return;
      }
      ensureActiveVerticesFromDraw();
      const parts = (activeMultiParts && activeMultiParts.length > 1) ? activeMultiParts : [activeVertices];
      if (!parts[0] || parts[0].length < 3) return;

      if (mode === 'scr') {
        let scr = '; AutoCAD Script File generated by DutaGeoSpasi (dutamik.id)\n';
        scr += '; Sistem: UTM WGS84 Cartesian (X Easting, Y Northing)\n';
        scr += '_PLINE\n';
        parts.forEach((pList) => {
          pList.forEach((v) => {
            const utm = getUtmCoordinates(v.lat, v.lng);
            scr += `${utm.x.toFixed(3)},${utm.y.toFixed(3)}\n`;
          });
        });
        scr += '_C\n';
        scr += '_ZOOM\n_E\n';
        downloadFile(scr, 'DutaGeoSpasi_gambar_cad.scr', 'application/x-cad-script;charset=utf-8');
        showToast('Script AutoCAD (.SCR) berhasil diunduh. Seret berkas langsung ke layar AutoCAD!', 'success');
      } else if (mode === 'penz') {
        let penz = 'Point,Easting,Northing,Elevation,Description\n';
        let ptNum = 1;
        parts.forEach((pList, pIdx) => {
          const pfx = parts.length > 1 ? String.fromCharCode(65 + pIdx) : 'P';
          pList.forEach((v, idx) => {
            const utm = getUtmCoordinates(v.lat, v.lng);
            penz += `${ptNum},${utm.x.toFixed(3)},${utm.y.toFixed(3)},0.000,${pfx}${idx + 1}\n`;
            ptNum++;
          });
        });
        downloadFile(penz, 'DutaGeoSpasi_points_cad_penz.txt', 'text/plain;charset=utf-8');
        showToast('Format CAD PENZ (Point, Easting, Northing, Elev, Desc) berhasil diunduh.', 'success');
      } else {
        let xy = '';
        parts.forEach((pList) => {
          pList.forEach((v) => {
            const utm = getUtmCoordinates(v.lat, v.lng);
            xy += `${utm.x.toFixed(3)},${utm.y.toFixed(3)}\r\n`;
          });
        });
        downloadFile(xy, 'DutaGeoSpasi_koordinat_cad_xy.txt', 'text/plain;charset=utf-8');
        showToast('Format X,Y murni sistem CAD berhasil diunduh.', 'success');
      }
    }

    function exportGeoJSON() {
      if (!isMemberProActive()) {
        showToast('Fitur Ekspor GeoJSON khusus Member PRO. Silakan masuk atau upgrade akun.', 'warn');
        openMemberModal();
        return;
      }
      if (!window._dgKey || window._dgKey !== 0x7E3A9) {
        showToast('Validasi geometri GeoJSON gagal.', 'crimson');
        return;
      }
      ensureActiveVerticesFromDraw();
      let geojsonObj;
      const pemrakarsa = (document.getElementById('shpPemrakarsa')?.value.trim() || 'PEMOHON OSS RBA').toUpperCase();
      const kegiatan = (document.getElementById('shpKegiatan')?.value.trim() || 'KESESUAIAN KEGIATAN PEMANFAATAN RUANG (KKPR)').toUpperCase();
      const tahun = (document.getElementById('shpTahun')?.value.trim() || '2026').toUpperCase();
      const layerName = (document.getElementById('shpLayer')?.value.trim() || 'TAPAK PROYEK').toUpperCase();
      const provinsi = (document.getElementById('shpProvinsi')?.value.trim() || activePinData?.provinsi || '-').toUpperCase();
      const keterangan = (document.getElementById('shpKeterangan')?.value.trim() || activePinData?.alamat_lengkap || activePinData?.alamat || '-').toUpperCase();

      if (activeMultiParts && activeMultiParts.length > 1) {
        const coords = activeMultiParts.map(part => {
          const closed = [...part];
          if (closed.length > 0 && (closed[0].lat !== closed[closed.length-1].lat || closed[0].lng !== closed[closed.length-1].lng)) {
            closed.push(closed[0]);
          }
          return [closed.map(p => [p.lng, p.lat])];
        });
        const areaM2 = activeMultiParts.reduce((sum, p) => sum + calculatePolygonArea(p), 0);
        const luasHa = Number((areaM2 / 10000.0).toFixed(4));
        geojsonObj = {
          type: "FeatureCollection",
          properties: {
            APLIKASI: "DutaGeoSpasi",
            DEVELOPER: "Duta Digital Agensi",
            URL: "https://dutamik.id",
            TAGLINE: "Duta Media Informasi berKarya",
            LOKASI: "Sukoharjo, Jawa Tengah"
          },
          features: [{
            type: "Feature",
            properties: {
              PEMRAKARSA: pemrakarsa,
              KEGIATAN: kegiatan,
              TAHUN: tahun,
              PROVINSI: provinsi,
              KETERANGAN: keterangan,
              LAYER: layerName,
              LUAS: luasHa
            },
            geometry: {
              type: "MultiPolygon",
              coordinates: coords
            }
          }]
        };
      } else if (activeVertices && activeVertices.length >= 3) {
        const closed = [...activeVertices];
        if (closed.length > 0 && (closed[0].lat !== closed[closed.length-1].lat || closed[0].lng !== closed[closed.length-1].lng)) {
          closed.push(closed[0]);
        }
        const areaM2 = calculatePolygonArea(activeVertices);
        const luasHa = Number((areaM2 / 10000.0).toFixed(4));
        geojsonObj = {
          type: "FeatureCollection",
          properties: {
            APLIKASI: "DutaGeoSpasi",
            DEVELOPER: "Duta Digital Agensi",
            URL: "https://dutamik.id",
            TAGLINE: "Duta Media Informasi berKarya",
            LOKASI: "Sukoharjo, Jawa Tengah"
          },
          features: [{
            type: "Feature",
            properties: {
              PEMRAKARSA: pemrakarsa,
              KEGIATAN: kegiatan,
              TAHUN: tahun,
              PROVINSI: provinsi,
              KETERANGAN: keterangan,
              LAYER: layerName,
              LUAS: luasHa
            },
            geometry: {
              type: "Polygon",
              coordinates: [closed.map(p => [p.lng, p.lat])]
            }
          }]
        };
      } else {
        geojsonObj = drawnItems.toGeoJSON();
      }

      if (!geojsonObj || !geojsonObj.features || geojsonObj.features.length === 0) {
        showToast('Belum ada bidang tanah aktif untuk diekspor.', 'warn');
        return;
      }
      const jsonStr = JSON.stringify(geojsonObj, null, 2);
      downloadFile(jsonStr, 'DutaGeoSpasi_bidang_tanah.geojson', 'application/geo+json');
      showToast('Berkas GeoJSON DutaGeoSpasi berhasil diunduh!', 'success');
    }

    var currentAttrTab = 'oss';

    function switchAttrTab(tab) {
      if (tab === 'custom' && !(typeof isMemberProActive === 'function' && isMemberProActive())) {
        showToast('Pengaturan atribut terkunci untuk akun Gratis (Atribut: LAYER: geospasi.dutamik.id). Upgrade ke PRO untuk mengaktifkan.', 'warn');
        openMemberModal();
        return;
      }
      currentAttrTab = tab;
      const btnOss = document.getElementById('tabBtnOss');
      const btnCustom = document.getElementById('tabBtnCustom');
      const contentOss = document.getElementById('tabContentOss');
      const contentCustom = document.getElementById('tabContentCustom');
      const badge = document.getElementById('attrModeBadge');
      if (tab === 'custom') {
        if (btnOss) btnOss.classList.remove('active');
        if (btnCustom) btnCustom.classList.add('active');
        if (contentOss) contentOss.style.display = 'none';
        if (contentCustom) contentCustom.style.display = 'flex';
        if (badge) {
          badge.textContent = 'KUSTOM GIS';
          badge.className = 'badge-pill amber';
        }
        const tbody = document.getElementById('customAttrTbody');
        if (tbody && tbody.children.length === 0) {
          initDefaultCustomAttrs();
        }
      } else {
        if (btnOss) btnOss.classList.add('active');
        if (btnCustom) btnCustom.classList.remove('active');
        if (contentOss) contentOss.style.display = 'flex';
        if (contentCustom) contentCustom.style.display = 'none';
        if (badge) {
          badge.textContent = 'OSS / AMDALNET';
          badge.className = 'badge-pill blue';
        }
      }
    }

    function addCustomAttrRow(name, type, val) {
      if (!(typeof isMemberProActive === 'function' && isMemberProActive())) {
        showToast('Fitur tambah atribut kustom khusus Member PRO.', 'warn');
        openMemberModal();
        return;
      }
      const tbody = document.getElementById('customAttrTbody');
      if (!tbody) return;
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border-light)';
      const safeName = (name || '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 10);
      const safeType = type || 'C';
      const safeVal = val != null ? val : '';

      tr.innerHTML = `
        <td style="padding: 3px 4px;">
          <input type="text" class="custom-attr-name" value="${safeName}" placeholder="KOLOM" maxlength="10" style="text-transform: uppercase; font-family: 'JetBrains Mono', monospace; font-weight: 600;" oninput="this.value = this.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 10)">
        </td>
        <td style="padding: 3px 4px;">
          <select class="custom-attr-type">
            <option value="C"${safeType === 'C' ? ' selected' : ''}>C (Teks)</option>
            <option value="N"${safeType === 'N' ? ' selected' : ''}>N (Angka)</option>
            <option value="D"${safeType === 'D' ? ' selected' : ''}>D (Tanggal)</option>
          </select>
        </td>
        <td style="padding: 3px 4px;">
          <input type="text" class="custom-attr-val" value="${safeVal}" placeholder="Nilai">
        </td>
        <td style="padding: 3px 4px; text-align: center;">
          <button type="button" onclick="removeCustomAttrRow(this)" style="border: none; background: transparent; cursor: pointer; color: var(--crimson); padding: 2px;" aria-label="Hapus Kolom">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    function removeCustomAttrRow(btn) {
      const tr = btn.closest('tr');
      if (tr) tr.remove();
    }

    function initDefaultCustomAttrs() {
      const tbody = document.getElementById('customAttrTbody');
      if (!tbody) return;
      tbody.innerHTML = '';
      const nib = activePinData?.nib || '00000';
      const pemilik = activePinData?.nama_pemilik || '';
      const hak = activePinData?.tipe_hak || 'HAK MILIK';
      const desa = activePinData?.desa || '';
      let areaM2 = 0;
      if (activeMultiParts && activeMultiParts.length > 1) {
        areaM2 = activeMultiParts.reduce((sum, p) => sum + calculatePolygonArea(p), 0);
      } else if (activeVertices && activeVertices.length >= 3) {
        areaM2 = calculatePolygonArea(activeVertices);
      }
      addCustomAttrRow('NIB', 'C', nib);
      addCustomAttrRow('PEMILIK', 'C', pemilik);
      addCustomAttrRow('HAK_TANAH', 'C', hak);
      addCustomAttrRow('DESA', 'C', desa);
      addCustomAttrRow('LUAS_M2', 'N', Math.round(areaM2));
    }

    function getCustomFieldsFromTable() {
      const tbody = document.getElementById('customAttrTbody');
      if (!tbody) return [];
      const rows = tbody.querySelectorAll('tr');
      const results = [];
      rows.forEach(r => {
        const nameInput = r.querySelector('.custom-attr-name');
        const typeSelect = r.querySelector('.custom-attr-type');
        const valInput = r.querySelector('.custom-attr-val');
        const name = (nameInput?.value.trim() || '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 10);
        if (name) {
          const type = typeSelect?.value || 'C';
          const val = valInput?.value.trim() || '';
          results.push({ name, type, val, len: type === 'N' ? 16 : (type === 'D' ? 8 : 254), dec: type === 'N' ? 2 : 0 });
        }
      });
      return results;
    }

    function openLegalModal(tab) {
      const page = (tab === 'privacy' ? 'jaminan-privasi.html' : (tab === 'terms' ? 'syarat-ketentuan.html' : (tab === 'disclaimer' ? 'penafian-layanan.html' : (tab === 'guide' ? 'panduan-fitur.html' : (tab === 'contact' ? 'hubungi-kami.html' : 'bantuan.html')))));
      window.open(page, '_blank');
    }

    function closeLegalModal() {}

    async function triggerShpDownloadFromActive() {
      if (!activeVertices || activeVertices.length < 3) {
        showToast('Pilih atau buat bidang tanah pada peta terlebih dahulu.', 'warn');
        return;
      }

      const isPro = (typeof isMemberProActive === 'function') ? isMemberProActive() : false;

      let areaM2 = 0;
      let partsCoords = [];
      if (activeMultiParts && activeMultiParts.length > 1) {
        partsCoords = activeMultiParts.map(part => part.map(v => [v.lng, v.lat]));
        areaM2 = activeMultiParts.reduce((sum, p) => sum + calculatePolygonArea(p), 0);
      } else {
        partsCoords = [activeVertices.map(v => [v.lng, v.lat])];
        areaM2 = calculatePolygonArea(activeVertices);
      }
      const luasHa = Number((areaM2 / 10000.0).toFixed(4));

      if (!isPro && areaM2 > 150) {
        showToast(`Ekspor Shapefile akun Gratis dibatasi maksimal luas 150 m². Luas bidang saat ini: ${Math.round(areaM2).toLocaleString('id-ID')} m². Silakan upgrade ke Member PRO untuk luas tanpa batas.`, 'warn');
        openMemberModal();
        return;
      }

      let attrs = {};
      if (!isPro) {
        attrs = {
          _baseFileName: 'geospasi',
          _zipDownloadName: 'geospasi.zip',
          _customFields: [
            { name: 'LAYER', type: 'C', len: 254, dec: 0, val: 'geospasi.dutamik.id' }
          ]
        };
      } else {
        if (currentAttrTab === 'custom') {
          const customRows = getCustomFieldsFromTable();
          if (customRows.length === 0) {
            showToast('Tambahkan minimal 1 kolom atribut kustom.', 'warn');
            return;
          }
          attrs._customFields = customRows;
        } else {
          const pemrakarsa = (document.getElementById('shpPemrakarsa')?.value.trim() || 'PEMOHON OSS RBA').toUpperCase();
          const kegiatan = (document.getElementById('shpKegiatan')?.value.trim() || 'KKPR / PERIZINAN BERUSAHA').toUpperCase();
          const tahun = (document.getElementById('shpTahun')?.value.trim() || '2026').toUpperCase();
          const layerName = (document.getElementById('shpLayer')?.value.trim() || 'TAPAK PROYEK').toUpperCase();
          const provinsi = (document.getElementById('shpProvinsi')?.value.trim() || activePinData?.provinsi || '-').toUpperCase();
          const keterangan = (document.getElementById('shpKeterangan')?.value.trim() || activePinData?.alamat_lengkap || activePinData?.alamat || '-').toUpperCase();

          attrs = {
            PEMRAKARSA: pemrakarsa,
            KEGIATAN: kegiatan,
            TAHUN: tahun,
            PROVINSI: provinsi,
            KETERANGAN: keterangan,
            LAYER: layerName,
            LUAS: luasHa
          };
        }
        const safeLayer = (document.getElementById('shpLayer')?.value.trim() || 'bidang').toLowerCase().replace(/[^a-z0-9_]/g, '_');
        attrs._baseFileName = `DutaGeoSpasi_${safeLayer}`;
        attrs._zipDownloadName = `DutaGeoSpasi_shapefile_${safeLayer}.zip`;
      }

      showToast('Menyusun berkas ESRI Shapefile ZIP...', 'info');

      try {
        window._dgKey = 0x7E3A9;
        generateShapefileZipClient(partsCoords, attrs);
      } catch (e) {
        showToast('Gagal membuat paket Shapefile: ' + e.message, 'crimson');
      }
    }

    function generateShapefileZipClient(parts, attrs) {
      return new Promise((resolve, reject) => {
        try {
          if (!window._dgKey || window._dgKey !== 0x7E3A9) {
            throw new Error("Checksum integritas spasial tidak valid.");
          }
          const normParts = [];
          const allPts = [];
          for (let p of parts) {
            let pts = p.map(pt => [Number(pt[0]), Number(pt[1])]);
            if (pts.length < 3) continue;
            if (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1]) {
              pts.push([pts[0][0], pts[0][1]]);
            }
            normParts.push(pts);
            allPts.push(...pts);
          }
          if (normParts.length === 0) throw new Error("Tidak ada geometri poligon valid");

          let xmin = allPts[0][0], xmax = allPts[0][0], ymin = allPts[0][1], ymax = allPts[0][1];
          for (let pt of allPts) {
            if (pt[0] < xmin) xmin = pt[0];
            if (pt[0] > xmax) xmax = pt[0];
            if (pt[1] < ymin) ymin = pt[1];
            if (pt[1] > ymax) ymax = pt[1];
          }

          const numParts = normParts.length;
          const numPoints = allPts.length;
          const contentWords = 22 + (numParts * 2) + (numPoints * 8);
          const recBytes = 8 + (contentWords * 2);
          const fileBytes = 100 + recBytes;
          const fileWords = fileBytes / 2;

          const shpBuffer = new ArrayBuffer(fileBytes);
          const shpView = new DataView(shpBuffer);
          const shpUint8 = new Uint8Array(shpBuffer);

          shpView.setInt32(0, 9994, false);
          shpView.setInt32(24, fileWords, false);
          shpView.setInt32(28, 1000, true);
          shpView.setInt32(32, 5, true);
          shpView.setFloat64(36, xmin, true);
          shpView.setFloat64(44, ymin, true);
          shpView.setFloat64(52, xmax, true);
          shpView.setFloat64(60, ymax, true);

          shpView.setInt32(100, 1, false);
          shpView.setInt32(104, contentWords, false);
          shpView.setInt32(108, 5, true);
          shpView.setFloat64(112, xmin, true);
          shpView.setFloat64(120, ymin, true);
          shpView.setFloat64(128, xmax, true);
          shpView.setFloat64(136, ymax, true);
          shpView.setInt32(144, numParts, true);
          shpView.setInt32(148, numPoints, true);

          let curOffset = 152;
          let pIndex = 0;
          for (let p of normParts) {
            shpView.setInt32(curOffset, pIndex, true);
            curOffset += 4;
            pIndex += p.length;
          }
          for (let p of normParts) {
            for (let pt of p) {
              shpView.setFloat64(curOffset, pt[0], true);
              shpView.setFloat64(curOffset + 8, pt[1], true);
              curOffset += 16;
            }
          }

          const shxBytes = 100 + 8;
          const shxBuffer = new ArrayBuffer(shxBytes);
          const shxView = new DataView(shxBuffer);
          shxView.setInt32(0, 9994, false);
          shxView.setInt32(24, shxBytes / 2, false);
          shxView.setInt32(28, 1000, true);
          shxView.setInt32(32, 5, true);
          shxView.setFloat64(36, xmin, true);
          shxView.setFloat64(44, ymin, true);
          shxView.setFloat64(52, xmax, true);
          shxView.setFloat64(60, ymax, true);
          shxView.setInt32(100, 50, false);
          shxView.setInt32(104, contentWords, false);

          let fields = [];
          if (attrs._customFields && attrs._customFields.length > 0) {
            fields = attrs._customFields.map(f => {
              let name = (f.name || 'ATTR').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 10);
              if (!name) name = 'ATTR';
              let type = f.type === 'N' ? 'N' : (f.type === 'D' ? 'D' : 'C');
              let len = type === 'N' ? 16 : (type === 'D' ? 8 : (Math.min(parseInt(f.len) || 254, 254)));
              let dec = type === 'N' ? (parseInt(f.dec) || 2) : 0;
              return { name, type, len, dec, val: f.val };
            });
          } else {
            fields = [
              { name: "PEMRAKARSA", type: "C", len: 254, dec: 0, val: attrs.PEMRAKARSA || 'PEMOHON OSS RBA' },
              { name: "KEGIATAN", type: "C", len: 254, dec: 0, val: attrs.KEGIATAN || 'KKPR / PERIZINAN BERUSAHA' },
              { name: "TAHUN", type: "C", len: 10, dec: 0, val: attrs.TAHUN != null ? String(attrs.TAHUN) : '2026' },
              { name: "PROVINSI", type: "C", len: 100, dec: 0, val: attrs.PROVINSI || '-' },
              { name: "KETERANGAN", type: "C", len: 254, dec: 0, val: attrs.KETERANGAN || '-' },
              { name: "LAYER", type: "C", len: 100, dec: 0, val: attrs.LAYER || 'TAPAK PROYEK' },
              { name: "LUAS", type: "N", len: 16, dec: 4, val: attrs.LUAS }
            ];
          }

          const headerLen = 32 + (fields.length * 32) + 1;
          let recordLen = 1;
          fields.forEach(f => recordLen += f.len);
          const dbfBytes = headerLen + recordLen + 1;
          const dbfBuffer = new ArrayBuffer(dbfBytes);
          const dbfView = new DataView(dbfBuffer);
          const dbfUint8 = new Uint8Array(dbfBuffer);

          dbfView.setUint8(0, 0x03);
          dbfView.setUint8(1, 26);
          dbfView.setUint8(2, 10);
          dbfView.setUint8(3, 5);
          dbfView.setUint32(4, 1, true);
          dbfView.setUint16(8, headerLen, true);
          dbfView.setUint16(10, recordLen, true);

          let fOffset = 32;
          fields.forEach(f => {
            for (let i = 0; i < 11; i++) {
              dbfView.setUint8(fOffset + i, i < f.name.length ? f.name.charCodeAt(i) : 0);
            }
            dbfView.setUint8(fOffset + 11, f.type.charCodeAt(0));
            dbfView.setUint8(fOffset + 16, f.len);
            dbfView.setUint8(fOffset + 17, f.dec);
            fOffset += 32;
          });
          dbfView.setUint8(fOffset, 0x0D);

          let recOffset = headerLen;
          dbfView.setUint8(recOffset++, 0x20);

          fields.forEach(f => {
            if (f.type === 'N') {
              const num = (typeof f.val === 'number') ? f.val : parseFloat(f.val) || 0;
              const numStr = num.toFixed(f.dec).padStart(f.len, ' ').slice(0, f.len);
              for (let i = 0; i < f.len; i++) {
                dbfView.setUint8(recOffset + i, i < numStr.length ? numStr.charCodeAt(i) : 0x20);
              }
              recOffset += f.len;
            } else if (f.type === 'D') {
              const dStr = String(f.val || '').replace(/[^0-9]/g, '').slice(0, 8).padEnd(8, ' ');
              for (let i = 0; i < 8; i++) {
                dbfView.setUint8(recOffset + i, i < dStr.length ? dStr.charCodeAt(i) : 0x20);
              }
              recOffset += 8;
            } else {
              const str = String(f.val != null ? f.val : '').slice(0, f.len);
              for (let i = 0; i < f.len; i++) {
                dbfView.setUint8(recOffset + i, i < str.length ? str.charCodeAt(i) : 0x20);
              }
              recOffset += f.len;
            }
          });
          dbfUint8[recOffset] = 0x1A;

          const prj = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

          const zip = new JSZip();
          const baseName = attrs._baseFileName || (isMemberProActive() ? "DutaGeoSpasi_bidang" : "geospasi");
          const zipName = attrs._zipDownloadName || (isMemberProActive() ? "DutaGeoSpasi_shapefile_bidang.zip" : "geospasi.zip");

          zip.file(`${baseName}.shp`, shpBuffer);
          zip.file(`${baseName}.shx`, shxBuffer);
          zip.file(`${baseName}.dbf`, dbfBuffer);
          zip.file(`${baseName}.prj`, prj);
          zip.file(`${baseName}.cpg`, "UTF-8\n");

          zip.generateAsync({ type: "blob" }).then(blob => {
            downloadFile(blob, zipName, "application/zip");
            showToast(`Paket Shapefile ESRI ZIP (${zipName}) berhasil diunduh!`, "success");
            resolve();
          }).catch(reject);
        } catch (err) {
          reject(err);
        }
      });
    }

    function exportKML() {
      if (!isMemberProActive()) {
        showToast('Fitur Ekspor KML khusus Member PRO. Silakan masuk atau upgrade akun.', 'warn');
        openMemberModal();
        return;
      }
      let features = [];
      if (activeMultiParts && activeMultiParts.length > 1) {
        features = activeMultiParts.map((part, pIdx) => {
          const closed = [...part];
          if (closed.length > 0 && (closed[0].lat !== closed[closed.length-1].lat || closed[0].lng !== closed[closed.length-1].lng)) {
            closed.push(closed[0]);
          }
          return {
            name: `Bidang ${activePinData?.fid || 'Gabungan'} (Bagian ${pIdx + 1})`,
            coords: closed.map(c => `${c.lng},${c.lat},0`).join(' ')
          };
        });
      } else if (activeVertices && activeVertices.length >= 3) {
        const closed = [...activeVertices];
        if (closed[0].lat !== closed[closed.length-1].lat || closed[0].lng !== closed[closed.length-1].lng) {
          closed.push(closed[0]);
        }
        features = [{
          name: `Bidang ${activePinData?.fid || 'Tanah'}`,
          coords: closed.map(c => `${c.lng},${c.lat},0`).join(' ')
        }];
      }

      if (features.length === 0 && typeof drawnItems !== 'undefined') {
        drawnItems.eachLayer(layer => {
          if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
            const pts = layer.getLatLngs()[0];
            if (pts && pts.length >= 3) {
              const closed = [...pts];
              if (closed[0].lat !== closed[closed.length - 1].lat || closed[0].lng !== closed[closed.length - 1].lng) {
                closed.push(closed[0]);
              }
              features.push({
                name: 'Bidang Gambar Mandiri',
                coords: closed.map(c => `${c.lng},${c.lat},0`).join(' ')
              });
            }
          }
        });
      }

      if (features.length === 0) {
        showToast('Belum ada bidang tanah aktif untuk diekspor.', 'warn');
        return;
      }
      let kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n<name>DutaGeoSpasi Batas Bidang Kadaster</name>\n<description>Pengembang: Duta Digital Agensi (dutamik.id) - Duta Media Informasi berKarya</description>\n`;
      features.forEach(f => {
        kml += `  <Placemark>\n    <name>${f.name}</name>\n    <Polygon>\n      <outerBoundaryIs>\n        <LinearRing>\n          <coordinates>${f.coords}</coordinates>\n      </LinearRing>\n    </outerBoundaryIs>\n  </Polygon>\n  </Placemark>\n`;
      });
      kml += `</Document>\n</kml>`;
      downloadFile(kml, 'DutaGeoSpasi_batas_bidang.kml', 'application/vnd.google-earth.kml+xml');
      showToast('Berkas KML DutaGeoSpasi berhasil diunduh!', 'success');
    }

    function importSpatialFile(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(evt) {
        try {
          const raw = evt.target.result;
          const isKml = (file.name && file.name.toLowerCase().endsWith('.kml')) || raw.trim().startsWith('<?xml') || raw.includes('<kml');
          if (isKml) {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(raw, 'text/xml');
            const coordNodes = xmlDoc.getElementsByTagName('coordinates');
            if (coordNodes.length === 0) throw new Error('Tidak ditemukan tag coordinates pada berkas KML');
            const allPolys = [];
            for (let i = 0; i < coordNodes.length; i++) {
              const rawCoords = coordNodes[i].textContent.trim().split(/\s+/);
              const pts = [];
              for (let item of rawCoords) {
                const parts = item.split(',');
                if (parts.length >= 2) {
                  const lng = parseFloat(parts[0]);
                  const lat = parseFloat(parts[1]);
                  if (!isNaN(lat) && !isNaN(lng)) {
                    pts.push({ lat, lng });
                  }
                }
              }
              if (pts.length >= 3) {
                if (pts[0].lat === pts[pts.length - 1].lat && pts[0].lng === pts[pts.length - 1].lng) {
                  pts.pop();
                }
                if (pts.length >= 3) allPolys.push(pts);
              }
            }
            if (allPolys.length === 0) throw new Error('Geometri poligon tidak ditemukan di dalam berkas KML');
            allPolys.forEach(pts => {
              const poly = L.polygon(pts.map(p => [p.lat, p.lng]), {
                color: '#0a2e5c',
                weight: 2.5,
                fillColor: '#0a2e5c',
                fillOpacity: 0.2
              });
              drawnItems.addLayer(poly);
            });
            activeVertices = allPolys[0];
            activeMultiParts = allPolys.length > 1 ? allPolys : null;
            isParcelLocked = true;
            renderCanvasPolygon(true);
            const allPts = allPolys.flat();
            map.fitBounds(L.latLngBounds(allPts.map(p => [p.lat, p.lng])), { padding: [40, 40] });
            switchTab('tab-bidang');
            showToast(`KML berhasil diimpor: ${allPolys.length} bidang poligon.`, 'success');
            return;
          }

          const geojson = JSON.parse(raw);
          const importedLayer = L.geoJSON(geojson, {
            style: { color: '#0a2e5c', weight: 2.5, fillOpacity: 0.2 }
          });
          importedLayer.eachLayer(l => drawnItems.addLayer(l));
          map.fitBounds(importedLayer.getBounds(), { padding: [40, 40] });
          importedLayer.eachLayer(l => {
            if ((l instanceof L.Polygon || l instanceof L.Rectangle) && (!activeVertices || activeVertices.length < 3)) {
              const latlngs = l.getLatLngs()[0];
              if (latlngs && latlngs.length >= 3) {
                activeVertices = latlngs.map(p => ({ lat: p.lat, lng: p.lng }));
                isParcelLocked = true;
                renderCanvasPolygon(true);
              }
            }
          });
          switchTab('tab-bidang');
          showToast('Berhasil mengimpor batas bidang spasial GeoJSON.', 'success');
        } catch (err) {
          showToast('Gagal membaca berkas spasial: ' + err.message, 'error');
        }
      };
      reader.readAsText(file);
    }
