const ALLOWED_ORIGINS = [
  'https://geospasi.dutamik.id',
  'https://dutamik.id'
];

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    if (host.endsWith('.dutamik.id') || host.endsWith('.github.io')) return true;
  } catch (_) {}
  return false;
}

function getCorsHeaders(origin: string | null) {
  const allowed = isOriginAllowed(origin) ? origin : 'https://geospasi.dutamik.id';
  return {
    'Access-Control-Allow-Origin': allowed as string,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

function latlngToMercator(lat: number, lng: number) {
  const r = 6378137.0;
  const x = r * (lng * Math.PI / 180);
  const y = r * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
  return { x, y };
}

function mercatorToLatlng(x: number, y: number) {
  const r = 6378137.0;
  const lat = (2 * Math.atan(Math.exp(y / r)) - Math.PI / 2) * 180 / Math.PI;
  const lng = (x / r) * 180 / Math.PI;
  return { lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)) };
}

function calcPolyArea(pts: Array<{lat: number, lng: number}>): number {
  if (!pts || pts.length < 3) return 0;
  const r = 6378137.0;
  let total = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const rad1 = p1.lat * Math.PI / 180;
    const rad2 = p2.lat * Math.PI / 180;
    const dlng = (p2.lng - p1.lng) * Math.PI / 180;
    total += dlng * (2 + Math.sin(rad1) + Math.sin(rad2));
  }
  return Math.abs(Math.round((total * r * r) / 4.0));
}

function isPointInPoly(pt: {lat: number, lng: number}, poly: Array<{lat: number, lng: number}>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lng, yi = poly[i].lat;
    const xj = poly[j].lng, yj = poly[j].lat;
    const intersect = ((yi > pt.lat) !== (yj > pt.lat)) &&
      (pt.lng < (xj - xi) * (pt.lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function distPointToPolyMeters(pt: {lat: number, lng: number}, poly: Array<{lat: number, lng: number}>): number {
  let minDist = Infinity;
  for (const p of poly) {
    const dlat = (pt.lat - p.lat) * 111320;
    const dlng = (pt.lng - p.lng) * 111320 * Math.cos(pt.lat * Math.PI / 180);
    const d = Math.hypot(dlat, dlng);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

async function queryAtlasCadastre(lat: number, lng: number) {
  const { x: cx, y: cy } = latlngToMercator(lat, lng);
  const clickPt = { lat, lng };

  for (const deltaM of [30.0, 75.0]) {
    const minx = cx - deltaM;
    const maxx = cx + deltaM;
    const miny = cy - deltaM;
    const maxy = cy + deltaM;
    const bbox = `${minx.toFixed(4)},${miny.toFixed(4)},${maxx.toFixed(4)},${maxy.toFixed(4)}`;
    const url = `https://atlas.atrbpn.go.id/geoserver/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=bhumi:Persil&QUERY_LAYERS=bhumi:Persil&CRS=EPSG:3857&BBOX=${bbox}&WIDTH=101&HEIGHT=101&I=50&J=50&INFO_FORMAT=application/json&FEATURE_COUNT=50`;

    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://bhumi.atrbpn.go.id/',
          'Origin': 'https://bhumi.atrbpn.go.id'
        }
      });
      if (!resp.ok) continue;

      const data = await resp.json();
      const feats = data?.features;
      if (!Array.isArray(feats) || feats.length === 0) continue;

      let exactMatches: Array<{feat: any, coords: Array<{lat: number, lng: number}>}> = [];
      let proximityMatches: Array<{feat: any, coords: Array<{lat: number, lng: number}>, dist: number}> = [];

      for (const f of feats) {
        const geom = f.geometry;
        if (!geom) continue;
        let rings: number[][][] = [];
        if (geom.type === 'Polygon' && Array.isArray(geom.coordinates) && geom.coordinates.length > 0) {
          rings = [geom.coordinates[0]];
        } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates) && geom.coordinates.length > 0) {
          rings = geom.coordinates.map((c: any) => c[0]);
        }

        for (const ring of rings) {
          if (!ring || ring.length < 3) continue;
          const coords = ring.map((pt: number[]) => mercatorToLatlng(pt[0], pt[1]));
          if (coords.length > 1) {
            const first = coords[0];
            const last = coords[coords.length - 1];
            if (Math.abs(first.lat - last.lat) < 0.0000005 && Math.abs(first.lng - last.lng) < 0.0000005) {
              coords.pop();
            }
          }
          if (coords.length < 3) continue;

          if (isPointInPoly(clickPt, coords)) {
            exactMatches.push({ feat: f, coords });
          } else {
            const d = distPointToPolyMeters(clickPt, coords);
            if (d <= 35.0) {
              proximityMatches.push({ feat: f, coords, dist: d });
            }
          }
        }
      }

      let chosen: any = null;
      let chosenCoords: Array<{lat: number, lng: number}> | null = null;

      if (exactMatches.length > 0) {
        chosen = exactMatches[0].feat;
        chosenCoords = exactMatches[0].coords;
      } else if (proximityMatches.length > 0) {
        proximityMatches.sort((a, b) => a.dist - b.dist);
        chosen = proximityMatches[0].feat;
        chosenCoords = proximityMatches[0].coords;
      }

      if (chosen && chosenCoords && chosenCoords.length >= 3) {
        const props = chosen.properties || {};
        const nib = props.nib ? String(props.nib).trim() : '-';
        const tipeHak = props.tipehak ? String(props.tipehak).trim() : 'Terdaftar ATR/BPN';
        const rawLuas = props.luas && Number(props.luas) > 0 ? Number(props.luas) : 0;
        const geoArea = calcPolyArea(chosenCoords);
        const finalLuas = rawLuas > 0 ? rawLuas : geoArea;
        const nomor = props.nomor ? String(props.nomor).trim() : '-';
        const tahun = props.tahun ? String(props.tahun).trim() : '-';

        return {
          found: true,
          nib: nib.toUpperCase(),
          tipe_hak: tipeHak.toUpperCase(),
          luas_m2: finalLuas,
          luas_ha: Number((finalLuas / 10000.0).toFixed(4)),
          nomor_hak: nomor.toUpperCase(),
          tahun: tahun,
          fid: chosen.id || '-',
          polygon_coords: chosenCoords,
          bbox_coords: chosenCoords,
          is_auto_traced: false,
          is_official_cadastre: true,
          source: 'ATLAS ATR/BPN GEOSERVER',
          status_validasi: 'Kadaster Resmi Presisi',
          bhumi_url: `https://bhumi.atrbpn.go.id/peta?latitude=${lat.toFixed(6)}&longitude=${lng.toFixed(6)}&zoom=19`
        };
      }
    } catch (_) {}
  }

  return {
    found: false,
    message: 'Titik koordinat berada di luar bidang tanah terdaftar ATR/BPN.',
    polygon_coords: null
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || req.headers.get('referer');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'get-persil';

  if (action === 'get-persil') {
    let lat = parseFloat(url.searchParams.get('lat') || '0');
    let lng = parseFloat(url.searchParams.get('lng') || '0');
    let zoom = parseInt(url.searchParams.get('zoom') || '19', 10);

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.lat) lat = parseFloat(body.lat);
        if (body.lng) lng = parseFloat(body.lng);
        if (body.zoom) zoom = parseInt(body.zoom, 10);
      } catch (_) {}
    }

    if (!lat || !lng) {
      return new Response(JSON.stringify({ found: false, error: 'Parameter lat dan lng dibutuhkan' }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const result = await queryAtlasCadastre(lat, lng);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: corsHeaders
    });
  }

  if (action === 'proxy-wms') {
    const target = url.searchParams.get('url');
    if (!target || !target.startsWith('https://atlas.atrbpn.go.id/')) {
      return new Response(JSON.stringify({ error: 'URL target tidak diizinkan' }), {
        status: 400,
        headers: corsHeaders
      });
    }

    try {
      const resp = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://bhumi.atrbpn.go.id/',
          'Origin': 'https://bhumi.atrbpn.go.id'
        }
      });
      const data = await resp.text();
      return new Response(data, {
        status: resp.status,
        headers: { ...corsHeaders, 'Content-Type': resp.headers.get('content-type') || 'application/json' }
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 502,
        headers: corsHeaders
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Action tidak dikenal' }), {
    status: 404,
    headers: corsHeaders
  });
});
