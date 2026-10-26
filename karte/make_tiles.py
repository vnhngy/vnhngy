#!/usr/bin/env python3
"""Drivo-Kartenkacheln aus OpenStreetMap.

Eingabe: GeoJSONSeq aus `osmium export` (nur Linien mit highway=motorway…tertiary bzw. waterway=river/canal).
Ausgabe: <out>/osm/index.json und <out>/osm/b<bi>_<bj>.json (Pakete aus 8 × 6 Kacheln).

Kacheln folgen dem Regionsraster der App: i = floor(lat / 0,06), j = floor(lng / 0,09).
Eine Linie ist "Klasse|y0,x0,dy,dx,…" in Einheiten von 5e-5° Breite und 7,5e-5° Länge (je etwa 5 m)
ab ORIGIN. Klassen: 0 Fluss/Kanal, 1 Autobahn, 2 Kraftfahrstraße, 3 Bundes-, 4 Landes-, 5 Kreisstraße.

Ablauf: Punkte auf das 5-m-Raster legen, Wege gleicher Klasse an gemeinsamen Endpunkten verbinden,
mit Douglas-Peucker vereinfachen (7 m Straßen, 9 m Wasser), in Kacheln schneiden, zu Paketen bündeln.
"""
import array, datetime, json, math, os, sys, time
import numpy as np

QA, QO = 5e-5, 7.5e-5            # Grad je Einheit (Breite, Länge)
LA0, LO0 = 47.0, 5.5             # Ursprung der Einheiten
CLAT, CLNG = 0.06, 0.09          # Kachelgröße wie das Regionsraster der App
BI, BJ = 8, 6                    # Kacheln je Paket (Zeilen, Spalten)
PAD = 2                          # Überlappung an Kachelgrenzen (Einheiten)
CLS = {"motorway": 1, "motorway_link": 1, "trunk": 2, "trunk_link": 2, "primary": 3, "primary_link": 3,
       "secondary": 4, "tertiary": 5}
TOL = {0: 9.0, 1: 7.0, 2: 7.0, 3: 7.0, 4: 7.0, 5: 7.0}   # Meter
MY = QA * 110574.0               # Meter je Einheit in y


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def read_ways(path):
    ways, n_in = [], 0
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip().lstrip("\x1e")
            if not line:
                continue
            n_in += 1
            ft = json.loads(line)
            g = ft.get("geometry") or {}
            if g.get("type") != "LineString":
                continue
            p = ft.get("properties") or {}
            h, w = p.get("highway"), p.get("waterway")
            c = CLS.get(h) if h else (0 if w in ("river", "canal") else None)
            if c is None:
                continue
            a = array.array("i")
            ly = lx = None
            for lng, lat in g.get("coordinates") or []:
                y, x = round((lat - LA0) / QA), round((lng - LO0) / QO)
                if y != ly or x != lx:
                    a.append(y); a.append(x); ly, lx = y, x
            if len(a) >= 4:
                ways.append((c, a))
    log(f"gelesen: {n_in} Objekte, {len(ways)} Wege, {sum(len(a) for _, a in ways) // 2} Punkte")
    return ways


def rev(a):
    """Punktfolge umdrehen (Paare bleiben Paare)."""
    r = array.array("i", bytes(len(a) * a.itemsize))
    n = len(a) // 2
    r[0::2] = a[0::2][::-1]
    r[1::2] = a[1::2][::-1]
    return r


def merge(ways):
    ends = {}
    for k, (c, a) in enumerate(ways):
        ends.setdefault((c, a[0], a[1]), []).append(k)
        ends.setdefault((c, a[-2], a[-1]), []).append(k)
    used = bytearray(len(ways))

    def take(c, y, x):
        for m in ends.get((c, y, x), ()):
            if not used[m]:
                used[m] = 1
                return ways[m][1]
        return None

    chains = []
    for k, (c, a) in enumerate(ways):
        if used[k]:
            continue
        used[k] = 1
        cur = array.array("i", a)
        sy, sx = cur[0], cur[1]
        while (cur[-2], cur[-1]) != (sy, sx):
            b = take(c, cur[-2], cur[-1])
            if b is None:
                break
            if b[0] == cur[-2] and b[1] == cur[-1]:
                cur.extend(b[2:])
            else:
                cur.extend(rev(b)[2:])
        back = array.array("i")
        by, bx = sy, sx
        while (by, bx) != (cur[-2], cur[-1]):
            b = take(c, by, bx)
            if b is None:
                break
            out = rev(b) if (b[-2] == by and b[-1] == bx) else b   # vom Verbindungspunkt nach außen
            back.extend(out[2:])
            by, bx = back[-2], back[-1]
        if back:
            cur = rev(back) + cur
        chains.append((c, cur))
    log(f"verbunden: {len(chains)} Linienzüge")
    return chains


def simplify(c, a):
    n = len(a) // 2
    v = np.frombuffer(a, dtype=np.int32).reshape(n, 2).astype(np.float64)
    if n <= 2:
        return v.astype(np.int64)
    lat = LA0 + v[:, 0].mean() * QA
    mx = QO * 111320.0 * math.cos(math.radians(lat))
    Y, X = v[:, 0] * MY, v[:, 1] * mx
    keep = np.zeros(n, dtype=bool)
    keep[0] = keep[-1] = True
    tol2 = TOL[c] ** 2
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        vx, vy = X[j] - X[i], Y[j] - Y[i]
        wx, wy = X[i + 1:j] - X[i], Y[i + 1:j] - Y[i]
        L2 = vx * vx + vy * vy
        if L2 > 0:
            t = np.clip((wx * vx + wy * vy) / L2, 0.0, 1.0)
            d2 = (wx - t * vx) ** 2 + (wy - t * vy) ** 2
        else:
            d2 = wx * wx + wy * wy
        m = int(np.argmax(d2))
        if d2[m] > tol2:
            k = i + 1 + m
            keep[k] = True
            stack.append((i, k)); stack.append((k, j))
    return v[keep].astype(np.int64)


def tile_rect(i, j):
    return ((i * CLAT - LA0) / QA - PAD, ((i + 1) * CLAT - LA0) / QA + PAD,
            (j * CLNG - LO0) / QO - PAD, ((j + 1) * CLNG - LO0) / QO + PAD)


def clip_seg(py, px, qy, qx, r):
    y0, y1, x0, x1 = r
    dy, dx = qy - py, qx - px
    t0, t1 = 0.0, 1.0
    for pp, qq in ((-dx, px - x0), (dx, x1 - px), (-dy, py - y0), (dy, y1 - py)):
        if pp == 0:
            if qq < 0:
                return None
            continue
        rr = qq / pp
        if pp < 0:
            if rr > t1:
                return None
            if rr > t0:
                t0 = rr
        else:
            if rr < t0:
                return None
            if rr < t1:
                t1 = rr
    return t0, t1


def tile_of(y, x):
    return math.floor((LA0 + y * QA) / CLAT), math.floor((LO0 + x * QO) / CLNG)


def cut(c, pts, tiles):
    """Linienzug auf Kacheln verteilen; je Kachel zusammenhängende Stücke."""
    open_ = {}   # Kachel -> (Liste der Punkte, Index des letzten Segments, endete es innen?)

    def flush(key):
        seg = open_.pop(key)[0]
        q = []
        for y, x in seg:
            p = (round(y), round(x))
            if not q or q[-1] != p:
                q.append(p)
        if len(q) >= 2:
            tiles.setdefault(key, []).append((c, q))

    for s in range(len(pts) - 1):
        py, px = float(pts[s][0]), float(pts[s][1])
        qy, qx = float(pts[s + 1][0]), float(pts[s + 1][1])
        ia, ja = tile_of(min(py, qy) - PAD, min(px, qx) - PAD)
        ib, jb = tile_of(max(py, qy) + PAD, max(px, qx) + PAD)
        for i in range(ia, ib + 1):
            for j in range(ja, jb + 1):
                r = clip_seg(py, px, qy, qx, tile_rect(i, j))
                if r is None:
                    continue
                t0, t1 = r
                if t1 <= t0:
                    continue
                key = (i, j)
                a = (py + t0 * (qy - py), px + t0 * (qx - px))
                b = (py + t1 * (qy - py), px + t1 * (qx - px))
                o = open_.get(key)
                if o and o[1] == s - 1 and o[2] and t0 == 0.0:
                    o[0].append(b)
                    open_[key] = (o[0], s, t1 == 1.0)
                else:
                    if o:
                        flush(key)
                    open_[key] = ([a, b], s, t1 == 1.0)
        # Stücke schließen, die in diesem Segment nicht weitergeführt wurden
        for key in [k for k, o in open_.items() if o[1] < s]:
            flush(key)
    for key in list(open_):
        flush(key)


def encode(c, q):
    y, x = q[0]
    v = [y, x]
    for ny, nx in q[1:]:
        v += [ny - y, nx - x]
        y, x = ny, nx
    return f"{c}|" + ",".join(map(str, v))


def main():
    src, out = sys.argv[1], sys.argv[2]
    stand = sys.argv[3] if len(sys.argv) > 3 else datetime.date.today().isoformat()
    ways = read_ways(src)
    chains = merge(ways)
    del ways
    tiles, n_pts = {}, 0
    for n, (c, a) in enumerate(chains):
        pts = simplify(c, a).tolist()
        n_pts += len(pts)
        cut(c, pts, tiles)
        if n % 50000 == 0:
            log(f"vereinfacht {n}/{len(chains)}, {len(tiles)} Kacheln")
    log(f"vereinfacht: {n_pts} Punkte, {len(tiles)} Kacheln")
    bundles = {}
    for (i, j), ls in tiles.items():
        ls = sorted(encode(c, q) for c, q in ls)
        bundles.setdefault((i // BI, j // BJ), {})[f"{i}_{j}"] = ls
    os.makedirs(os.path.join(out, "osm"), exist_ok=True)
    total, sizes = 0, []
    for (bi, bj), t in sorted(bundles.items()):
        body = json.dumps({"t": dict(sorted(t.items()))}, separators=(",", ":"))
        with open(os.path.join(out, "osm", f"b{bi}_{bj}.json"), "w", encoding="utf-8") as f:
            f.write(body)
        total += len(body); sizes.append(len(body))
    idx = {"v": 2, "src": "© OpenStreetMap-Mitwirkende, ODbL", "stand": stand,
           "unit": [QA, QO], "origin": [LA0, LO0], "cell": [CLAT, CLNG], "bundle": [BI, BJ],
           "bundles": [f"{bi}_{bj}" for bi, bj in sorted(bundles)],
           "cls": {"0": "Fluss/Kanal", "1": "Autobahn", "2": "Kraftfahrstraße", "3": "Bundesstraße",
                   "4": "Landesstraße", "5": "Kreisstraße"}}
    with open(os.path.join(out, "osm", "index.json"), "w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False, separators=(",", ":"))
    sizes.sort()
    log(f"fertig: {len(bundles)} Pakete, {len(tiles)} Kacheln, {total / 1e6:.1f} MB, "
        f"größtes Paket {sizes[-1] / 1e3:.0f} KB, Median {sizes[len(sizes) // 2] / 1e3:.0f} KB")


if __name__ == "__main__":
    main()
