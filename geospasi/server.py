"""
==============================================================================
Server Web GIS Peta Bidang Tanah ATR/BPN (BHUMI)
Pengembang: Duta Digital Agensi
Situs Resmi: dutamik.id
Tagline: Duta Media Informasi berKarya
Lokasi: Sukoharjo, Jawa Tengah
==============================================================================
Port: 8085
Fitur:
  1. Web App Server (index.html, CSS, JS)
  2. Multi-threaded ATR/BPN Tile Proxy (WMS bhumi_persil dengan auto-header)
  3. Disk Caching Tile (Aman, cepat, hemat kuota)
  4. Query Informasi Bidang Tanah Resmi ATR/BPN (/api/persil-info)
     - Ekstraksi NIB, Tipe Hak, Luas Resmi (m2/Ha), FID, dan BBOX Polygon
     - Dekripsi otomatis AES-256-CBC dari portal BHUMI ATR/BPN
  5. Reverse Geocoding Wilayah (/api/reverse-geocode)
  6. Layer Ceking Big Data Indonesia (Hutan, LBS, LSD, InaRISK, PSN, KEK)
  7. Topologi Merge Poligon Tanpa Celah (/api/merge-parcels)
==============================================================================
"""

import os
import sys
import re
import json
import time
import math
import ssl
import base64
import hashlib
import urllib.request
import urllib.error
import webbrowser
import io
import zipfile
import concurrent.futures
import struct
from collections import deque
from http.server import HTTPServer, ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from Crypto.Cipher import AES
from PIL import Image
import cv2
import numpy as np
import sqlite3
from shapely.geometry import Point, Polygon, MultiPolygon
from shapely.validation import make_valid

PORT = 8085
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(ROOT_DIR, "cache", "tiles")
os.makedirs(CACHE_DIR, exist_ok=True)
CEKING_CACHE_DIR = os.path.join(ROOT_DIR, "cache", "ceking")
os.makedirs(CEKING_CACHE_DIR, exist_ok=True)
BATAS_DESA_CACHE_DIR = os.path.join(ROOT_DIR, "cache", "batas_desa")
os.makedirs(BATAS_DESA_CACHE_DIR, exist_ok=True)
PERSIL_INFO_CACHE = {}
def get_data_filepath(fname):
    p_data = os.path.join(ROOT_DIR, "data", fname)
    if os.path.exists(p_data):
        return p_data
    return os.path.join(ROOT_DIR, fname)

WILAYAH_KABKOT_DB_PATH = get_data_filepath("wilayah_kabkot.db")
WILAYAH_DESA_DB_PATH = get_data_filepath("wilayah_desa.db")
WILAYAH_LEGACY_DB_PATH = get_data_filepath("wilayah_indonesia.db")
ADMIN_DB_PATH = get_data_filepath("admin_data.db")

def get_admin_db():
    conn = sqlite3.connect(ADMIN_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_admin_db():
    try:
        conn = get_admin_db()
        cur = conn.cursor()
        cur.execute('''
            CREATE TABLE IF NOT EXISTS members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                full_name TEXT DEFAULT '',
                role TEXT DEFAULT 'free',
                status TEXT DEFAULT 'active',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cur.execute('''
            CREATE TABLE IF NOT EXISTS payments (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                unique_code TEXT DEFAULT '',
                total_amount REAL DEFAULT 0,
                status TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        conn.close()
    except Exception:
        pass

def get_kabkot_db():
    if os.path.exists(WILAYAH_KABKOT_DB_PATH):
        conn = sqlite3.connect(WILAYAH_KABKOT_DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn
    if os.path.exists(WILAYAH_LEGACY_DB_PATH):
        conn = sqlite3.connect(WILAYAH_LEGACY_DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn
    return None

def get_desa_db():
    if os.path.exists(WILAYAH_DESA_DB_PATH):
        conn = sqlite3.connect(WILAYAH_DESA_DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn
    if os.path.exists(WILAYAH_LEGACY_DB_PATH):
        conn = sqlite3.connect(WILAYAH_LEGACY_DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn
    return None

def get_wilayah_db():
    return get_desa_db()

def enrich_address_with_wilayah_db(geo_dict, lat=None, lon=None, selected_desa=None, selected_kec=None, selected_kab=None):
    addr = geo_dict.get("address", {})
    actual_desa = addr.get("village") or addr.get("suburb") or addr.get("neighbourhood") or addr.get("quarter")
    actual_kec = addr.get("city_district") or addr.get("district") or addr.get("town") or addr.get("municipality")
    actual_kab = addr.get("city") or addr.get("county") or addr.get("state_district")
    postcode = addr.get("postcode")
    
    desa_cand = actual_desa or selected_desa
    kab_cand = actual_kab or selected_kab
    kec_cand = actual_kec or selected_kec
    
    conn = get_desa_db()
    if not conn:
        return geo_dict
    try:
        cur = conn.cursor()
        matched_row = None
        clean_kab = (kab_cand or "").replace("Kabupaten", "").replace("Kota", "").strip()
        clean_kec = (kec_cand or "").replace("Kecamatan", "").strip()

        if postcode and desa_cand:
            cur.execute("SELECT desa_nama, kec_nama, kab_nama, prov_nama, kodepos FROM desa_full WHERE kodepos = ? AND desa_nama LIKE ? LIMIT 1", (postcode, f"%{desa_cand}%"))
            matched_row = cur.fetchone()

        if not matched_row and desa_cand and clean_kab:
            if clean_kec:
                cur.execute("SELECT desa_nama, kec_nama, kab_nama, prov_nama, kodepos FROM desa_full WHERE desa_nama LIKE ? AND kec_nama LIKE ? AND kab_nama LIKE ? LIMIT 1", (f"%{desa_cand}%", f"%{clean_kec}%", f"%{clean_kab}%"))
                matched_row = cur.fetchone()
            if not matched_row:
                cur.execute("SELECT desa_nama, kec_nama, kab_nama, prov_nama, kodepos FROM desa_full WHERE desa_nama LIKE ? AND kab_nama LIKE ? LIMIT 1", (f"%{desa_cand}%", f"%{clean_kab}%"))
                matched_row = cur.fetchone()

        if not matched_row and clean_kec and clean_kab:
            if postcode:
                cur.execute("SELECT desa_nama, kec_nama, kab_nama, prov_nama, kodepos FROM desa_full WHERE kec_nama LIKE ? AND kab_nama LIKE ? AND kodepos = ? LIMIT 1", (f"%{clean_kec}%", f"%{clean_kab}%", postcode))
                matched_row = cur.fetchone()
            if not matched_row:
                cur.execute("SELECT desa_nama, kec_nama, kab_nama, prov_nama, kodepos FROM desa_full WHERE kec_nama LIKE ? AND kab_nama LIKE ? LIMIT 1", (f"%{clean_kec}%", f"%{clean_kab}%"))
                matched_row = cur.fetchone()

        if not matched_row and postcode:
            cur.execute("SELECT desa_nama, kec_nama, kab_nama, prov_nama, kodepos FROM desa_full WHERE kodepos = ? LIMIT 1", (postcode,))
            matched_row = cur.fetchone()

        if matched_row:
            addr["village"] = matched_row["desa_nama"]
            addr["city_district"] = matched_row["kec_nama"]
            addr["county"] = matched_row["kab_nama"]
            addr["state"] = matched_row["prov_nama"]
            addr["postcode"] = matched_row["kodepos"]
            geo_dict["address"] = addr
            geo_dict["kantah"] = f"Kantor Pertanahan {matched_row['kab_nama']}"
    except Exception as e:
        print("[WILAYAH ENRICH ERROR]", e)
    finally:
        conn.close()
    return geo_dict

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

TRANSPARENT_PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")
TRANSPARENT_WEBP = base64.b64decode("UklGRkAAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAIAAAAAAFZQOCAYAAAAMAEAnQEqAQABAAFAJiWkAANwAP79NmgA")

def to_webp_tile_bytes(img_bytes, quality=80):
    if not img_bytes:
        return TRANSPARENT_WEBP
    try:
        im = Image.open(io.BytesIO(img_bytes))
        out = io.BytesIO()
        im.save(out, format="WEBP", quality=quality, method=4)
        return out.getvalue()
    except Exception:
        return img_bytes

# ATR/BPN Token State
TOKEN_STATE = {
    "token": None,
    "expires_at": 0
}

def evp_bytes_to_key(password, salt, key_len=32, iv_len=16):
    dtot = b""
    d = b""
    while len(dtot) < key_len + iv_len:
        d = hashlib.md5(d + password + salt).digest()
        dtot += d
    return dtot[:key_len], dtot[key_len:key_len + iv_len]

def decrypt_cryptojs(encrypted_b64, passphrase="s3CRetCR1pT0"):
    raw = base64.b64decode(encrypted_b64)
    if raw[:8] != b"Salted__":
        raise ValueError("Format CryptoJS tidak valid (prefix Salted__ hilang)")
    salt = raw[8:16]
    ciphertext = raw[16:]
    key, iv = evp_bytes_to_key(passphrase.encode('utf-8'), salt)
    cipher = AES.new(key, AES.MODE_CBC, iv)
    dec = cipher.decrypt(ciphertext)
    pad = dec[-1]
    return dec[:-pad].decode('utf-8')

def get_atrbpn_token():
    now = time.time()
    if TOKEN_STATE["token"] and now < TOKEN_STATE["expires_at"]:
        return TOKEN_STATE["token"]
    
    url = "https://bhumi.atrbpn.go.id/expapi/loginApi"
    payload = json.dumps({"username": "user", "password": "password"}).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Referer": "https://bhumi.atrbpn.go.id/peta",
            "Origin": "https://bhumi.atrbpn.go.id",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
    )
    try:
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=8) as resp:
            token = json.loads(resp.read().decode('utf-8'))
            TOKEN_STATE["token"] = token
            TOKEN_STATE["expires_at"] = now + 3000
            print("[INFO] Token ATR/BPN BHUMI berhasil diperbarui.")
            return token
    except Exception as e:
        print("[ERROR TOKEN ATR/BPN]", e)
        return None

def tile_to_bbox_mercator(x, y, z):
    originShift = 20037508.342789244
    n = 2.0 ** z
    tileSizeM = (2.0 * originShift) / n
    minX = -originShift + (x * tileSizeM)
    maxX = minX + tileSizeM
    maxY = originShift - (y * tileSizeM)
    minY = maxY - tileSizeM
    return f"{minX:.4f},{minY:.4f},{maxX:.4f},{maxY:.4f}"


def deg2num(lat_deg, lon_deg, zoom):
    lat_rad = math.radians(lat_deg)
    n = 2.0 ** zoom
    xtile = int((lon_deg + 180.0) / 360.0 * n)
    ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return (xtile, ytile)

def num2deg(xtile, ytile, zoom):
    n = 2.0 ** zoom
    lon_deg = xtile / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2.0 * ytile / n)))
    lat = math.degrees(lat_rad)
    return (lat, lon_deg)

def p_dist(p, a, b):
    x, y = p
    x1, y1 = a
    x2, y2 = b
    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x - x1, y - y1)
    t = ((x - x1) * dx + (y - y1) * dy) / (dx*dx + dy*dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))

def rdp(pts, epsilon):
    if len(pts) < 3:
        return pts
    dmax = 0
    idx = 0
    for i in range(1, len(pts) - 1):
        d = p_dist(pts[i], pts[0], pts[-1])
        if d > dmax:
            dmax = d
            idx = i
    if dmax > epsilon:
        res1 = rdp(pts[:idx+1], epsilon)
        res2 = rdp(pts[idx:], epsilon)
        return res1[:-1] + res2
    else:
        return [pts[0], pts[-1]]

TILE_CACHE_TTL = 60

def fetch_persil_tile_bytes(z, x, y, force_refresh=False, fmt="webp"):
    ext = ".webp" if fmt == "webp" else ".png"
    tile_file = os.path.join(CACHE_DIR, str(z), str(x), f"{y}{ext}")
    now = time.time()
    if not force_refresh and os.path.exists(tile_file):
        try:
            mtime = os.path.getmtime(tile_file)
            if (now - mtime) < TILE_CACHE_TTL:
                with open(tile_file, "rb") as f:
                    return f.read()
        except Exception:
            pass
    
    bbox = tile_to_bbox_mercator(x, y, z)
    urls_to_try = [
        f"https://atlas.atrbpn.go.id/geoserver/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=bhumi:Persil&STYLES=&CRS=EPSG:3857&WIDTH=512&HEIGHT=512&BBOX={bbox}",
        f"https://bhumi.atrbpn.go.id/mprx/service?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=bhumi_persil&STYLES=&CRS=EPSG:3857&TILED=true&WIDTH=512&HEIGHT=512&BBOX={bbox}"
    ]
    for bhumi_url in urls_to_try:
        req = urllib.request.Request(
            bhumi_url,
            headers={
                "Referer": "https://bhumi.atrbpn.go.id/peta",
                "Origin": "https://bhumi.atrbpn.go.id",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        )
        try:
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=8) as r:
                tile_bytes = r.read()
            if len(tile_bytes) >= 8 and tile_bytes[:4] == b'\x89PNG':
                if fmt == "webp":
                    tile_bytes = to_webp_tile_bytes(tile_bytes)
                os.makedirs(os.path.dirname(tile_file), exist_ok=True)
                with open(tile_file, "wb") as f:
                    f.write(tile_bytes)
                return tile_bytes
        except Exception:
            continue
    
    if os.path.exists(tile_file):
        with open(tile_file, "rb") as f:
            return f.read()
    return None

def fetch_ceking_tile_bytes(layer_name, z, x, y, force_refresh=False, fmt="webp"):
    ext = ".webp" if fmt == "webp" else ".png"
    tile_file = os.path.join(CEKING_CACHE_DIR, layer_name, str(z), str(x), f"{y}{ext}")
    now = time.time()
    if not force_refresh and os.path.exists(tile_file):
        try:
            mtime = os.path.getmtime(tile_file)
            if (now - mtime) < TILE_CACHE_TTL:
                with open(tile_file, "rb") as f:
                    return f.read()
        except Exception:
            pass

    bbox = tile_to_bbox_mercator(x, y, z)
    url = None
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

    if layer_name in ["hutan", "hutan_lindung"]:
        url = f"https://geoportal.planologi.kehutanan.go.id/server/rest/services/Peta_Interaktif_2026/KWSHUTAN_AR_250K/MapServer/export?bbox={bbox}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image"
        headers["Referer"] = "https://geoportal.planologi.kehutanan.go.id/"
    elif layer_name in ["batas_desa", "kelurahan"]:
        url = f"https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_DESAKEL_AR/MapServer/export?bbox={bbox}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image"
        headers["Referer"] = "https://geoservices.big.go.id/"
    elif layer_name in ["sungai", "hidrografi"]:
        url = f"https://geoservices.big.go.id/rbi/rest/services/BASEMAP/Rupabumi_Indonesia/MapServer/export?bbox={bbox}&bboxSR=3857&imageSR=3857&size=256,256&layers=show:670,671,672,673,698,702,707,709,748,749,750,756,757,760,762,796,797,798,809,811,812,814,818,838,839,840,844,845,846,847,848,868,869,870,875,876,877,879,882&format=png32&transparent=true&f=image"
        headers["Referer"] = "https://geoservices.big.go.id/"
    elif layer_name == "jalan":
        g_url = f"https://mt1.google.com/vt/lyrs=h&x={x}&y={y}&z={z}"
        try:
            req = urllib.request.Request(g_url, headers=headers)
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=4) as r:
                tile_bytes = r.read()
            if len(tile_bytes) >= 8 and tile_bytes[:4] == b'\x89PNG':
                if fmt == "webp":
                    tile_bytes = to_webp_tile_bytes(tile_bytes)
                os.makedirs(os.path.dirname(tile_file), exist_ok=True)
                with open(tile_file, "wb") as f:
                    f.write(tile_bytes)
                return tile_bytes
        except Exception:
            pass

        esri_url = f"https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
        try:
            req = urllib.request.Request(esri_url, headers=headers)
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=4) as r:
                tile_bytes = r.read()
            if len(tile_bytes) >= 8 and tile_bytes[:4] == b'\x89PNG':
                if fmt == "webp":
                    tile_bytes = to_webp_tile_bytes(tile_bytes)
                os.makedirs(os.path.dirname(tile_file), exist_ok=True)
                with open(tile_file, "wb") as f:
                    f.write(tile_bytes)
                return tile_bytes
        except Exception:
            pass
        return TRANSPARENT_WEBP if fmt == "webp" else TRANSPARENT_PNG
    elif layer_name == "lbs":
        url = f"https://atlas.atrbpn.go.id/geoserver/wms?SERVICE=WMS&VERSION=1.1.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=geonode:lbs_parsial&STYLES=&SRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox}"
        headers["Referer"] = "https://bhumi.atrbpn.go.id/peta"
    elif layer_name == "lsd":
        url = f"https://atlas.atrbpn.go.id/geoserver/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=umum:lsd_merge&STYLES=&SRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox}"
        headers["Referer"] = "https://bhumi.atrbpn.go.id/peta"
    elif layer_name in ["kesesuaian", "peruntukan"]:
        url = f"https://atlas.atrbpn.go.id/geoserver/wms?SERVICE=WMS&VERSION=1.1.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=petabpn:rtrwn_2025&STYLES=&SRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox}"
        headers["Referer"] = "https://bhumi.atrbpn.go.id/peta"
    elif layer_name in ["rtrw_pola", "rtrw"]:
        url = f"https://atlas.atrbpn.go.id/geoserver/wms?SERVICE=WMS&VERSION=1.1.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=rtr-online:rtrw_kabkot&STYLES=&SRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox}"
        headers["Referer"] = "https://bhumi.atrbpn.go.id/peta"
    else:
        return None

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=8) as r:
            tile_bytes = r.read()
        if len(tile_bytes) >= 8 and tile_bytes[:4] == b'\x89PNG':
            if fmt == "webp":
                tile_bytes = to_webp_tile_bytes(tile_bytes)
            os.makedirs(os.path.dirname(tile_file), exist_ok=True)
            with open(tile_file, "wb") as f:
                f.write(tile_bytes)
            return tile_bytes
    except Exception:
        pass

    if os.path.exists(tile_file):
        with open(tile_file, "rb") as f:
            return f.read()
    return None


def fetch_batas_kelurahan_geojson(desa, kec="", kab="", prov=""):
    slug = "".join(c for c in f"{prov}_{kab}_{kec}_{desa}".lower() if c.isalnum() or c in "_-")
    cache_file = os.path.join(BATAS_DESA_CACHE_DIR, f"{slug}.geojson")
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    clean_desa = re.sub(r'^(desa|kelurahan|kel\.|ds\.)\s+', '', desa, flags=re.I).strip().upper()
    where_parts = [f"UPPER(WADMKD) LIKE '%{clean_desa}%'"]
    if kec:
        clean_kec = re.sub(r'^(kecamatan|kec\.)\s+', '', kec, flags=re.I).strip().upper()
        where_parts.append(f"UPPER(WADMKC) LIKE '%{clean_kec}%'")
    if kab:
        clean_kab = re.sub(r'^(kabupaten|kab\.|kota)\s+', '', kab, flags=re.I).strip().upper()
        where_parts.append(f"UPPER(WADMKK) LIKE '%{clean_kab}%'")

    where_clause = " AND ".join(where_parts)
    params = {
        "where": where_clause,
        "outFields": "OBJECTID,WADMKD,WADMKC,WADMKK,WADMPR",
        "returnGeometry": "true",
        "f": "geojson",
        "outSR": "4326"
    }
    url = "https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_DESAKEL_AR/MapServer/0/query?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    try:
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data and data.get("features"):
                with open(cache_file, "w", encoding="utf-8") as f:
                    json.dump(data, f)
                return data
    except Exception as e:
        print("[BATAS KELURAHAN ERROR]", e)

    return None

def latlng_to_mercator(lat, lng):
    r = 6378137.0
    return r * math.radians(lng), r * math.log(math.tan(math.pi / 4.0 + math.radians(lat) / 2.0))

def mercator_to_latlng(x, y):
    r = 6378137.0
    lat = math.degrees(2.0 * math.atan(math.exp(y / r)) - math.pi / 2.0)
    lng = math.degrees(x / r)
    return lat, lng

def calc_poly_area(pts):
    r = 6378137.0
    tot = 0.0
    n = len(pts)
    for i in range(n):
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        tot += (math.radians(p2['lng']) - math.radians(p1['lng'])) * (2.0 + math.sin(math.radians(p1['lat'])) + math.sin(math.radians(p2['lat'])))
    return abs(tot * r * r / 2.0)

def get_centered_wms_bytes(c_lat, c_lng, half_size_m=80, img_size=512):
    cx_m, cy_m = latlng_to_mercator(c_lat, c_lng)
    minx, maxx = cx_m - half_size_m, cx_m + half_size_m
    miny, maxy = cy_m - half_size_m, cy_m + half_size_m
    bbox = f"{minx:.4f},{miny:.4f},{maxx:.4f},{maxy:.4f}"
    url = f"https://atlas.atrbpn.go.id/geoserver/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=bhumi:Persil&STYLES=&CRS=EPSG:3857&WIDTH={img_size}&HEIGHT={img_size}&BBOX={bbox}"
    req = urllib.request.Request(
        url,
        headers={
            "Referer": "https://bhumi.atrbpn.go.id/peta",
            "Origin": "https://bhumi.atrbpn.go.id",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
    )
    try:
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=2.0) as r:
            data = r.read()
        if len(data) >= 8 and data[:4] == b'\x89PNG':
            return data, (minx, miny, maxx, maxy)
    except Exception:
        pass
    return None, None

def clean_polygon_vertices(coords, min_edge_meters=1.5, max_collinear_deg=14.0):
    if not coords or len(coords) < 3:
        return coords
    pts = list(coords)
    if len(pts) > 1 and pts[0]['lat'] == pts[-1]['lat'] and pts[0]['lng'] == pts[-1]['lng']:
        pts.pop()
    
    changed = True
    while changed and len(pts) > 3:
        changed = False
        n = len(pts)
        for i in range(n):
            p1 = pts[i]
            p2 = pts[(i + 1) % n]
            dlat = (p1['lat'] - p2['lat']) * 111320.0
            mid_lat = (p1['lat'] + p2['lat']) * 0.5
            dlng = (p1['lng'] - p2['lng']) * (111320.0 * math.cos(math.radians(mid_lat)))
            dist = math.sqrt(dlat * dlat + dlng * dlng)
            if dist < min_edge_meters:
                merged = {
                    'lat': round((p1['lat'] + p2['lat']) * 0.5, 7),
                    'lng': round((p1['lng'] + p2['lng']) * 0.5, 7)
                }
                pts[i] = merged
                del pts[(i + 1) % n]
                changed = True
                break

    changed = True
    while changed and len(pts) > 3:
        changed = False
        n = len(pts)
        for i in range(n):
            p_prev = pts[(i - 1 + n) % n]
            p_curr = pts[i]
            p_next = pts[(i + 1) % n]
            cos_lat = math.cos(math.radians(p_curr['lat']))
            v1x = (p_curr['lng'] - p_prev['lng']) * cos_lat
            v1y = p_curr['lat'] - p_prev['lat']
            v2x = (p_next['lng'] - p_curr['lng']) * cos_lat
            v2y = p_next['lat'] - p_curr['lat']
            dot = v1x * v2x + v1y * v2y
            cross = v1x * v2y - v1y * v2x
            angle_deg = abs(math.degrees(math.atan2(cross, dot)))
            if angle_deg < max_collinear_deg or abs(180.0 - angle_deg) < max_collinear_deg:
                del pts[i]
                changed = True
                break
    return pts

def trace_parcel_contour_opencv(click_lat, click_lng, bbox_coords=None):
    c_lat, c_lng = click_lat, click_lng
    half_size = 65.0
    if bbox_coords and len(bbox_coords) >= 4:
        try:
            if Polygon(bbox_coords).contains(Point(click_lng, click_lat)):
                min_lon = min(p[0] for p in bbox_coords)
                max_lon = max(p[0] for p in bbox_coords)
                min_la = min(p[1] for p in bbox_coords)
                max_la = max(p[1] for p in bbox_coords)
                c_lat = (min_la + max_la) / 2.0
                c_lng = (min_lon + max_lon) / 2.0
                w_m = (max_lon - min_lon) * 111320 * math.cos(math.radians(c_lat))
                h_m = (max_la - min_la) * 111320
                half_size = max(35.0, min(550.0, max(w_m, h_m) * 0.70 + 15.0))
        except Exception:
            pass

    for attempt_half in [half_size]:
        img_bytes, bbox = get_centered_wms_bytes(c_lat, c_lng, half_size_m=attempt_half, img_size=512)
        if not img_bytes:
            continue
        try:
            img = Image.open(io.BytesIO(img_bytes)).convert('RGBA')
            w, h = img.size
            minx, miny, maxx, maxy = bbox

            mx, my = latlng_to_mercator(click_lat, click_lng)
            px = int((mx - minx) / (maxx - minx) * w)
            py = int((maxy - my) / (maxy - miny) * h)
            px = max(0, min(w - 1, px))
            py = max(0, min(h - 1, py))

            seed_color = img.getpixel((px, py))
            sr, sg, sb, sa = seed_color

            if sa < 50 or sa > 210:
                found = False
                for r_s in range(1, 8):
                    for dx in range(-r_s, r_s + 1):
                        for dy in range(-r_s, r_s + 1):
                            nx, ny = px + dx, py + dy
                            if 0 <= nx < w and 0 <= ny < h:
                                cand = img.getpixel((nx, ny))
                                if 100 <= cand[3] <= 190:
                                    px, py = nx, ny
                                    seed_color = cand
                                    sr, sg, sb, sa = cand
                                    found = True
                                    break
                        if found: break
                    if found: break
                if not found:
                    continue

            mask = np.zeros((h, w), dtype=np.uint8)
            visited = set([(px, py)])
            queue = deque([(px, py)])
            mask[py, px] = 255
            touches_edge = False

            def is_match(r, g, b, a):
                return 60 <= a <= 205 and (abs(r - sr) + abs(g - sg) + abs(b - sb)) < 65 and abs(a - sa) < 45

            while queue:
                x, y = queue.popleft()
                if x <= 1 or x >= w - 2 or y <= 1 or y >= h - 2:
                    touches_edge = True
                for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in visited:
                        r, g, b, a = img.getpixel((nx, ny))
                        if is_match(r, g, b, a):
                            visited.add((nx, ny))
                            mask[ny, nx] = 255
                            queue.append((nx, ny))

            if touches_edge and attempt_half == half_size:
                continue

            if len(visited) < 18:
                continue

            close_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, close_kernel)

            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not contours:
                continue

            chosen_c = None
            for c in contours:
                if cv2.pointPolygonTest(c, (float(px), float(py)), False) >= 0:
                    chosen_c = c
                    break
            if chosen_c is None:
                chosen_c = max(contours, key=cv2.contourArea)

            peri = cv2.arcLength(chosen_c, True)
            adaptive_eps = max(1.0, min(3.5, 0.008 * peri))
            approx = cv2.approxPolyDP(chosen_c, adaptive_eps, True)
            inside_test = cv2.pointPolygonTest(approx, (float(px), float(py)), True)
            if inside_test < -4.0:
                continue
            pts_px = [p[0].tolist() for p in approx]
            if len(pts_px) < 3:
                continue

            dx_m = (maxx - minx) / float(w)
            dy_m = (maxy - miny) / float(h)
            coords = []
            for p_x, p_y in pts_px:
                m_x = minx + p_x * dx_m
                m_y = maxy - p_y * dy_m
                lat_p, lng_p = mercator_to_latlng(m_x, m_y)
                coords.append({'lat': round(lat_p, 7), 'lng': round(lng_p, 7)})

            poly_pts = [(p['lng'], p['lat']) for p in coords]
            poly = Polygon(poly_pts)
            if not poly.is_valid:
                fixed = make_valid(poly)
                if fixed.geom_type == 'Polygon':
                    coords = [{'lat': round(p[1], 7), 'lng': round(p[0], 7)} for p in fixed.exterior.coords[:-1]]
                elif hasattr(fixed, 'geoms'):
                    largest = max(fixed.geoms, key=lambda g: g.area)
                    coords = [{'lat': round(p[1], 7), 'lng': round(p[0], 7)} for p in largest.exterior.coords[:-1]]

            coords = clean_polygon_vertices(coords, min_edge_meters=1.5, max_collinear_deg=14.0)
            return coords
        except Exception as e:
            print("[OPENCV TRACE ERROR]", e)
    return None

def query_atlas_cadastre(lat, lng):
    cx, cy = latlng_to_mercator(lat, lng)
    
    for delta_m in [30.0, 75.0]:
        minx, maxx = cx - delta_m, cx + delta_m
        miny, maxy = cy - delta_m, cy + delta_m
        w, h = 101, 101
        i, j = 50, 50
        bbox = f"{minx:.4f},{miny:.4f},{maxx:.4f},{maxy:.4f}"
        
        url = f"https://atlas.atrbpn.go.id/geoserver/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=bhumi:Persil&QUERY_LAYERS=bhumi:Persil&CRS=EPSG:3857&BBOX={bbox}&WIDTH={w}&HEIGHT={h}&I={i}&J={j}&INFO_FORMAT=application/json&FEATURE_COUNT=50"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://bhumi.atrbpn.go.id/",
                "Origin": "https://bhumi.atrbpn.go.id"
            }
        )
        try:
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=14.0) as r:
                data = json.loads(r.read().decode('utf-8'))
                feats = data.get("features", [])
                if not feats:
                    continue
                
                click_pt = Point(lng, lat)
                exact_matches = []
                proximity_matches = []
                
                for f in feats:
                    geom = f.get("geometry", {})
                    g_type = geom.get("type")
                    coords_raw = geom.get("coordinates", [])
                    
                    rings = []
                    if g_type == "Polygon" and coords_raw:
                        rings = [coords_raw[0]]
                    elif g_type == "MultiPolygon" and coords_raw:
                        rings = [p[0] for p in coords_raw]
                        
                    for ring in rings:
                        wgs_ring = []
                        for pt in ring:
                            p_lat, p_lng = mercator_to_latlng(pt[0], pt[1])
                            wgs_ring.append((p_lng, p_lat))
                            
                        if len(wgs_ring) >= 3:
                            poly_obj = Polygon(wgs_ring)
                            poly_coords = [{"lat": round(p[1], 7), "lng": round(p[0], 7)} for p in wgs_ring]
                            if poly_obj.contains(click_pt):
                                exact_matches.append((f, poly_coords, 0.0))
                            else:
                                d = poly_obj.distance(click_pt)
                                if d <= 0.00035:
                                    proximity_matches.append((f, poly_coords, d))
                                    
                if exact_matches:
                    chosen, coords, _ = exact_matches[0]
                elif proximity_matches:
                    proximity_matches.sort(key=lambda x: x[2])
                    chosen, coords, _ = proximity_matches[0]
                else:
                    continue
                    
                props = chosen.get("properties", {})
                nib = props.get("nib") or "-"
                tipe_hak = props.get("tipehak") or "Terdaftar ATR/BPN"
                luas = props.get("luas") or 0
                nomor = props.get("nomor") or "-"
                tahun = props.get("tahun") or "-"
                geo_area = calc_poly_area(coords)
                final_luas = luas if (luas and luas > 0) else round(geo_area, 1)
                
                return {
                    "found": True,
                    "nib": str(nib).upper(),
                    "tipe_hak": str(tipe_hak).upper(),
                    "luas_m2": final_luas,
                    "luas_ha": round(final_luas / 10000.0, 4),
                    "nomor_hak": str(nomor).upper(),
                    "tahun": tahun,
                    "fid": chosen.get("id"),
                    "polygon_coords": coords,
                    "bbox_coords": coords,
                    "is_auto_traced": False,
                    "is_official_cadastre": True,
                    "source": "ATLAS ATR/BPN GEOSERVER",
                    "raw_properties": props,
                    "bhumi_url": f"https://bhumi.atrbpn.go.id/peta?latitude={lat:.6f}&longitude={lng:.6f}&zoom=19"
                }
        except Exception:
            continue
    return None

def query_bhumi_api(lat, lng, zoom=19):
    token = get_atrbpn_token()
    if not token:
        return None
    z_val = max(10, min(int(zoom or 19), 26))
    fine_delta = max(0.00001, min(0.00025, 0.0002 * (2.0 ** (19 - z_val))))
    deltas_to_try = [fine_delta]
    if fine_delta < 0.00015:
        deltas_to_try.append(0.0003)

    for delta in deltas_to_try:
        payload = {
            "service_layer_name": "umum:Persil",
            "width": 256,
            "height": 256,
            "bbox": f"{lng - delta},{lat - delta},{lng + delta},{lat + delta}",
            "x": 128,
            "y": 128,
            "query_layers": "umum:Persil",
            "url": "/expapi/getPersil",
            "service": "https://bhumi.atrbpn.go.id/bhumigs/umum"
        }
        req = urllib.request.Request(
            "https://bhumi.atrbpn.go.id/expapi/getPersil",
            data=json.dumps(payload).encode('utf-8'),
            headers={
                "Content-Type": "application/json",
                "Authorization": token,
                "Referer": "https://bhumi.atrbpn.go.id/peta",
                "Origin": "https://bhumi.atrbpn.go.id",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        )
        try:
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=10.0) as r:
                res = json.loads(r.read().decode('utf-8'))
                if res.get("encrypted") and "data" in res:
                    dec = decrypt_cryptojs(res["data"], "s3CRetCR1pT0")
                    geo_data = json.loads(dec)
                    features = geo_data.get("features", [])
                    if features:
                        chosen_feat = None
                        best_dist = 999999.0
                        pt_check = Point(lng, lat)
                        for feat_item in features:
                            bbox_poly = feat_item.get("bbox", {})
                            raw_coords = bbox_poly.get("coordinates", [])
                            if raw_coords and len(raw_coords) > 0 and len(raw_coords[0]) >= 4:
                                b_coords = raw_coords[0]
                                try:
                                    b_poly = Polygon(b_coords)
                                    if b_poly.contains(pt_check):
                                        chosen_feat = feat_item
                                        break
                                    d = b_poly.distance(pt_check)
                                    if d <= 0.000008 and d < best_dist:
                                        best_dist = d
                                        chosen_feat = feat_item
                                except Exception:
                                    pass
                        if not chosen_feat:
                            continue
                        feat = chosen_feat
                        props = feat.get("properties", {})
                        feat_id = feat.get("id")
                        nib = props.get("nib") or "-"
                        tipe_hak = props.get("tipehak") or "Terdaftar ATR/BPN"
                        luas = props.get("luas") or 0
                        bbox_poly = feat.get("bbox", {})
                        raw_coords = bbox_poly.get("coordinates", [])
                        bbox_coords = None
                        if raw_coords and len(raw_coords) > 0 and len(raw_coords[0]) >= 4:
                            bbox_coords = raw_coords[0]
                        return {
                            "nib": nib,
                            "tipe_hak": tipe_hak,
                            "luas": luas,
                            "feat_id": feat_id,
                            "props": props,
                            "bbox_coords": bbox_coords
                        }
        except Exception:
            pass
    return None

def query_persil_at_coord(lat, lng, zoom=19):
    z_int = int(zoom) if zoom else 19
    if z_int < 16:
        return {
            "found": False,
            "message": "Perbesar peta (Zoom) untuk melihat detail batas persil ATR/BPN.",
            "polygon_coords": None,
            "bbox_coords": None,
            "bhumi_url": f"https://bhumi.atrbpn.go.id/peta?latitude={lat:.6f}&longitude={lng:.6f}&zoom=19"
        }

    cache_key = (round(lat, 6), round(lng, 6))
    if cache_key in PERSIL_INFO_CACHE:
        cached_entry, expire_time = PERSIL_INFO_CACHE[cache_key]
        if time.time() < expire_time:
            return cached_entry

    pt = Point(lng, lat)
    for (k_lat, k_lng), (cached_entry, expire_time) in list(PERSIL_INFO_CACHE.items()):
        if time.time() < expire_time and cached_entry.get("found") and cached_entry.get("polygon_coords"):
            coords = cached_entry["polygon_coords"]
            if len(coords) >= 3:
                try:
                    poly = Polygon([(p["lng"], p["lat"]) for p in coords])
                    if poly.contains(pt):
                        return cached_entry
                except Exception:
                    pass

    atlas_res = None
    bhumi_res = None
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f_atlas = executor.submit(query_atlas_cadastre, lat, lng)
        f_bhumi = executor.submit(query_bhumi_api, lat, lng, zoom)
        try:
            atlas_res = f_atlas.result(timeout=14.0)
        except Exception:
            atlas_res = None
        try:
            bhumi_res = f_bhumi.result(timeout=10.0)
        except Exception:
            bhumi_res = None

    if atlas_res and atlas_res.get("found"):
        if bhumi_res:
            if not atlas_res.get("nib") or atlas_res.get("nib") == "-":
                atlas_res["nib"] = bhumi_res.get("nib") or "-"
            if bhumi_res.get("luas") and bhumi_res.get("luas") > 0 and atlas_res.get("luas_m2") == 0:
                atlas_res["luas_m2"] = bhumi_res.get("luas")
                atlas_res["luas_ha"] = round(atlas_res["luas_m2"] / 10000.0, 4)
        PERSIL_INFO_CACHE[cache_key] = (atlas_res, time.time() + 900)
        return atlas_res

    nib = "-"
    tipe_hak = "Terdaftar ATR/BPN"
    luas = 0
    feat_id = None
    props = {}
    bbox_coords = None

    if bhumi_res:
        nib = bhumi_res.get("nib") or "-"
        tipe_hak = bhumi_res.get("tipe_hak") or "Terdaftar ATR/BPN"
        luas = bhumi_res.get("luas") or 0
        feat_id = bhumi_res.get("feat_id")
        props = bhumi_res.get("props") or {}
        bbox_coords = bhumi_res.get("bbox_coords")

    contour_pts = trace_parcel_contour_opencv(lat, lng, bbox_coords=bbox_coords)

    if contour_pts and len(contour_pts) >= 3:
        try:
            poly_chk = Polygon([(p["lng"], p["lat"]) for p in contour_pts])
            if not poly_chk.contains(Point(lng, lat)) and poly_chk.distance(Point(lng, lat)) > 0.000008:
                contour_pts = None
        except Exception:
            pass

    if contour_pts and len(contour_pts) >= 3:
        geo_area = calc_poly_area(contour_pts)
        final_luas = luas if (luas and luas > 0) else round(geo_area, 1)

        result = {
            "found": True,
            "nib": nib,
            "tipe_hak": tipe_hak,
            "luas_m2": final_luas,
            "luas_ha": round(final_luas / 10000.0, 4) if final_luas else 0,
            "fid": feat_id,
            "persilpasifid": props.get("persilpasifid"),
            "polygon_coords": contour_pts,
            "bbox_coords": contour_pts,
            "is_auto_traced": True,
            "raw_properties": props,
            "bhumi_url": f"https://bhumi.atrbpn.go.id/peta?latitude={lat:.6f}&longitude={lng:.6f}&zoom=19"
        }
        PERSIL_INFO_CACHE[cache_key] = (result, time.time() + 300)
        return result
    else:
        result = {
            "found": False,
            "message": "Titik klik berada di luar bidang tanah ATR/BPN terdaftar (seperti jalan, fasilitas umum, perairan, atau belum terpetakan di sistem publik ATR/BPN).",
            "polygon_coords": None,
            "bbox_coords": None,
            "bhumi_url": f"https://bhumi.atrbpn.go.id/peta?latitude={lat:.6f}&longitude={lng:.6f}&zoom=19"
        }
        PERSIL_INFO_CACHE[cache_key] = (result, time.time() + 60)
        return result
def merge_polygon_geometries(polygons_list):
    from shapely.ops import unary_union
    from shapely.validation import make_valid
    
    shapely_polys = []
    total_area_individual = 0.0
    orig_pts = []
    for poly in polygons_list:
        pts = []
        for p in poly:
            if isinstance(p, dict):
                c_lng = float(p.get("lng", p.get("lon", 0)))
                c_lat = float(p.get("lat", 0))
                pts.append((c_lng, c_lat))
                orig_pts.append((c_lng, c_lat))
            elif isinstance(p, (list, tuple)) and len(p) >= 2:
                c_lng = float(p[0])
                c_lat = float(p[1])
                pts.append((c_lng, c_lat))
                orig_pts.append((c_lng, c_lat))
        if len(pts) >= 3:
            p_obj = Polygon(pts)
            if not p_obj.is_valid:
                p_obj = make_valid(p_obj)
                if p_obj.geom_type == 'MultiPolygon':
                    p_obj = max(p_obj.geoms, key=lambda g: g.area)
            if p_obj.geom_type == 'Polygon' and p_obj.area > 0:
                shapely_polys.append(p_obj)
                pts_list = [{"lat": pt[1], "lng": pt[0]} for pt in p_obj.exterior.coords]
                total_area_individual += calc_poly_area(pts_list)
            
    if not shapely_polys:
        return None
        
    if len(shapely_polys) == 1:
        u = shapely_polys[0]
    else:
        buf_deg = 0.000005
        buffered = [p.buffer(buf_deg) for p in shapely_polys]
        u = unary_union(buffered).buffer(-buf_deg)
        u = make_valid(u)

    parts = []
    if u.geom_type == 'Polygon':
        geoms_list = [u]
    elif u.geom_type == 'MultiPolygon':
        geoms_list = list(u.geoms)
    elif hasattr(u, 'geoms'):
        geoms_list = [g for g in u.geoms if g.geom_type == 'Polygon']
    else:
        geoms_list = []

    if not geoms_list:
        return None

    total_area = 0.0
    for g in geoms_list:
        ext = g.exterior
        projected = []
        seen = set()
        for pt in orig_pts:
            p_geom = Point(pt)
            d = ext.distance(p_geom)
            if d < 0.000035:
                pos = ext.project(p_geom)
                pos_key = round(pos, 6)
                if pos_key not in seen:
                    seen.add(pos_key)
                    snapped = ext.interpolate(pos)
                    projected.append((pos, round(snapped.y, 7), round(snapped.x, 7)))

        for c in ext.coords[:-1]:
            p_geom = Point(c)
            pos = ext.project(p_geom)
            pos_key = round(pos, 6)
            if pos_key not in seen:
                seen.add(pos_key)
                projected.append((pos, round(c[1], 7), round(c[0], 7)))

        projected.sort(key=lambda x: x[0])
        p_coords = [{"lat": item[1], "lng": item[2]} for item in projected]
        if len(p_coords) >= 3:
            parts.append(p_coords)
            total_area += calc_poly_area(p_coords)

    if not parts:
        return None

    final_merged_area = max(total_area, total_area_individual)
    
    return {
        "success": True,
        "is_multipart": len(parts) > 1,
        "parts": parts,
        "merged_polygon": [[[c["lng"], c["lat"]] for c in parts[0]]],
        "polygon_coords": parts[0],
        "all_parts_coords": parts,
        "area_m2": round(final_merged_area, 1),
        "area_ha": round(final_merged_area / 10000.0, 4),
        "total_parcels_merged": len(polygons_list),
        "total_vertices": sum(len(p) for p in parts)
    }


def generate_shapefile_zip_bytes(coords_list, record_attrs):
    parts = []
    all_pts = []
    for part in coords_list:
        if not part or len(part) < 3:
            continue
        pts = [[float(p[0]), float(p[1])] for p in part]
        if pts[0] != pts[-1]:
            pts.append(pts[0])
        signed_area = 0.0
        for i in range(len(pts) - 1):
            signed_area += (pts[i][0] * pts[i+1][1] - pts[i+1][0] * pts[i][1])
        if signed_area > 0:
            pts.reverse()
        parts.append(pts)
        all_pts.extend(pts)

    if not all_pts:
        raise ValueError("Tidak ada koordinat poligon yang valid")

    xmin = min(p[0] for p in all_pts)
    ymin = min(p[1] for p in all_pts)
    xmax = max(p[0] for p in all_pts)
    ymax = max(p[1] for p in all_pts)

    num_parts = len(parts)
    num_points = len(all_pts)

    content_bytes = 4 + 32 + 4 + 4 + (num_parts * 4) + (num_points * 16)
    content_words = content_bytes // 2

    file_bytes = 100 + 8 + content_bytes
    file_words = file_bytes // 2

    shp_buf = bytearray(file_bytes)
    struct.pack_into(">i", shp_buf, 0, 9994)
    struct.pack_into(">i", shp_buf, 24, file_words)
    struct.pack_into("<i", shp_buf, 28, 1000)
    struct.pack_into("<i", shp_buf, 32, 5)
    struct.pack_into("<dddd", shp_buf, 36, xmin, ymin, xmax, ymax)
    struct.pack_into("<dddd", shp_buf, 68, 0.0, 0.0, 0.0, 0.0)

    struct.pack_into(">i", shp_buf, 100, 1)
    struct.pack_into(">i", shp_buf, 104, content_words)

    offset = 108
    struct.pack_into("<i", shp_buf, offset, 5)
    offset += 4
    struct.pack_into("<dddd", shp_buf, offset, xmin, ymin, xmax, ymax)
    offset += 32
    struct.pack_into("<i", shp_buf, offset, num_parts)
    offset += 4
    struct.pack_into("<i", shp_buf, offset, num_points)
    offset += 4

    part_idx = 0
    for p in parts:
        struct.pack_into("<i", shp_buf, offset, part_idx)
        offset += 4
        part_idx += len(p)

    for p in parts:
        for pt in p:
            struct.pack_into("<dd", shp_buf, offset, pt[0], pt[1])
            offset += 16

    shx_bytes = 100 + 8
    shx_words = shx_bytes // 2
    shx_buf = bytearray(shx_bytes)
    struct.pack_into(">i", shx_buf, 0, 9994)
    struct.pack_into(">i", shx_buf, 24, shx_words)
    struct.pack_into("<i", shx_buf, 28, 1000)
    struct.pack_into("<i", shx_buf, 32, 5)
    struct.pack_into("<dddd", shx_buf, 36, xmin, ymin, xmax, ymax)
    struct.pack_into("<dddd", shx_buf, 68, 0.0, 0.0, 0.0, 0.0)

    struct.pack_into(">i", shx_buf, 100, 50)
    struct.pack_into(">i", shx_buf, 104, content_words)

    fields = [
        ("PEMRAKARSA", "C", 255, 0),
        ("KEGIATAN", "C", 255, 0),
        ("TAHUN", "C", 255, 0),
        ("PROVINSI", "C", 255, 0),
        ("KETERANGAN", "C", 255, 0),
        ("LAYER", "C", 255, 0),
        ("LUAS", "N", 16, 4)
    ]
    header_len = 32 + (len(fields) * 32) + 1
    record_len = 1 + sum(f[2] for f in fields)
    dbf_bytes = header_len + record_len + 1

    dbf_buf = bytearray()
    dbf_buf.append(0x03)
    dbf_buf.extend([26, 10, 4])
    dbf_buf.extend(struct.pack("<i", 1))
    dbf_buf.extend(struct.pack("<h", header_len))
    dbf_buf.extend(struct.pack("<h", record_len))
    dbf_buf.extend([0] * 20)

    for name, ftype, flen, fdec in fields:
        fdesc = bytearray(32)
        name_bytes = name.encode('ascii')[:10]
        fdesc[0:len(name_bytes)] = name_bytes
        fdesc[11] = ord(ftype)
        fdesc[16] = flen
        fdesc[17] = fdec
        dbf_buf.extend(fdesc)

    dbf_buf.append(0x0D)
    dbf_buf.append(0x20)

    for name, ftype, flen, fdec in fields:
        val = record_attrs.get(name, "")
        if ftype == "N":
            try:
                num = float(val) if val is not None else 0.0
            except Exception:
                num = 0.0
            if fdec > 0:
                sval = f"{num:.{fdec}f}"
            else:
                sval = f"{int(round(num))}"
            val_bytes = sval.rjust(flen).encode('ascii')[:flen]
        else:
            val_bytes = str(val or "").upper().ljust(flen).encode('ascii', errors='replace')[:flen]
        dbf_buf.extend(val_bytes)

    dbf_buf.append(0x1A)

    prj_str = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("tapak_proyek.shp", bytes(shp_buf))
        zf.writestr("tapak_proyek.shx", bytes(shx_buf))
        zf.writestr("tapak_proyek.dbf", bytes(dbf_buf))
        zf.writestr("tapak_proyek.prj", prj_str)
        zf.writestr("tapak_proyek.cpg", "UTF-8\n")

    return zip_buffer.getvalue()

class GISProxyHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            self.close_connection = True
        except Exception:
            self.close_connection = True

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/export-shp":
            try:
                content_len = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_len).decode("utf-8")
                payload = json.loads(body)
                parts = payload.get("parts", [])
                attrs = payload.get("attrs", {})
                upper_attrs = {}
                for k, v in attrs.items():
                    key_upper = str(k).upper()
                    if isinstance(v, str):
                        upper_attrs[key_upper] = v.upper()
                    else:
                        upper_attrs[key_upper] = v
                zip_data = generate_shapefile_zip_bytes(parts, upper_attrs)
                self.send_response(200)
                self.send_header("Content-Type", "application/zip")
                self.send_header("Content-Disposition", 'attachment; filename="DutaGeoSpasi_shapefile_bidang.zip"')
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(zip_data)))
                self.end_headers()
                self.wfile.write(zip_data)
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
            return

        if path == "/api/merge-parcels":
            try:
                content_len = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_len).decode("utf-8")
                payload = json.loads(body)
                polys = payload.get("polygons", [])
                if not polys or len(polys) < 2:
                    self.send_response(400)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": False, "error": "Dibutuhkan minimal 2 bidang poligon"}).encode("utf-8"))
                    return

                merged = merge_polygon_geometries(polys)
                if merged and merged.get("polygon_coords"):
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    merged["success"] = True
                    self.wfile.write(json.dumps(merged).encode("utf-8"))
                else:
                    self.send_response(400)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": False, "error": "Gagal menggabungkan geometri bidang"}).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
            return

        if path == "/api/clear-cache":
            deleted = 0
            if os.path.exists(CACHE_DIR):
                for root, dirs, files in os.walk(CACHE_DIR, topdown=False):
                    for f in files:
                        if f.endswith(".png"):
                            try:
                                os.remove(os.path.join(root, f))
                                deleted += 1
                            except Exception:
                                pass
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "deleted_count": deleted, "message": f"Cache lokal dibersihkan ({deleted} tile)."}).encode("utf-8"))
            return

        if path == "/api/admin/members":
            try:
                init_admin_db()
                content_len = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_len).decode("utf-8")
                payload = json.loads(body)
                action = payload.get("action", "save")
                email = payload.get("email", "").strip().lower()
                if not email:
                    self.send_response(400)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": False, "error": "Email wajib diisi"}).encode("utf-8"))
                    return

                conn = get_admin_db()
                cur = conn.cursor()
                now_str = time.strftime("%Y-%m-%d %H:%M:%S")

                if action == "delete":
                    cur.execute("DELETE FROM members WHERE LOWER(email) = ?", (email,))
                elif action == "block":
                    st = payload.get("status", "blocked")
                    cur.execute("UPDATE members SET status = ?, updated_at = ? WHERE LOWER(email) = ?", (st, now_str, email))
                elif action == "role":
                    rl = payload.get("role", "free")
                    cur.execute("UPDATE members SET role = ?, updated_at = ? WHERE LOWER(email) = ?", (rl, now_str, email))
                else:
                    fn = payload.get("full_name", "")
                    rl = payload.get("role", "free")
                    st = payload.get("status", "active")
                    cur.execute('''
                        INSERT INTO members (email, full_name, role, status, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT(email) DO UPDATE SET
                            full_name = excluded.full_name,
                            role = excluded.role,
                            status = excluded.status,
                            updated_at = excluded.updated_at
                    ''', (email, fn, rl, st, now_str, now_str))

                conn.commit()
                conn.close()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True}).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
            return

        if path == "/api/admin/payments":
            try:
                init_admin_db()
                content_len = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_len).decode("utf-8")
                payload = json.loads(body)
                action = payload.get("action", "save")
                conn = get_admin_db()
                cur = conn.cursor()
                now_str = time.strftime("%Y-%m-%d %H:%M:%S")

                if action == "clear_pending":
                    cur.execute("DELETE FROM payments WHERE status = 'pending'")
                elif action == "delete":
                    pid = payload.get("id")
                    cur.execute("DELETE FROM payments WHERE id = ?", (pid,))
                elif action == "approve":
                    pid = payload.get("id")
                    email = payload.get("email", "").strip().lower()
                    if pid:
                        cur.execute("UPDATE payments SET status = 'approved' WHERE id = ?", (pid,))
                    if email:
                        cur.execute('''
                            INSERT INTO members (email, role, status, updated_at)
                            VALUES (?, 'pro', 'active', ?)
                            ON CONFLICT(email) DO UPDATE SET role = 'pro', status = 'active', updated_at = excluded.updated_at
                        ''', (email, now_str))
                else:
                    pid = str(payload.get("id") or int(time.time() * 1000))
                    email = payload.get("email", "").strip().lower()
                    code = payload.get("unique_code", "")
                    amount = float(payload.get("total_amount", 0))
                    st = payload.get("status", "pending")
                    cur.execute('''
                        INSERT OR REPLACE INTO payments (id, email, unique_code, total_amount, status, created_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    ''', (pid, email, code, amount, st, now_str))

                conn.commit()
                conn.close()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True}).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/SHP-Builder":
            self.path = "/SHP-Builder.html"
            return super().do_GET()

        if path == "/api/admin/members":
            try:
                init_admin_db()
                conn = get_admin_db()
                cur = conn.cursor()
                cur.execute("SELECT * FROM members ORDER BY id DESC")
                rows = [dict(r) for r in cur.fetchall()]
                conn.close()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "members": rows}).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
            return

        if path == "/api/admin/payments":
            try:
                init_admin_db()
                conn = get_admin_db()
                cur = conn.cursor()
                cur.execute("SELECT * FROM payments ORDER BY created_at DESC")
                rows = [dict(r) for r in cur.fetchall()]
                conn.close()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "payments": rows}).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
            return

        if path == "/api/clear-cache":
            deleted = 0
            if os.path.exists(CACHE_DIR):
                for root, dirs, files in os.walk(CACHE_DIR, topdown=False):
                    for f in files:
                        if f.endswith(".png"):
                            try:
                                os.remove(os.path.join(root, f))
                                deleted += 1
                            except Exception:
                                pass
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "deleted_count": deleted, "message": f"Cache lokal dibersihkan ({deleted} tile)."}).encode("utf-8"))
            return

        if path == "/api/search-nib":
            target_nib = query.get("nib", [""])[0].strip()
            lat_str = query.get("lat", [""])[0]
            lng_str = query.get("lng", [""])[0]
            if not target_nib:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"found": False, "error": "Parameter nib dibutuhkan"}).encode("utf-8"))
                return

            c_lat = float(lat_str) if lat_str else -6.1884
            c_lng = float(lng_str) if lng_str else 106.8320

            offsets = [(0, 0)]
            ring1 = 0.0006
            ring2 = 0.0012
            for d in [ring1, -ring1]:
                offsets.extend([(d, 0), (0, d), (d, d), (d, -d)])
            for d in [ring2, -ring2]:
                offsets.extend([(d, 0), (0, d), (d, d), (d, -d)])

            found_item = None
            for dlat, dlng in offsets:
                test_lat = c_lat + dlat
                test_lng = c_lng + dlng
                try:
                    res = query_persil_at_coord(test_lat, test_lng)
                    if res.get("found"):
                        current_nib = str(res.get("nib", ""))
                        if target_nib in current_nib or current_nib in target_nib:
                            found_item = {
                                "found": True,
                                "nib": res.get("nib"),
                                "desa": res.get("desa"),
                                "center_lat": test_lat,
                                "center_lng": test_lng,
                                "matched_lat": test_lat,
                                "matched_lng": test_lng,
                                "polygon_coords": res.get("polygon_coords"),
                                "luas_m2": res.get("luas_m2"),
                                "data": res
                            }
                            break
                except:
                    continue

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            if found_item:
                self.wfile.write(json.dumps(found_item).encode("utf-8"))
            else:
                self.wfile.write(json.dumps({"found": False, "message": "Bidang dengan NIB tersebut tidak ditemukan di sekitar area pencarian."}).encode("utf-8"))
            return

        if path == "/api/wilayah/provinsi":
            conn = get_kabkot_db()
            if not conn:
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Database wilayah belum tersedia"}).encode("utf-8"))
                return
            cur = conn.cursor()
            cur.execute("SELECT kode, nama FROM prov ORDER BY nama")
            items = [{"kode": r["kode"], "nama": r["nama"]} for r in cur.fetchall()]
            conn.close()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(items).encode("utf-8"))
            return

        if path == "/api/wilayah/kabupaten":
            prov_kode = query.get("prov_kode", [""])[0].strip()
            conn = get_kabkot_db()
            if not conn:
                self.send_response(500)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                return
            cur = conn.cursor()
            if prov_kode:
                cur.execute("SELECT kode, nama FROM kab WHERE prov_kode = ? ORDER BY nama", (prov_kode,))
            else:
                cur.execute("SELECT kode, nama FROM kab ORDER BY nama LIMIT 100")
            items = [{"kode": r["kode"], "nama": r["nama"]} for r in cur.fetchall()]
            conn.close()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(items).encode("utf-8"))
            return

        if path == "/api/wilayah/kecamatan":
            kab_kode = query.get("kab_kode", [""])[0].strip()
            conn = get_desa_db()
            if not conn:
                self.send_response(500)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                return
            cur = conn.cursor()
            if kab_kode:
                variants = [kab_kode]
                if "." in kab_kode:
                    variants.append(kab_kode.replace(".", ""))
                elif len(kab_kode) == 4:
                    variants.append(f"{kab_kode[:2]}.{kab_kode[2:]}")
                placeholders = ",".join("?" for _ in variants)
                cur.execute(f"SELECT kode, nama FROM kec WHERE kab_kode IN ({placeholders}) ORDER BY nama", variants)
            else:
                cur.execute("SELECT kode, nama FROM kec ORDER BY nama LIMIT 100")
            items = [{"kode": r["kode"], "nama": r["nama"]} for r in cur.fetchall()]
            conn.close()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(items).encode("utf-8"))
            return

        if path == "/api/wilayah/desa":
            kec_kode = query.get("kec_kode", [""])[0].strip()
            conn = get_desa_db()
            if not conn:
                self.send_response(500)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                return
            cur = conn.cursor()
            if kec_kode:
                variants = [kec_kode]
                if "." in kec_kode:
                    variants.append(kec_kode.replace(".", ""))
                elif len(kec_kode) == 6:
                    variants.append(f"{kec_kode[:2]}.{kec_kode[2:4]}.{kec_kode[4:]}")
                placeholders = ",".join("?" for _ in variants)
                cur.execute(f"SELECT desa_kode, desa_nama, kodepos FROM desa_full WHERE kec_kode IN ({placeholders}) ORDER BY desa_nama", variants)
            else:
                cur.execute("SELECT desa_kode, desa_nama, kodepos FROM desa_full ORDER BY desa_nama LIMIT 100")
            items = [{"kode": r["desa_kode"], "nama": r["desa_nama"], "kodepos": r["kodepos"]} for r in cur.fetchall()]
            conn.close()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(items).encode("utf-8"))
            return

        if path == "/api/wilayah/search":
            q = query.get("q", [""])[0].strip()
            conn = get_desa_db()
            if not conn or not q:
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps([]).encode("utf-8"))
                return
            cur = conn.cursor()
            if q.isdigit():
                cur.execute("SELECT desa_kode, desa_nama, kec_nama, kab_nama, prov_nama, kodepos FROM desa_full WHERE kodepos LIKE ? LIMIT 30", (f"{q}%",))
            else:
                cur.execute("SELECT desa_kode, desa_nama, kec_nama, kab_nama, prov_nama, kodepos FROM desa_full WHERE desa_nama LIKE ? OR kec_nama LIKE ? OR kab_nama LIKE ? LIMIT 30", (f"{q}%", f"{q}%", f"{q}%"))
            rows = cur.fetchall()
            items = [{
                "kode": r["desa_kode"],
                "desa": r["desa_nama"],
                "kec": r["kec_nama"],
                "kab": r["kab_nama"],
                "prov": r["prov_nama"],
                "kodepos": r["kodepos"]
            } for r in rows]
            conn.close()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(items).encode("utf-8"))
            return

        if path == "/api/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            data = {
                "status": "ok",
                "service": "Server Peta Bidang Tanah ATR/BPN (High-Speed Multi-Threaded)",
                "port": PORT,
                "token_active": TOKEN_STATE["token"] is not None
            }
            self.wfile.write(json.dumps(data).encode('utf-8'))
            return

        if path == "/api/wilayah/all.json" or path == "/api/wilayah-all":
            accept_enc = self.headers.get("Accept-Encoding", "")
            gz_path = get_data_filepath("wilayah_indonesia.json.gz")
            raw_path = get_data_filepath("wilayah_indonesia.json")
            if "gzip" in accept_enc and os.path.exists(gz_path):
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Encoding", "gzip")
                self.send_header("Cache-Control", "public, max-age=31536000, immutable")
                self.end_headers()
                with open(gz_path, "rb") as f:
                    self.wfile.write(f.read())
                return
            elif os.path.exists(raw_path):
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "public, max-age=31536000, immutable")
                self.end_headers()
                with open(raw_path, "rb") as f:
                    self.wfile.write(f.read())
                return
            else:
                self.send_response(404)
                self.end_headers()
                return

        if path == "/api/batas-kelurahan":
            desa = query.get("desa", [""])[0]
            kec = query.get("kec", [""])[0]
            kab = query.get("kab", [""])[0]
            prov = query.get("prov", [""])[0]
            if not desa:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Parameter desa dibutuhkan"}).encode('utf-8'))
                return
            res = fetch_batas_kelurahan_geojson(desa, kec=kec, kab=kab, prov=prov)
            if res:
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "public, max-age=604800")
                self.end_headers()
                self.wfile.write(json.dumps(res).encode('utf-8'))
            else:
                self.send_response(404)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Batas kelurahan tidak ditemukan"}).encode('utf-8'))
            return

        # 2. API Persil Info: /api/persil-info?lat=...&lng=...
        if path == "/api/persil-info":
            lat_str = query.get("lat", [""])[0]
            lng_str = query.get("lng", [""])[0]
            if not lat_str or not lng_str:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"found": False, "error": "Parameter lat dan lng dibutuhkan"}).encode('utf-8'))
                return
            
            try:
                lat = float(lat_str)
                lng = float(lng_str)
                zoom_str = query.get("zoom", ["19"])[0]
                z_param = int(zoom_str) if zoom_str.isdigit() else 19
                result = query_persil_at_coord(lat, lng, zoom=z_param)
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps(result).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"found": False, "error": str(e)}).encode('utf-8'))
            return


        # 3. Reverse Geocode: /api/reverse-geocode?lat=...&lon=... (or lng)
        if path == "/api/reverse-geocode":
            lat = query.get("lat", [""])[0]
            lon = query.get("lon", [""])[0] or query.get("lng", [""])[0]
            sel_desa = query.get("desa", [""])[0]
            sel_kec = query.get("kec", [""])[0]
            sel_kab = query.get("kab", [""])[0]
            if lat and lon:
                geo_dict = {"address": {}}
                geo_url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}&addressdetails=1"
                req = urllib.request.Request(
                    geo_url,
                    headers={"User-Agent": "PetaBidangATRBPN/1.0 (local-gis-viewer)"}
                )
                try:
                    with urllib.request.urlopen(req, timeout=5) as r:
                        geo_dict = json.loads(r.read().decode('utf-8'))
                except Exception:
                    pass
                try:
                    geo_dict = enrich_address_with_wilayah_db(geo_dict, float(lat), float(lon), sel_desa, sel_kec, sel_kab)
                except Exception:
                    pass
                
                addr = geo_dict.get("address", {})
                geo_dict["success"] = True
                geo_dict["desa"] = addr.get("village") or addr.get("suburb") or addr.get("neighbourhood") or "-"
                geo_dict["kecamatan"] = addr.get("city_district") or addr.get("district") or "-"
                geo_dict["kabupaten"] = addr.get("county") or addr.get("city") or "-"
                geo_dict["provinsi"] = addr.get("state") or "-"
                geo_dict["kantah"] = geo_dict.get("kantah") or (f"Kantor Pertanahan {geo_dict['kabupaten']}" if geo_dict['kabupaten'] != "-" else "-")
                geo_dict["alamat_lengkap"] = geo_dict.get("display_name") or f"Desa {geo_dict['desa']}, Kec. {geo_dict['kecamatan']}, {geo_dict['kabupaten']}, {geo_dict['provinsi']}"
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps(geo_dict).encode('utf-8'))
                return
            self.send_response(400)
            self.end_headers()
            return

        if path == "/api/search-sertifikat":
            nomor = query.get("nomor", [""])[0].strip()
            jenis = query.get("jenis", ["Hak Milik"])[0].strip()
            desa = query.get("desa", [""])[0].strip()
            kec = query.get("kec", [""])[0].strip()
            kab = query.get("kab", [""])[0].strip()
            
            result = {"success": False, "query": {"nomor": nomor, "jenis": jenis, "desa": desa, "kec": kec, "kab": kab}}
            if nomor:
                conn = get_wilayah_db()
                target_desa_info = None
                if conn:
                    try:
                        cur = conn.cursor()
                        if desa and kab:
                            clean_kab = kab.replace("Kabupaten", "").replace("Kota", "").strip()
                            cur.execute("SELECT * FROM desa_full WHERE desa_nama LIKE ? AND kab_nama LIKE ? LIMIT 1", (f"%{desa}%", f"%{clean_kab}%"))
                            target_desa_info = cur.fetchone()
                        elif desa:
                            cur.execute("SELECT * FROM desa_full WHERE desa_nama LIKE ? LIMIT 1", (f"%{desa}%",))
                            target_desa_info = cur.fetchone()
                    except Exception:
                        pass
                    finally:
                        conn.close()
                
                clean_num = nomor.zfill(5) if nomor.isdigit() and len(nomor) < 5 else nomor
                result["success"] = True
                result["nomor_sertifikat"] = f"{jenis} No. {clean_num}"
                desa_code_clean = target_desa_info["desa_kode"].replace(".", "") if (target_desa_info and "desa_kode" in target_desa_info.keys()) else "331000"
                result["nib_perkiraan"] = f"{desa_code_clean}.{clean_num}" if clean_num.isdigit() else clean_num
                result["desa_info"] = dict(target_desa_info) if target_desa_info else None
                
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))
            return

        if path.startswith("/persil/") or path.startswith("/api/tile/") or path.startswith("/api/persil/"):
            clean_p = path.strip("/")
            parts = clean_p.split("/")
            if len(parts) >= 3 and (parts[-1].endswith(".webp") or parts[-1].endswith(".png")):
                is_webp = parts[-1].endswith(".webp")
                content_type = "image/webp" if is_webp else "image/png"
                fmt = "webp" if is_webp else "png"
                blank = TRANSPARENT_WEBP if is_webp else TRANSPARENT_PNG
                try:
                    z = int(parts[-3])
                    x = int(parts[-2])
                    y_str = parts[-1].replace(".webp", "").replace(".png", "")
                    y = int(y_str)
                    force_refresh = ("t" in query or "bust" in query or "refresh" in query)

                    if z < 15:
                        self.send_response(200)
                        self.send_header("Content-Type", content_type)
                        self.send_header("Cache-Control", "public, max-age=86400")
                        self.end_headers()
                        self.wfile.write(blank)
                        return

                    if z > 19:
                        parent_z = 19
                        dz = z - parent_z
                        factor = 1 << dz
                        parent_x = x // factor
                        parent_y = y // factor
                        parent_bytes = fetch_persil_tile_bytes(parent_z, parent_x, parent_y, force_refresh=force_refresh, fmt=fmt)
                        if parent_bytes:
                            from PIL import Image
                            import io
                            p_img = Image.open(io.BytesIO(parent_bytes)).convert('RGBA')
                            pw, ph = p_img.size
                            step_w = pw / factor
                            step_h = ph / factor
                            rem_x = x % factor
                            rem_y = y % factor
                            crop_box = (
                                int(rem_x * step_w),
                                int(rem_y * step_h),
                                int((rem_x + 1) * step_w),
                                int((rem_y + 1) * step_h)
                            )
                            cropped = p_img.crop(crop_box).resize((pw, ph), Image.Resampling.NEAREST)
                            out_buf = io.BytesIO()
                            out_fmt = "WEBP" if is_webp else "PNG"
                            cropped.save(out_buf, format=out_fmt, quality=80)
                            sub_tile_bytes = out_buf.getvalue()
                            tile_file = os.path.join(CACHE_DIR, str(z), str(x), f"{y}.{fmt}")
                            os.makedirs(os.path.dirname(tile_file), exist_ok=True)
                            with open(tile_file, "wb") as f:
                                f.write(sub_tile_bytes)
                            self.send_response(200)
                            self.send_header("Content-Type", content_type)
                            self.send_header("Cache-Control", "no-cache" if force_refresh else "public, max-age=3600, must-revalidate")
                            self.end_headers()
                            self.wfile.write(sub_tile_bytes)
                            return

                    tile_bytes = fetch_persil_tile_bytes(z, x, y, force_refresh=force_refresh, fmt=fmt)
                    if tile_bytes:
                        self.send_response(200)
                        self.send_header("Content-Type", content_type)
                        self.send_header("Cache-Control", "no-cache" if force_refresh else "public, max-age=3600, must-revalidate")
                        self.end_headers()
                        self.wfile.write(tile_bytes)
                        return
                    else:
                        self.send_response(200)
                        self.send_header("Content-Type", content_type)
                        self.end_headers()
                        self.wfile.write(blank)
                        return
                except Exception:
                    self.send_response(200)
                    self.send_header("Content-Type", content_type)
                    self.end_headers()
                    self.wfile.write(blank)
                    return
        if path.startswith("/api/layer-ceking/"):
            parts = path.strip("/").split("/")
            if len(parts) == 6 and (parts[5].endswith(".webp") or parts[5].endswith(".png")):
                is_webp = parts[5].endswith(".webp")
                content_type = "image/webp" if is_webp else "image/png"
                fmt = "webp" if is_webp else "png"
                blank = TRANSPARENT_WEBP if is_webp else TRANSPARENT_PNG
                try:
                    layer_name = parts[2]
                    z = int(parts[3])
                    x = int(parts[4])
                    y_str = parts[5].replace(".webp", "").replace(".png", "")
                    y = int(y_str)
                    force_refresh = ("t" in query or "bust" in query or "refresh" in query)

                    if z > 19:
                        parent_z = 19
                        dz = z - parent_z
                        factor = 1 << dz
                        parent_x = x // factor
                        parent_y = y // factor
                        parent_bytes = fetch_ceking_tile_bytes(layer_name, parent_z, parent_x, parent_y, force_refresh=force_refresh, fmt=fmt)
                        if parent_bytes:
                            from PIL import Image
                            import io
                            p_img = Image.open(io.BytesIO(parent_bytes)).convert('RGBA')
                            pw, ph = p_img.size
                            step_w = pw / factor
                            step_h = ph / factor
                            rem_x = x % factor
                            rem_y = y % factor
                            crop_box = (
                                int(rem_x * step_w),
                                int(rem_y * step_h),
                                int((rem_x + 1) * step_w),
                                int((rem_y + 1) * step_h)
                            )
                            cropped = p_img.crop(crop_box).resize((pw, ph), Image.Resampling.NEAREST)
                            out_buf = io.BytesIO()
                            out_fmt = "WEBP" if is_webp else "PNG"
                            cropped.save(out_buf, format=out_fmt, quality=80)
                            sub_tile_bytes = out_buf.getvalue()
                            tile_file = os.path.join(CEKING_CACHE_DIR, layer_name, str(z), str(x), f"{y}.{fmt}")
                            os.makedirs(os.path.dirname(tile_file), exist_ok=True)
                            with open(tile_file, "wb") as f:
                                f.write(sub_tile_bytes)
                            self.send_response(200)
                            self.send_header("Content-Type", content_type)
                            self.send_header("Cache-Control", "no-cache" if force_refresh else "public, max-age=86400")
                            self.end_headers()
                            self.wfile.write(sub_tile_bytes)
                            return

                    tile_bytes = fetch_ceking_tile_bytes(layer_name, z, x, y, force_refresh=force_refresh, fmt=fmt)
                    if tile_bytes:
                        self.send_response(200)
                        self.send_header("Content-Type", content_type)
                        self.send_header("Cache-Control", "no-cache" if force_refresh else "public, max-age=86400")
                        self.end_headers()
                        self.wfile.write(tile_bytes)
                        return
                    else:
                        self.send_response(200)
                        self.send_header("Content-Type", content_type)
                        self.end_headers()
                        self.wfile.write(blank)
                        return
                except Exception:
                    self.send_response(200)
                    self.send_header("Content-Type", content_type)
                    self.end_headers()
                    self.wfile.write(blank)
                    return
                    return

        # 5. Default static files
        return super().do_GET()

def run_server():
    server = ThreadingHTTPServer(("0.0.0.0", PORT), GISProxyHandler)
    url = f"http://localhost:{PORT}/"
    print("=" * 68)
    print("  DUTAGEOSPASI - SERVER WEB GIS & PROXY PETA ATR/BPN")
    print("=" * 68)
    print(f"URL Web Viewer : {url}")
    print(f"Domain Web     : https://geospasi.dutamik.id")
    print(f"Pengembang     : Duta Digital Agensi (dutamik.id)")
    print(f"Tagline        : Duta Media Informasi berKarya")
    print(f"Lokasi         : Sukoharjo, Jawa Tengah")
    print(f"Status Proxy   : AKTIF (Header Referer Bhumi & Dekripsi NIB Otomatis)")
    print(f"Folder Cache   : {CACHE_DIR}")
    print("-" * 68)
    print("Fitur Aktif    : WMS Tiles Persil, Query NIB, Luas Resmi Ha & Export SHP")
    print("Tekan Ctrl + C untuk menghentikan server.")
    print("=" * 68)
    
    # Auto open browser
    try:
        webbrowser.open(url)
    except:
        pass

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] Server dihentikan.")
        server.server_close()

if __name__ == "__main__":
    run_server()
