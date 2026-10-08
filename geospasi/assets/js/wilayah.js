function copyActiveWilayahToKop() {
      const desaSel = document.getElementById('selectDesa');
      const kecSel = document.getElementById('selectKecamatan');
      const kabSel = document.getElementById('selectKabupaten');
      const provSel = document.getElementById('selectProvinsi');

      const desaVal = (desaSel && desaSel.selectedIndex > 0) ? desaSel.options[desaSel.selectedIndex].text : (activePinData?.desa || '');
      const kecVal = (kecSel && kecSel.selectedIndex > 0) ? kecSel.options[kecSel.selectedIndex].text : (activePinData?.kecamatan || '');
      const kabVal = (kabSel && kabSel.selectedIndex > 0) ? kabSel.options[kabSel.selectedIndex].text : (activePinData?.kabkot || '');
      const provVal = (provSel && provSel.selectedIndex > 0) ? provSel.options[provSel.selectedIndex].text : (activePinData?.provinsi || '');

      const inDesa = document.getElementById('kopDesaInput');
      const inKec = document.getElementById('kopKecamatanInput');
      const inKab = document.getElementById('kopKabkotInput');
      const inProv = document.getElementById('kopProvinsiInput');

      if (inDesa && desaVal) inDesa.value = desaVal.toUpperCase();
      if (inKec && kecVal) inKec.value = kecVal.toUpperCase();
      if (inKab && kabVal) inKab.value = kabVal.toUpperCase();
      if (inProv && provVal) inProv.value = provVal.toUpperCase();

      showToast('Wilayah administratif berhasil disalin ke etiket.', 'info');
    }

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

    async function initWilayahDropdowns() {
      if (isWilayahDropdownsLoaded) return;
      const ddProv = document.getElementById('ddProvinsi');
      if (!ddProv) return;
      ddProv.innerHTML = '<option value="">- Memuat Data Wilayah Indonesia... -</option>';
      ddProv.disabled = true;

      const apiBase = getBpnGatewayBase();
      const hasBackend = Boolean(apiBase && apiBase.startsWith('https://'));
      if (hasBackend) {
        try {
          const res = await fetch(`${apiBase}/api/wilayah/provinsi`);
          if (res.ok) {
            const provs = await res.json();
            if (Array.isArray(provs) && provs.length > 0) {
              cacheProvinsi.length = 0;
              cacheProvinsi.push(...provs);
              ddProv.innerHTML = '<option value="">- Pilih Provinsi -</option>';
              provs.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.kode;
                opt.textContent = p.nama;
                ddProv.appendChild(opt);
              });
              ddProv.disabled = false;
              isWilayahDropdownsLoaded = true;
              return;
            }
          }
        } catch (err) {
        }
      }

      try {
        const fetchUrl = hasBackend ? `${apiBase}/api/wilayah/all.json` : 'data/wilayah_indonesia.json';
        let res = await fetch(fetchUrl);
        if (!res.ok && hasBackend) {
          res = await fetch('data/wilayah_indonesia.json');
        }
        if (res.ok) {
          wilayahHierarchyData = await res.json();
          if (Array.isArray(wilayahHierarchyData) && wilayahHierarchyData.length > 0) {
            ddProv.innerHTML = '<option value="">- Pilih Provinsi -</option>';
            wilayahHierarchyData.forEach(p => {
              const opt = document.createElement('option');
              opt.value = p.id;
              opt.textContent = p.n;
              ddProv.appendChild(opt);
            });
            ddProv.disabled = false;
            isWilayahDropdownsLoaded = true;
            return;
          }
        }
      } catch (err) {}
      ddProv.innerHTML = '<option value="">Pilih lokasi manual di peta</option>';
      ddProv.disabled = false;
    }

    async function onProvinsiChange() {
      const ddProv = document.getElementById('ddProvinsi');
      const ddKab = document.getElementById('ddKabupaten');
      const ddKec = document.getElementById('ddKecamatan');
      const ddDesa = document.getElementById('ddDesa');
      const card = document.getElementById('wilayahSelectedCard');

      const provKode = ddProv.value;
      const provName = ddProv.options[ddProv.selectedIndex]?.text || '';

      ddKab.innerHTML = '<option value="">- Memuat Kabupaten / Kota... -</option>';
      ddKab.disabled = true;
      ddKec.innerHTML = '<option value="">- Pilih Kabupaten Dahulu -</option>';
      ddKec.disabled = true;
      ddDesa.innerHTML = '<option value="">- Pilih Kecamatan Dahulu -</option>';
      ddDesa.disabled = true;
      if (card) card.style.display = 'none';

      if (!provKode) {
        ddKab.innerHTML = '<option value="">- Pilih Provinsi Dahulu -</option>';
        return;
      }

      const apiBase = getBpnGatewayBase();
      const hasBackend = Boolean(apiBase && apiBase.startsWith('https://'));
      let kabs = null;

      if (cacheKabupaten.has(provKode)) {
        kabs = cacheKabupaten.get(provKode);
      } else if (hasBackend) {
        try {
          const res = await fetch(`${apiBase}/api/wilayah/kabupaten?prov_kode=${encodeURIComponent(provKode)}`);
          if (res.ok) {
            kabs = await res.json();
            if (Array.isArray(kabs)) {
              cacheKabupaten.set(provKode, kabs);
            }
          }
        } catch (e) {
        }
      }

      if (!kabs && wilayahHierarchyData) {
        const provObj = wilayahHierarchyData.find(p => p.id === provKode);
        if (provObj && provObj.k) {
          kabs = provObj.k.map(k => ({ kode: k.id, nama: k.n, raw: k }));
          cacheKabupaten.set(provKode, kabs);
        }
      }

      if (Array.isArray(kabs) && kabs.length > 0) {
        ddKab.innerHTML = '<option value="">- Pilih Kabupaten / Kota -</option>';
        kabs.forEach(k => {
          const opt = document.createElement('option');
          opt.value = k.kode;
          opt.textContent = k.nama;
          ddKab.appendChild(opt);
        });
        ddKab.disabled = false;
      } else {
        ddKab.innerHTML = '<option value="">Kabupaten tidak tersedia</option>';
      }

      geocodeAndFly(`${provName}, Indonesia`, 9);
    }

    async function onKabupatenChange() {
      const ddProv = document.getElementById('ddProvinsi');
      const ddKab = document.getElementById('ddKabupaten');
      const ddKec = document.getElementById('ddKecamatan');
      const ddDesa = document.getElementById('ddDesa');
      const card = document.getElementById('wilayahSelectedCard');

      const provKode = ddProv.value;
      const kabKode = ddKab.value;
      const provName = ddProv.options[ddProv.selectedIndex]?.text || '';
      const kabName = ddKab.options[ddKab.selectedIndex]?.text || '';

      ddKec.innerHTML = '<option value="">- Memuat Kecamatan... -</option>';
      ddKec.disabled = true;
      ddDesa.innerHTML = '<option value="">- Pilih Kecamatan Dahulu -</option>';
      ddDesa.disabled = true;
      if (card) card.style.display = 'none';

      if (!kabKode) {
        ddKec.innerHTML = '<option value="">- Pilih Kabupaten Dahulu -</option>';
        return;
      }

      const apiBase = getBpnGatewayBase();
      const hasBackend = Boolean(apiBase && apiBase.startsWith('https://'));
      let kecs = null;

      if (cacheKecamatan.has(kabKode)) {
        kecs = cacheKecamatan.get(kabKode);
      } else if (hasBackend) {
        try {
          const res = await fetch(`${apiBase}/api/wilayah/kecamatan?kab_kode=${encodeURIComponent(kabKode)}`);
          if (res.ok) {
            kecs = await res.json();
            if (Array.isArray(kecs)) {
              cacheKecamatan.set(kabKode, kecs);
            }
          }
        } catch (e) {
        }
      }

      if (!kecs && wilayahHierarchyData) {
        const provObj = wilayahHierarchyData.find(p => p.id === provKode);
        const kabObj = provObj?.k?.find(k => k.id === kabKode);
        if (kabObj && kabObj.c) {
          kecs = kabObj.c.map(c => ({ kode: c.id, nama: c.n, raw: c }));
          cacheKecamatan.set(kabKode, kecs);
        }
      }

      if (Array.isArray(kecs) && kecs.length > 0) {
        ddKec.innerHTML = '<option value="">- Pilih Kecamatan -</option>';
        kecs.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.kode;
          opt.textContent = c.nama;
          ddKec.appendChild(opt);
        });
        ddKec.disabled = false;
      } else {
        ddKec.innerHTML = '<option value="">Kecamatan tidak tersedia</option>';
      }

      geocodeAndFly(`${kabName}, ${provName}, Indonesia`, 12);
    }

    async function onKecamatanChange() {
      const ddProv = document.getElementById('ddProvinsi');
      const ddKab = document.getElementById('ddKabupaten');
      const ddKec = document.getElementById('ddKecamatan');
      const ddDesa = document.getElementById('ddDesa');
      const card = document.getElementById('wilayahSelectedCard');

      const provKode = ddProv.value;
      const kabKode = ddKab.value;
      const kecKode = ddKec.value;
      const provName = ddProv.options[ddProv.selectedIndex]?.text || '';
      const kabName = ddKab.options[ddKab.selectedIndex]?.text || '';
      const kecName = ddKec.options[ddKec.selectedIndex]?.text || '';

      ddDesa.innerHTML = '<option value="">- Memuat Desa / Kelurahan... -</option>';
      ddDesa.disabled = true;
      if (card) card.style.display = 'none';

      if (!kecKode) {
        ddDesa.innerHTML = '<option value="">- Pilih Kecamatan Dahulu -</option>';
        return;
      }

      const apiBase = getBpnGatewayBase();
      const hasBackend = Boolean(apiBase && apiBase.startsWith('https://'));
      let desas = null;

      if (cacheDesa.has(kecKode)) {
        desas = cacheDesa.get(kecKode);
      } else if (hasBackend) {
        try {
          const res = await fetch(`${apiBase}/api/wilayah/desa?kec_kode=${encodeURIComponent(kecKode)}`);
          if (res.ok) {
            desas = await res.json();
            if (Array.isArray(desas)) {
              cacheDesa.set(kecKode, desas);
            }
          }
        } catch (e) {
        }
      }

      if (!desas && wilayahHierarchyData) {
        const provObj = wilayahHierarchyData.find(p => p.id === provKode);
        const kabObj = provObj?.k?.find(k => k.id === kabKode);
        const kecObj = kabObj?.c?.find(c => c.id === kecKode);
        if (kecObj && kecObj.d) {
          desas = kecObj.d.map(d => ({ kode: d.id, nama: d.n, kodepos: d.kp || '' }));
          cacheDesa.set(kecKode, desas);
        }
      }

      if (Array.isArray(desas) && desas.length > 0) {
        ddDesa.innerHTML = '<option value="">- Pilih Desa / Kelurahan -</option>';
        desas.forEach(d => {
          const opt = document.createElement('option');
          opt.value = d.kode;
          opt.dataset.kodepos = d.kodepos || '';
          opt.dataset.nama = d.nama;
          opt.textContent = d.kodepos ? `${d.nama} (${d.kodepos})` : d.nama;
          ddDesa.appendChild(opt);
        });
        ddDesa.disabled = false;
      } else {
        ddDesa.innerHTML = '<option value="">Desa tidak tersedia</option>';
      }

      geocodeAndFly(`${kecName}, ${kabName}, ${provName}, Indonesia`, 14);
    }

    function onDesaChange() {
      const ddProv = document.getElementById('ddProvinsi');
      const ddKab = document.getElementById('ddKabupaten');
      const ddKec = document.getElementById('ddKecamatan');
      const ddDesa = document.getElementById('ddDesa');
      const card = document.getElementById('wilayahSelectedCard');

      const opt = ddDesa.options[ddDesa.selectedIndex];
      if (!opt || !opt.value) {
        if (card) card.style.display = 'none';
        if (kelurahanHighlightLayer) {
          map.removeLayer(kelurahanHighlightLayer);
          kelurahanHighlightLayer = null;
        }
        return;
      }

      const desaName = opt.dataset.nama || opt.text;
      const kodepos = opt.dataset.kodepos || '';
      const kecName = ddKec.options[ddKec.selectedIndex]?.text || '';
      const kabName = ddKab.options[ddKab.selectedIndex]?.text || '';
      const provName = ddProv.options[ddProv.selectedIndex]?.text || '';

      currentSelectedWilayah = {
        desa: desaName,
        kec: kecName,
        kab: kabName,
        prov: provName,
        kodepos: kodepos
      };

      document.getElementById('selectedWilayahTitle').innerText = desaName;
      document.getElementById('selectedKodePosBadge').innerText = kodepos ? `Kode Pos: ${kodepos}` : 'Kode Pos: -';
      document.getElementById('selectedWilayahDesc').innerText = `Kecamatan ${kecName}, ${kabName}, Provinsi ${provName}`;
      if (card) card.style.display = 'block';

      sorotWilayahTerpilih();
    }

    async function sorotWilayahTerpilih() {
      if (!currentSelectedWilayah) return;
      const w = currentSelectedWilayah;
      const apiBase = getBpnGatewayBase();
      const hasBackend = Boolean(apiBase && apiBase.startsWith('https://'));

      if (kelurahanHighlightLayer) {
        map.removeLayer(kelurahanHighlightLayer);
        kelurahanHighlightLayer = null;
      }
      if (wilayahHighlightMarker) {
        map.removeLayer(wilayahHighlightMarker);
        wilayahHighlightMarker = null;
      }

      showToast(`Menyorot batas Kelurahan ${w.desa}...`, 'info');

      if (hasBackend) {
        try {
          const qUrl = `${apiBase}/api/batas-kelurahan?desa=${encodeURIComponent(w.desa)}&kec=${encodeURIComponent(w.kec)}&kab=${encodeURIComponent(w.kab)}&prov=${encodeURIComponent(w.prov)}`;
          const res = await fetch(qUrl);
        if (res.ok) {
          const data = await res.json();
          if (data && data.type === 'FeatureCollection' && data.features && data.features.length > 0) {
            kelurahanHighlightLayer = L.geoJSON(data, {
              pane: 'thematicPane',
              style: {
                color: '#0284c7',
                weight: 2.5,
                dashArray: '6, 4',
                fillColor: '#0284c7',
                fillOpacity: 0.12
              }
            }).addTo(map);

            map.fitBounds(kelurahanHighlightLayer.getBounds(), { padding: [35, 35], maxZoom: 18 });
            showToast(`Batas wilayah Kelurahan ${w.desa} disorot aktif.`, 'success');
            return;
          }
        }
        } catch (err) {}
      }

      const detailedQuery = `${w.desa}, ${w.kec}, ${w.kab}, ${w.prov}, Indonesia`;
      const fallbackQuery = `${w.kec}, ${w.kab}, ${w.prov}, Indonesia`;
      let lat = null, lon = null;
      try {
        let res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(detailedQuery)}&countrycodes=id&limit=1`);
        let data = await res.json();
        if (!data || data.length === 0) {
          res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallbackQuery)}&countrycodes=id&limit=1`);
          data = await res.json();
        }
        if (data && data.length > 0) {
          lat = parseFloat(data[0].lat);
          lon = parseFloat(data[0].lon);
        }
      } catch (err) {}

      if (lat !== null && lon !== null) {
        map.flyTo([lat, lon], 17, { duration: 1.5 });
        wilayahHighlightMarker = L.circleMarker([lat, lon], {
          pane: 'thematicPane',
          radius: 12,
          color: '#0284c7',
          weight: 2.5,
          fillColor: '#0284c7',
          fillOpacity: 0.22
        }).addTo(map);
      }
    }


    function onQuickWilayahInput(val) {
      clearTimeout(quickWilayahTimer);
      const container = document.getElementById('quickWilayahResults');
      if (!container) return;

      const q = val.trim();
      if (q.length < 2) {
        container.style.display = 'none';
        return;
      }

      quickWilayahTimer = setTimeout(async () => {
        container.innerHTML = '<div class="search-res-item">Mencari di database seluruh wilayah Indonesia...</div>';
        container.style.display = 'block';

        try {
          const apiBase = getBpnGatewayBase();
          let items = [];
          if (isProxyActive && apiBase && apiBase.startsWith('https://')) {
            try {
              const res = await fetch(`${apiBase}/api/wilayah/search?q=${encodeURIComponent(q)}`);
              if (res.ok) items = await res.json();
            } catch (e) {}
          }

        if (!items || items.length === 0) {
          try {
            const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(q)}&countrycodes=id&limit=8`);
            if (geoRes.ok) {
              const geoData = await geoRes.json();
              items = (geoData || []).map(g => {
                const a = g.address || {};
                return {
                  desa: a.village || a.suburb || a.quarter || g.name || q,
                  kec: a.city_district || a.district || a.municipality || '-',
                  kab: a.city || a.town || a.county || '-',
                  prov: a.state || '-',
                  kodepos: a.postcode || '-'
                };
              });
            }
          } catch (e) {}
        }

        if (!items || items.length === 0) {
          container.innerHTML = '<div class="search-res-item" style="color:var(--crimson);">Tidak ditemukan wilayah dengan nama atau kode pos tersebut.</div>';
          return;
        }

          container.innerHTML = '';
          items.forEach(it => {
            const div = document.createElement('div');
            div.className = 'search-res-item';
            div.innerHTML = `
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="color:var(--text-main);">${it.desa}</strong>
                <span class="badge-pill green" style="font-size:0.65rem;">Pos: ${it.kodepos || '-'}</span>
              </div>
              <small style="color:var(--text-sub); font-size:0.69rem;">Kec. ${it.kec}, ${it.kab}, ${it.prov}</small>
            `;
            div.onclick = () => {
              currentSelectedWilayah = it;
              document.getElementById('selectedWilayahTitle').innerText = it.desa;
              document.getElementById('selectedKodePosBadge').innerText = it.kodepos ? `Kode Pos: ${it.kodepos}` : 'Kode Pos: -';
              document.getElementById('selectedWilayahDesc').innerText = `Kecamatan ${it.kec}, ${it.kab}, Provinsi ${it.prov}`;
              const card = document.getElementById('wilayahSelectedCard');
              if (card) card.style.display = 'block';
              container.style.display = 'none';
              sorotWilayahTerpilih();
            };
            container.appendChild(div);
          });
        } catch (err) {
          container.innerHTML = `<div class="search-res-item" style="color:var(--crimson);">Gagal memuat data: ${err.message}</div>`;
        }
      }, 250);
    }
