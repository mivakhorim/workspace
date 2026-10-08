async function handleImportZipFile(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        showToast('Membaca arsip ZIP Shapefile...', 'info');
        const zip = await JSZip.loadAsync(file);
        const shpFileEntry = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.shp'));
        if (!shpFileEntry) {
          showToast('Berkas .shp tidak ditemukan di dalam arsip ZIP.', 'crimson');
          return;
        }

        const buffer = await shpFileEntry.async('arraybuffer');
        const view = new DataView(buffer);

        if (view.byteLength < 100) {
          showToast('Format berkas .shp tidak valid atau rusak.', 'crimson');
          return;
        }

        const fileCode = view.getInt32(0, false);
        if (fileCode !== 9994) {
          showToast('Kode header ESRI Shapefile tidak cocok.', 'crimson');
          return;
        }

        let offset = 100;
        const parsedPolygons = [];

        while (offset + 8 <= view.byteLength) {
          const recNum = view.getInt32(offset, false);
          const contentLenWords = view.getInt32(offset + 4, false);
          const contentBytes = contentLenWords * 2;
          const recEnd = offset + 8 + contentBytes;
          if (recEnd > view.byteLength) break;

          const shapeType = view.getInt32(offset + 8, true);
          if (shapeType === 5) {
            const numParts = view.getInt32(offset + 8 + 36, true);
            const numPoints = view.getInt32(offset + 8 + 40, true);
            const partStarts = [];
            for (let p = 0; p < numParts; p++) {
              partStarts.push(view.getInt32(offset + 8 + 44 + p * 4, true));
            }
            const ptsStartOffset = offset + 8 + 44 + numParts * 4;

            for (let p = 0; p < numParts; p++) {
              const sIdx = partStarts[p];
              const eIdx = (p + 1 < numParts) ? partStarts[p + 1] : numPoints;
              const partPts = [];
              for (let i = sIdx; i < eIdx; i++) {
                const px = view.getFloat64(ptsStartOffset + i * 16, true);
                const py = view.getFloat64(ptsStartOffset + i * 16 + 8, true);
                partPts.push({ lat: Number(py.toFixed(7)), lng: Number(px.toFixed(7)) });
              }
              if (partPts.length > 2) {
                if (partPts[0].lat === partPts[partPts.length - 1].lat && partPts[0].lng === partPts[partPts.length - 1].lng) {
                  partPts.pop();
                }
                if (partPts.length >= 3) {
                  parsedPolygons.push(partPts);
                }
              }
            }
          }
          offset = recEnd;
        }

        if (parsedPolygons.length === 0) {
          showToast('Tidak ada geometri poligon (Shape Type 5) yang ditemukan di berkas SHP.', 'warn');
          return;
        }

        if (parsedPolygons.length === 1) {
          activeVertices = parsedPolygons[0];
          activeMultiParts = null;
        } else {
          activeMultiParts = parsedPolygons;
          activeVertices = parsedPolygons[0];
        }
        isParcelLocked = true;

        const allPts = parsedPolygons.flat();
        const bounds = L.latLngBounds(allPts.map(p => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [40, 40] });

        renderCanvasPolygon(true);
        renderVertexHandles();
        renderEdgeDistanceLabels();

        const totalArea = parsedPolygons.reduce((sum, poly) => sum + calculatePolygonArea(poly), 0);
        const hudBpn = document.getElementById('hudBpnArea');
        if (hudBpn) hudBpn.innerText = `${Math.round(totalArea).toLocaleString('id-ID')} m²`;

        if (typeof renderCoordinatesTable === 'function') renderCoordinatesTable();
        showToast(`Shapefile ZIP berhasil dimuat: ${parsedPolygons.length} bidang (${Math.round(totalArea).toLocaleString('id-ID')} m²). Bidang siap diedit.`, 'success');
        switchTab('tab-bidang');
      } catch (err) {
        showToast('Gagal memproses berkas ZIP Shapefile: ' + err.message, 'crimson');
      } finally {
        event.target.value = '';
      }
    }

    function openServerModal() {
      const modal = document.getElementById('serverModal');
      if (modal) modal.style.display = 'flex';
      const inputB = document.getElementById('inputBpnGatewayUrl');
      if (inputB) inputB.value = localStorage.getItem('custom_bpn_gateway_url') || '';
    }
