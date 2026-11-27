#!/usr/bin/env python3
"""
Ink in water -> murmuration -> floating-island silhouette -> bloom -> sign.
Everything (simulation, rendering, sound) is generated in code. numpy + Pillow + ffmpeg.

  python3 ink_film.py all            # sim + render + audio + mux  -> out/ink_birthday.mp4
  python3 ink_film.py test 60 130    # render only those frames to PNG for a look
"""
import os, sys, math, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from multiprocessing import Pool

W, H, FPS, DUR = 1280, 720, 24, 10.0
NFR = int(FPS * DUR)
SUB = 2
HERE = os.path.dirname(os.path.abspath(__file__))
SCR = os.environ.get("INK_SCRATCH", os.path.join(HERE, ".scratch"))
OUT = os.path.join(HERE, "out")
os.makedirs(SCR, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
GREETING = ("Happy Birthday", "Sean!")

# ---- timeline (seconds) -------------------------------------------------
T_FLOCK, T_RESOLVE0, T_RESOLVE1 = 2.0, 4.0, 5.0
T_BURST, T_TEXT = 6.5, 7.35


def ss(a, b, x):
    x = np.clip((np.asarray(x, dtype=np.float64) - a) / (b - a), 0, 1)
    return x * x * (3 - 2 * x)


# ---- silhouette & sign masks -------------------------------------------
CW, CH, UNIT = 1536, 864, 432.0


def w2c(x, y):
    return ((x + 1.78) * UNIT, (1 - y) * UNIT)


def build_masks():
    rr = np.random.default_rng(11)
    lab = Image.new("L", (CW, CH), 0)
    d = ImageDraw.Draw(lab)

    def poly(pts, v):
        d.polygon([w2c(*p) for p in pts], fill=v)

    def line(p, q, wd, v):
        d.line([w2c(*p), w2c(*q)], fill=v, width=max(1, int(wd * UNIT)))

    def dot(p, r, v):
        x, y = w2c(*p)
        d.ellipse([x - r * UNIT, y - r * UNIT, x + r * UNIT, y + r * UNIT], fill=v)

    def island(cx, ytop, hw, depth, v, flora=True):
        n = 14
        xs = np.linspace(cx - hw, cx + hw, n)
        top = [(x, ytop + 0.018 * math.sin(i * 1.7 + cx * 9) + 0.012 * rr.standard_normal()) for i, x in enumerate(xs)]
        bot = []
        for k in range(1, 9):
            s = k / 9.0
            x = cx + hw * (1 - s * 0.95) * (1 if k % 2 else 1)
            bot.append((cx + hw * (1 - 2 * s) * (1 - 0.85 * s * s) * 0 + hw * (1 - s * 1.0) * 0.0, 0))
        # underside: jagged taper to a tip
        under = [(cx + hw, ytop - 0.01)]
        for k in range(1, 7):
            s = k / 7.0
            under.append((cx + hw * (1 - s) * 0.95 + 0.02 * rr.standard_normal() * (1 - s), ytop - depth * (s ** 0.8) * 0.95))
        tip = (cx + 0.02 * rr.standard_normal(), ytop - depth)
        under2 = []
        for k in range(6, 0, -1):
            s = k / 7.0
            under2.append((cx - hw * (1 - s) * 0.95 + 0.02 * rr.standard_normal() * (1 - s), ytop - depth * (s ** 0.8) * 0.95))
        poly(top[::-1] + under + [tip] + under2 + [(cx - hw, ytop - 0.01)], v)
        if flora:
            for x, y in top[1:-1:2]:  # glow-flora bumps on top
                dot((x, y + 0.012), 0.010 + 0.006 * rr.random(), v)
            for j in range(3):  # hanging vines
                x = cx + hw * (rr.random() * 1.2 - 0.6)
                ln = depth * (0.5 + 0.7 * rr.random()) * 0.6
                line((x, ytop - 0.04), (x + 0.02 * rr.standard_normal(), ytop - 0.04 - ln), 0.006, v)
                dot((x, ytop - 0.04 - ln), 0.009, v)

    # main island with a precipice on the right
    top = [(-0.80, -0.16), (-0.62, -0.07), (-0.42, -0.05), (-0.22, -0.07), (-0.02, -0.05), (0.14, -0.065),
           (0.28, -0.06), (0.36, -0.09), (0.40, -0.17), (0.34, -0.26)]
    under = [(0.30, -0.36), (0.22, -0.42), (0.16, -0.52), (0.06, -0.58), (-0.02, -0.70), (-0.10, -0.60),
             (-0.22, -0.55), (-0.30, -0.44), (-0.45, -0.38), (-0.58, -0.32), (-0.70, -0.25)]
    poly(top + under, 1)
    for x in np.linspace(-0.7, 0.3, 12):  # luminous flora on the main island
        dot((x, -0.06 + 0.018 * math.sin(x * 11) + 0.014), 0.011 + 0.007 * rr.random(), 1)
    for x, ln in ((-0.5, 0.25), (-0.3, 0.18), (-0.12, 0.3), (0.1, 0.2)):
        line((x, -0.3), (x + 0.02, -0.3 - ln), 0.007, 1)
        dot((x + 0.02, -0.3 - ln), 0.012, 1)
    # other islands
    for i, (cx, yt, hw, dp) in enumerate([(-1.18, 0.32, 0.24, 0.20), (-0.62, 0.55, 0.12, 0.10),
                                           (1.33, 0.30, 0.15, 0.13), (0.98, -0.34, 0.22, 0.20),
                                           (-1.38, -0.30, 0.14, 0.12), (-0.12, 0.66, 0.07, 0.06),
                                           (0.55, -0.72, 0.16, 0.12), (-0.95, -0.72, 0.10, 0.08)]):
        island(cx, yt, hw, dp, 3 + i)
    # the lone figure (label 2): cloak, head, hood tip, staff
    fx, fy = 0.19, -0.060
    for p, q, wd in (((fx - .010, fy), (fx - .010, fy + .13), .020), ((fx + .012, fy), (fx + .012, fy + .13), .020),
                     ((fx + .085, fy - .01), (fx + .095, fy + .335), .008), ((fx + .028, fy + .205), (fx + .088, fy + .245), .013)):
        line(p, q, wd, 2)
    poly([(fx - .040, fy + .235), (fx + .030, fy + .240), (fx + .050, fy + .060), (fx + .020, fy + .040),
          (fx - .085, fy + .030), (fx - .060, fy + .120)], 2)
    dot((fx + .004, fy + .272), .026, 2)
    poly([(fx - .020, fy + .285), (fx - .062, fy + .262), (fx - .020, fy + .252)], 2)
    dot((fx + .095, fy + .338), .011, 2)

    lab = np.array(lab)

    # sign mask
    try:
        fp = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
        ImageFont.truetype(fp, 20)
    except Exception:
        fp = None
    tm = Image.new("L", (CW, CH), 0)
    td = ImageDraw.Draw(tm)

    def fit(txt, width_u):
        size = 100
        for _ in range(6):
            f = ImageFont.truetype(fp, size) if fp else ImageFont.load_default()
            bb = td.textbbox((0, 0), txt, font=f)
            size = int(size * width_u * UNIT / max(1, bb[2] - bb[0]))
        f = ImageFont.truetype(fp, size) if fp else ImageFont.load_default()
        return f, td.textbbox((0, 0), txt, font=f)

    f1, b1 = fit(GREETING[0], 2.35)
    f2, b2 = fit(GREETING[1], 1.45)
    h1, h2 = b1[3] - b1[1], b2[3] - b2[1]
    gap = 0.12 * UNIT
    top_y = CH / 2 - (h1 + h2 + gap) / 2 - 0.02 * UNIT
    td.text((CW / 2 - (b1[2] + b1[0]) / 2, top_y - b1[1]), GREETING[0], font=f1, fill=255)
    td.text((CW / 2 - (b2[2] + b2[0]) / 2, top_y + h1 + gap - b2[1]), GREETING[1], font=f2, fill=255)
    return lab, np.array(tm)


def c2w(px, py):
    return np.stack([px / UNIT - 1.78, 1 - py / UNIT], -1).astype(np.float32)


# ---- flow ------------------------------------------------------------------
class Curl:
    def __init__(self, seed=3):
        r = np.random.default_rng(seed)
        ks, A, om, ph = [], [], [], []
        for o in range(7):
            f = 3.0 * 2.2 ** o
            for _ in range(3):
                th = r.uniform(0, 2 * np.pi)
                ks.append((f * np.cos(th), f * np.sin(th)))
                A.append(0.17 * (f / 3.0) ** -0.42 / f)
                om.append(r.uniform(-0.6, 0.6) * (1 + o * 0.3))
                ph.append(r.uniform(0, 6.28))
        self.k = np.array(ks, np.float32)
        self.A = np.array(A, np.float32)
        self.om = np.array(om, np.float32)
        self.ph = np.array(ph, np.float32)

    def __call__(self, P, t):
        x, y = P[:, 0], P[:, 1]
        u = np.zeros_like(x)
        v = np.zeros_like(x)
        for k, a, o, p in zip(self.k, self.A, self.om, self.ph):
            c = np.cos(k[0] * x + k[1] * y + o * t + p) * a
            u += k[1] * c
            v -= k[0] * c
        return np.stack([u, v], 1)


PLUMES = [dict(t0=0.10, x0=-0.17, y0=0.30, G=0.19),   # black
          dict(t0=0.55, x0=0.30, y0=0.34, G=0.16),    # deep blue
          dict(t0=0.95, x0=0.07, y0=0.42, G=0.125)]   # the one gold plume
HG = 480


def head_tracks():
    out = []
    g = np.arange(0, DUR * HG + 2) / HG
    for p in PLUMES:
        age = np.clip(g - p["t0"], 0, None)
        a = 0.05 + 0.04 * np.sqrt(age)
        G = p["G"] * np.exp(-age / 2.5)
        U = G / (4 * np.pi * a) * (g >= p["t0"])
        hy = p["y0"] - np.cumsum(U) / HG
        hx = p["x0"] + 0.03 * np.sin(0.9 * g + p["x0"] * 5)
        out.append((hx, hy, a, G))
    return out


def swarm_path():
    wp = [(0.0, (1.9, 0.30)), (2.0, (1.8, 0.30)), (2.8, (0.7, -0.28)), (3.5, (-1.25, 0.22)),
          (4.2, (-0.55, 0.42)), (4.9, (0.05, 0.08)), (10.0, (0.0, 0.08))]
    g = np.arange(0, DUR * HG + 2) / HG
    xs = np.interp(g, [a for a, _ in wp], [b[0] for _, b in wp])
    ys = np.interp(g, [a for a, _ in wp], [b[1] for _, b in wp])
    k = np.ones(int(0.7 * HG)) / int(0.7 * HG)
    pad = len(k)
    sm = lambda v: np.convolve(np.pad(v, pad, mode="edge"), k, "same")[pad:-pad]
    return sm(xs), sm(ys)


# ---- simulation ------------------------------------------------------------
def simulate():
    rr = np.random.default_rng(5)
    lab, tmask = build_masks()
    fig_i = np.flatnonzero((lab == 2).ravel())
    main_i = np.flatnonzero((lab == 1).ravel())
    oth_i = np.flatnonzero((lab >= 3).ravel())
    n_fig, n_main, n_oth, n_gal, n_scarf = 10000, 30000, 20000, 12000, 4000
    Ns = n_fig + n_main + n_oth
    Nf = Ns + n_gal + n_scarf
    n_ink = (18000, 18000, 16000)
    N = Nf + sum(n_ink)

    def pick(idx, n):
        s = rr.choice(idx, n)
        py, px = np.divmod(s, CW)
        return c2w(px + rr.random(n) - 0.5, py + rr.random(n) - 0.5), lab.ravel()[s]

    sp = []
    sl = []
    for idx, n in ((fig_i, n_fig), (main_i, n_main), (oth_i, n_oth)):
        p, l = pick(idx, n)
        sp.append(p)
        sl.append(l)
    S0 = np.concatenate(sp)
    SL = np.concatenate(sl)
    bob_amp = np.array([0, .006, .004] + [rr.uniform(.008, .016) for _ in range(8)] + [0] * 3, np.float32)
    bob_ph = np.array([0, 0, 0] + list(rr.uniform(0, 6.28, 8)) + [0] * 3, np.float32)
    tidx = np.flatnonzero(tmask.ravel() > 100)
    tp, _ = pick(tidx, Nf)
    # galaxy
    gr = 0.34 * rr.random(n_gal) ** 0.65
    garm = rr.integers(0, 2, n_gal) * np.pi
    gth0 = 5.2 * gr / 0.34 + garm + rr.standard_normal(n_gal) * 0.32 * (1 - 0.5 * gr / 0.34)
    gcen = np.array([0.74, 0.43], np.float32)
    # scarf
    ss_s = rr.random(n_scarf) ** 0.8
    ss_w = rr.uniform(-1, 1, n_scarf)
    fx, fy = 0.19, -0.060
    # swarm frame
    su = np.clip(rr.standard_normal(Nf), -2.6, 2.6).astype(np.float32)
    sv = np.clip(rr.standard_normal(Nf), -2.6, 2.6).astype(np.float32)
    jph = rr.uniform(0, 6.28, (Nf, 2)).astype(np.float32)
    rate = (3.0 + 4.0 * rr.random(Nf)).astype(np.float32)
    swx, swy = swarm_path()

    def swarm(t):
        i = int(t * HG)
        c = np.array([swx[i], swy[i]], np.float32)
        phi = 0.15 + 0.25 * np.sin(1.6 * t)
        lx = 0.4 * (1 + 0.35 * np.sin(3 * t))
        ly = 0.10 * (1 + 0.5 * np.cos(2 * t))
        ox = su * lx
        oy = sv * ly + 0.2 * np.sin(2.6 * su - 5 * t) * (1 + 0.2 * sv)
        cs, sn = np.cos(phi), np.sin(phi)
        return np.stack([c[0] + cs * ox - sn * oy, c[1] + sn * ox + cs * oy], 1)

    def silhouette(t):
        b = bob_amp[SL] * np.sin(1.1 * t + bob_ph[SL])
        st = S0 + np.stack([0.003 * np.sin(2.3 * t + SL), b], 1)
        rot = 0.45 * (t - 5.0) + 0.0
        th = gth0 + rot
        gx = gr * np.cos(th)
        gy = gr * np.sin(th) * 0.6
        a = 0.45
        ga = gcen + np.stack([gx * np.cos(a) - gy * np.sin(a), gx * np.sin(a) + gy * np.cos(a)], 1)
        bb = bob_amp[2] * np.sin(1.1 * t)
        ax, ay = fx - 0.004, fy + 0.235 + bb
        sx = ax - 0.44 * ss_s
        sy = ay + 0.03 * ss_s + 0.04 * ss_s * np.sin(7 * ss_s - 8 * t) + 0.012 * np.sin(13 * ss_s - 5 * t) + ss_w * 0.011 * (1 - 0.6 * ss_s)
        sc = np.stack([sx, sy], 1)
        return np.concatenate([st, ga, sc]).astype(np.float32)

    def text(t):
        wv = 0.006 * ss(7.8, 8.6, t)
        return tp + np.stack([0.002 * np.sin(5 * t + jph[:, 0]), wv * np.sin(9 * tp[:, 0] - 3 * t) + 0.002 * np.sin(4 * t + jph[:, 1])], 1)

    # particles
    pid = np.concatenate([rr.choice([0, 1], Nf, p=[0.8, 0.2]), np.repeat([0, 1, 2], n_ink)])
    heads = head_tracks()
    t0s = np.array([p["t0"] for p in PLUMES])
    birth = t0s[pid] + np.where(np.arange(N) < Nf, rr.random(N) * 1.2, rr.random(N) * 1.6)
    P = np.zeros((N, 2), np.float32)
    for k in range(3):
        m = pid == k
        gi = np.clip((birth[m] * HG).astype(int), 0, len(heads[k][0]) - 1)
        a = heads[k][2][gi]
        P[m, 0] = heads[k][0][gi] + rr.standard_normal(m.sum()) * a * 0.35
        P[m, 1] = heads[k][1][gi] + rr.standard_normal(m.sum()) * 0.012
    V = np.zeros((N, 2), np.float32)
    curl = Curl()
    pidx = [np.flatnonzero(pid == k) for k in range(3)]
    traj = np.zeros((NFR + 1, N, 2), np.float32)
    traj[0] = P
    dt = 1.0 / FPS / SUB
    kicked = False
    for step in range(NFR * SUB):
        t = step * dt
        born = birth <= t
        vel = curl(P, t) * 1.0
        for k in range(3):
            hx, hy, a, G = heads[k]
            i = int(t * HG)
            if t >= PLUMES[k]["t0"]:
                ix = pidx[k]
                rx0 = P[ix]
                vel[ix] += dipole(rx0, hx[i], hy[i], a[i], G[i])
        # tracking of the flock
        w = float(ss(T_FLOCK, T_FLOCK + 0.5, t) * (1 - ss(T_BURST, T_BURST + 0.2, t)) + ss(T_TEXT, T_TEXT + 0.35, t))
        w = min(w, 1.0)
        if t >= T_BURST and not kicked:
            kicked = True
            c = np.array([0.1, 0.1], np.float32)
            dd = P - c
            nrm = np.linalg.norm(dd, axis=1, keepdims=True) + 1e-3
            hat = dd / nrm
            perp = np.stack([-hat[:, 1], hat[:, 0]], 1)
            V += hat * rr.uniform(0.15, 0.65, (N, 1)).astype(np.float32) + perp * rr.uniform(-0.25, 0.25, (N, 1)).astype(np.float32)
        if w > 0:
            if t < T_BURST:
                s1 = float(ss(T_RESOLVE0, T_RESOLVE1, t))
                T = (1 - s1) * swarm(t) + s1 * silhouette(t)
            else:
                T = text(t)
            Pf = P[:Nf]
            d = T - Pf
            dn = np.linalg.norm(d, axis=1, keepdims=True)
            th = (0.55 * np.tanh(dn * 3.0)) * (1.0 - float(ss(T_RESOLVE0, T_RESOLVE1 + 0.3, t)) * (t < T_BURST))
            if t >= T_TEXT:
                th = th * 0.6
            cs, sn = np.cos(th), np.sin(th)
            dr = np.concatenate([cs * d[:, :1] - sn * d[:, 1:], sn * d[:, :1] + cs * d[:, 1:]], 1)
            boost = 1.0 + 3.0 * float(ss(T_RESOLVE0, T_RESOLVE1, t)) * (t < T_BURST)
            vel[:Nf] = vel[:Nf] * (1 - 0.8 * w) + dr * (rate * w * boost)[:, None]
            if t >= T_BURST:  # hold the sign firmly once it has gathered
                P[:Nf] = np.where(dn < 0.0004, T, P[:Nf])
        move = (vel + V) * dt
        P[born] += move[born]
        V *= math.exp(-2.2 * dt)
        if (step + 1) % SUB == 0:
            traj[(step + 1) // SUB] = P
    np.save(os.path.join(SCR, "traj.npy"), traj)
    meta = dict(N=N, Nf=Nf, pid=pid, birth=birth, SL=SL)
    # flora = subset of static particles near the top edge of their shape
    lab_r = lab
    flora = []
    for j in range(Ns):
        if len(flora) > 420:
            break
        c = (S0[j][0] + 1.78) * UNIT
        r_ = (1 - S0[j][1]) * UNIT
        ci, ri = int(c), int(r_)
        if 12 < ri < CH - 2 and lab_r[ri, ci] != 2 and lab_r[ri - 9, ci] == 0 and lab_r[ri, ci] > 0 and rr.random() < 0.05:
            flora.append(j)
    meta["flora"] = np.array(flora)
    np.savez(os.path.join(SCR, "meta.npz"), **meta)
    print("sim done", N, "particles", len(flora), "flora")


def dipole(P, hx, hy, a, G):
    eps2 = (0.55 * a) ** 2
    out = np.zeros_like(P)
    for sgn, cx in ((1, hx + a), (-1, hx - a)):
        rx = P[:, 0] - cx
        ry = P[:, 1] - hy
        r2 = rx * rx + ry * ry + 1e-9
        f = sgn * G / (2 * np.pi) * (1 - np.exp(-r2 / eps2)) / r2
        out[:, 0] += -ry * f
        out[:, 1] += rx * f
    return out


# ---- rendering -------------------------------------------------------------
def box_blur(img, sigma):
    """3-pass box approximation of a gaussian, img (C,H,W) float32."""
    if sigma < 0.45:
        return img
    wd = int(round(math.sqrt(12 * sigma * sigma / 3 + 1)))
    wd = max(1, wd | 1)
    r = wd // 2
    out = img
    for ax in (1, 2):
        for _ in range(3):
            pad = [(0, 0)] * 3
            pad[ax] = (r + 1, r)
            p = np.pad(out, pad, mode="edge")
            c = np.cumsum(p, axis=ax, dtype=np.float32)
            n = out.shape[ax]
            sl = lambda a, b: tuple(slice(a, b) if i == ax else slice(None) for i in range(3))
            out = (c[sl(wd, wd + n)] - c[sl(0, n)]) / wd
    return out


KABS = np.array([[1.55, 1.55, 1.45],    # black
                 [2.7, 1.8, 0.55],      # deep blue
                 [0.05, 0.38, 2.4]], np.float32)   # gold (absorbs blue)

_G = {}


def load():
    if _G:
        return _G
    _G["traj"] = np.load(os.path.join(SCR, "traj.npy"), mmap_mode="r")
    m = np.load(os.path.join(SCR, "meta.npz"))
    _G.update({k: m[k] for k in m.files})
    r = np.random.default_rng(2)
    nn = 320
    _G["near"] = dict(x=r.uniform(-2.4, 2.4, nn), y=r.uniform(-1.3, 1.3, nn), vx=r.uniform(-.05, .05, nn),
                      vy=r.uniform(-.03, .06, nn), ch=r.choice(3, nn, p=[.55, .4, .05]), a=r.uniform(.3, .9, nn))
    n = r.standard_normal((1, H // 4, W // 4)).astype(np.float32)
    tex = np.kron(box_blur(n, 1.5)[0], np.ones((4, 4), np.float32))[:H, :W]
    fib = box_blur(r.standard_normal((1, H, W)).astype(np.float32), 0.8)[0]
    fib = box_blur(fib[None], 1.0)[0]
    _G["paper"] = (1 + 0.035 * tex / (tex.std() + 1e-6) * 0.5 + 0.02 * fib / (fib.std() + 1e-6) * 0.5).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    _G["xx"], _G["yy"] = xx, yy
    rx = (xx - W / 2) / (W / 2)
    ry = (yy - H / 2) / (H / 2)
    _G["r2"] = (rx * rx * 0.7 + ry * ry * 0.9).astype(np.float32)
    return _G


def camera(t):
    z = 1.15 + 1.25 * (1 - ss(0, 5.2, t)) ** 1.6 if t < 5.2 else 1.15 - 0.07 * (t - 5.2) / 4.8
    cx = 0.12 * ss(1.0, 5.0, t) * (1 - ss(T_TEXT, 9.0, t)) + 0.03 * math.sin(0.7 * t)
    cy = 0.04 + 0.05 * ss(0.5, 4.0, t) * (1 - ss(T_TEXT, 9.0, t)) + 0.02 * math.cos(0.5 * t)
    return z, cx, cy


def splat(acc, sx, sy, wgt, ch):
    x0 = np.floor(sx).astype(np.int32)
    y0 = np.floor(sy).astype(np.int32)
    fx = sx - x0
    fy = sy - y0
    for dx, dy, ww in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
        xi = x0 + dx
        yi = y0 + dy
        ok = (xi >= 0) & (xi < W) & (yi >= 0) & (yi < H)
        idx = yi[ok] * W + xi[ok]
        wv = (ww * wgt)[ok]
        cc = ch[ok]
        for c in range(3):
            m = cc == c
            if m.any():
                acc[c] += np.bincount(idx[m], weights=wv[m], minlength=W * H).astype(np.float32).reshape(H, W) if False else \
                    np.bincount(idx[m], weights=wv[m], minlength=W * H).reshape(H, W).astype(np.float32)


def sample_bilinear(img, qx, qy):
    qx = np.clip(qx, 0, W - 1.001)
    qy = np.clip(qy, 0, H - 1.001)
    x0 = qx.astype(np.int32)
    y0 = qy.astype(np.int32)
    fx = qx - x0
    fy = qy - y0
    out = np.empty_like(img)
    for c in range(img.shape[0]):
        a = img[c]
        out[c] = (a[y0, x0] * (1 - fx) * (1 - fy) + a[y0, x0 + 1] * fx * (1 - fy) +
                  a[y0 + 1, x0] * (1 - fx) * fy + a[y0 + 1, x0 + 1] * fx * fy)
    return out


def render(fi, save_png=None):
    G = load()
    t = fi / FPS
    traj = G["traj"]
    cur = np.asarray(traj[fi])
    prev = np.asarray(traj[max(fi - 1, 0)])
    N, Nf = int(G["N"]), int(G["Nf"])
    pid, birth = G["pid"], G["birth"]
    z, cx, cy = camera(t)
    S = H / 2 * z
    # per-particle alpha
    vis = np.clip((t - birth) / 0.1, 0, 1).astype(np.float32)
    zc = (0.35 + 0.65 * (z / 2.4) ** 1.5)
    ink_a = 0.62 * zc
    af = 0.9 + 3.0 * float(ss(4.2, 5.0, t)) * (1 - float(ss(T_BURST, T_BURST + 0.3, t))) + 1.9 * float(ss(T_TEXT, T_TEXT + 0.8, t))
    base = np.full(N, ink_a, np.float32)
    base[:Nf] = ink_a * (1 + 0.6 * float(ss(1.8, 3.0, t))) * af / 0.9
    base[pid == 2] *= 0.9
    base[Nf:] *= 1 - 0.7 * float(ss(4.4, 5.4, t) * (1 - ss(T_BURST - 0.2, T_BURST + 0.3, t)) + ss(T_TEXT, T_TEXT + 0.6, t))
    wl1 = float(np.clip(ss(T_FLOCK, T_FLOCK + 1.2, t) * (1 - ss(T_BURST, T_BURST + 0.4, t)) + ss(T_TEXT, T_TEXT + 0.4, t), 0, 1))
    bl = float(ss(T_BURST, T_BURST + 0.4, t) * (1 - ss(T_TEXT - 0.1, T_TEXT + 0.6, t)))
    # layer weights per particle: 0 ink, 1 subject, 2 bloom
    lw = np.zeros((3, N), np.float32)
    lw[0] = 1.0
    lw[1, :Nf] = wl1
    lw[0, :Nf] = (1 - wl1) * (1 - bl)
    lw[2, :Nf] = (1 - wl1) * bl + 0 * bl
    lw[1, :Nf] *= (1 - bl)
    lw[2, :Nf] += wl1 * bl
    lw[2, Nf:] = 0.65 * bl
    lw[0, Nf:] = 1 - lw[2, Nf:]
    layers = np.zeros((4, 3, H, W), np.float32)
    ns = 3
    for s in (0.7, 0.85, 1.0):
        p = prev + (cur - prev) * s
        sx = (p[:, 0] - cx) * S + W / 2
        sy = H / 2 - (p[:, 1] - cy) * S
        ok = (vis > 0) & (sx > -3) & (sx < W + 3) & (sy > -3) & (sy < H + 3)
        ii = np.flatnonzero(ok)
        for L in (0, 1, 2):
            wv = (base[ii] * vis[ii] * lw[L][ii] / ns).astype(np.float32)
            k = wv > 1e-4
            splat(layers[L], sx[ii][k].astype(np.float32), sy[ii][k].astype(np.float32), wv[k], pid[ii][k] if False else _chan(pid[ii][k]))
    # near bokeh specks
    nr = G["near"]
    nvis = (1 - float(ss(3.8, 5.0, t))) + 0.8 * float(ss(T_BURST, T_BURST + 0.4, t)) * (1 - float(ss(T_TEXT + 0.2, T_TEXT + 0.9, t)))
    if nvis > 0.01:
        zn = 1.15 * z ** 0.6
        nx = (nr["x"] + nr["vx"] * t - 1.5 * cx) * H / 2 * zn + W / 2
        ny = H / 2 - (nr["y"] + nr["vy"] * t - 1.5 * cy) * H / 2 * zn
        k = (nx > -30) & (nx < W + 30) & (ny > -30) & (ny < H + 30)
        splat(layers[3], nx[k].astype(np.float32), ny[k].astype(np.float32),
              (nr["a"][k] * 55 * nvis).astype(np.float32), nr["ch"][k].astype(np.int32))
    f = float(ss(2.5, 3.3, t) * (1 - ss(T_BURST - 0.1, T_BURST + 0.4, t)) + ss(T_TEXT + 0.1, T_TEXT + 0.9, t))
    f = min(f, 1.0)
    sig = [0.7 + 7.5 * abs(f - 0), 0.6 + 7.5 * abs(f - 1), 5.5 + 7.5 * abs(f - 0), 4.0 + 10 * abs(f + 0.8)]
    D = np.zeros((3, H, W), np.float32)
    for L in range(4):
        D += box_blur(layers[L], sig[L])
    # absorption -> transmittance
    tau = np.einsum("cr,chw->rhw", KABS, D)
    Tr = np.exp(-tau)
    r2 = G["r2"]
    glow = np.exp(-r2 * 0.9)
    paper = np.array([0.995, 0.975, 0.915], np.float32)[:, None, None] * (0.9 + 0.2 * glow)[None] * G["paper"][None]
    img = paper * Tr
    # bioluminescent flora: pale luminous specks on the silhouette
    fl = G["flora"]
    fw = float(ss(4.8, 5.5, t) * (1 - ss(T_BURST, T_BURST + 0.3, t)))
    if fw > 0.01 and len(fl):
        p = cur[fl]
        sx = ((p[:, 0] - cx) * S + W / 2).astype(np.float32)
        sy = (H / 2 - (p[:, 1] - cy) * S).astype(np.float32)
        pul = 0.55 + 0.45 * np.sin(2.6 * t + fl * 0.37)
        gl = np.zeros((3, H, W), np.float32)
        splat(gl, sx, sy, (4.0 * pul * fw).astype(np.float32), np.zeros(len(fl), np.int32))
        g1 = gl[0:1]
        core = box_blur(g1, 1.6)[0]
        halo = box_blur(g1, 7.0)[0]
        col = np.array([0.55, 0.95, 1.0], np.float32)[:, None, None]
        img = img + col * (core * 1.0 + halo * 2.2)[None] * (0.4 + 0.6 * (1 - Tr.mean(0)))[None]
    # soft light wrap (backlit paper)
    img = 0.9 * img + 0.1 * box_blur(img, 7.0)
    # water refraction
    xx, yy = G["xx"], G["yy"]
    dx = 1.8 * np.sin(0.013 * xx + 0.021 * yy + 1.1 * t) + 1.1 * np.sin(0.034 * yy - 0.9 * t + 1.0)
    dy = 1.6 * np.sin(0.017 * yy - 0.019 * xx + 0.8 * t) + 1.0 * np.sin(0.029 * xx + 1.3 * t)
    img = sample_bilinear(img, xx + dx, yy + dy)
    # caustic shimmer
    wx = xx + 14 * np.sin(0.011 * yy + 0.7 * t)
    wy = yy + 14 * np.sin(0.013 * xx - 0.6 * t)
    gsum = np.sin(0.045 * wx + 0.03 * wy + 0.9 * t) + np.sin(0.037 * wy - 0.05 * wx - 0.7 * t + 2) + np.sin(0.06 * wx + 0.021 * wy + 0.5 * t + 4)
    caus = np.clip(1 - np.abs(gsum) * 0.8, 0, 1) ** 4
    img = img * (1 + 0.035 * box_blur(caus[None], 1.2)[0] - 0.01)[None]
    # warm vignette + grain
    vg = np.clip(1 - 0.24 * r2 ** 1.3, 0, 1)
    tint = np.stack([np.ones_like(r2), 1 - 0.03 * r2, 1 - 0.10 * r2])
    img = img * vg[None] * tint
    rng = np.random.default_rng(1000 + fi)
    img = img + rng.standard_normal((1, H, W)).astype(np.float32) * 0.016 + rng.standard_normal((3, H, W)).astype(np.float32) * 0.006
    fade = 1 - 0.0 * t
    img = np.clip(img, 0, 1) ** (1 / 1.04)
    out = (img * 255 + 0.5).astype(np.uint8).transpose(1, 2, 0)
    if save_png:
        Image.fromarray(out).save(save_png)
        return None
    return out.tobytes()


def _chan(pid):
    return pid.astype(np.int32)


# ---- sound -----------------------------------------------------------------
SR = 44100


def make_audio(path):
    n = int(SR * DUR)
    rr = np.random.default_rng(9)
    tt = np.arange(n) / SR
    L = np.zeros(n)
    R = np.zeros(n)

    def put(sig, t0, pan=0.0, g=1.0):
        i0 = int(t0 * SR)
        if i0 >= n:
            return
        s = sig[: n - i0]
        gl = g * math.cos((pan + 1) * math.pi / 4)
        gr = g * math.sin((pan + 1) * math.pi / 4)
        L[i0:i0 + len(s)] += s * gl
        R[i0:i0 + len(s)] += s * gr

    def bandnoise(m, lo, hi):
        sp = np.fft.rfft(rr.standard_normal(m))
        fr = np.fft.rfftfreq(m, 1 / SR)
        mk = np.exp(-((np.log(np.maximum(fr, 1) / math.sqrt(lo * hi))) ** 2) / (2 * (0.5 * math.log(hi / lo)) ** 2))
        x = np.fft.irfft(sp * mk, m)
        return x / (np.abs(x).max() + 1e-9)

    def plip(f0, dur=0.22, up=3.0):
        m = int(dur * SR)
        t = np.arange(m) / SR
        f = f0 * (1 + up * t / 0.08) / (1 + 0 * t)
        ph = 2 * np.pi * np.cumsum(f) / SR
        env = np.exp(-t / 0.045) * np.minimum(1, t / 0.002)
        return np.sin(ph) * env * 0.6 + np.sin(ph * 0.5) * np.exp(-t / 0.09) * 0.25

    def pluck(f, dur=1.6):
        m = int(dur * SR)
        t = np.arange(m) / SR
        s = np.zeros(m)
        for h in range(1, 9):
            fh = f * h * (1 + 0.0006 * h * h)
            s += np.sin(2 * np.pi * fh * t + h) / h ** 1.15 * np.exp(-t * (2.2 + 1.6 * h))
        s += bandnoise(m, 1500, 5000) * np.exp(-t / 0.01) * 0.25
        return s * np.minimum(1, t / 0.002) * 0.5

    def bell(f, dur=2.6):
        m = int(dur * SR)
        t = np.arange(m) / SR
        s = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.9) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.35) + 0.25 * np.sin(2 * np.pi * f * 4.1 * t) * np.exp(-t / 0.2)
        return s * 0.3

    hz = lambda midi: 440 * 2 ** ((midi - 69) / 12)
    # drone: D major, third arrives with the reveal
    drone = np.zeros(n)
    for f, g, onset in ((73.42, 1.0, 0.0), (110.0, 0.6, 0.0), (146.83, 0.45, 0.4), (185.0, 0.28, 4.7), (220.0, 0.2, 4.7)):
        for dt in (-0.35, 0.0, 0.4):
            ff = f + dt
            osc = sum(np.sin(2 * np.pi * ff * h * tt + h) / h ** 1.5 for h in range(1, 5))
            drone += osc * g * ss(onset, onset + 1.2, tt) * (0.85 + 0.15 * np.sin(2 * np.pi * 0.17 * tt + f))
    drone *= 0.034
    L += drone
    R += drone * np.roll(np.ones(n), 0)
    # water bed
    bed = bandnoise(n, 120, 900) * (0.02 + 0.015 * np.sin(2 * np.pi * 0.31 * tt) ** 2)
    put(bed, 0, 0, 1.0)
    # the drops (black, blue, gold)
    for t0, f0, pan in ((0.10, 380, -0.3), (0.55, 460, 0.35), (0.95, 560, 0.0)):
        put(plip(f0), t0, pan, 0.9)
        put(plip(f0 * 0.5, 0.35, 2.0), t0 + 0.04, pan, 0.5)
        m = int(0.7 * SR)
        sw = bandnoise(m, 200, 1400) * np.sin(np.linspace(0, np.pi, m)) ** 2
        put(sw, t0, pan, 0.18)
    put(pluck(hz(69), 2.0), 1.0, 0.0, 0.5)
    put(pluck(hz(78), 2.0), 1.9, -0.2, 0.35)
    put(pluck(hz(74), 2.0), 3.0, 0.3, 0.35)
    # flock: air swell + wing flutters sweeping across
    m = int(3.0 * SR)
    sw = bandnoise(m, 900, 4000) * np.sin(np.linspace(0, np.pi, m)) ** 2
    cxs, _ = swarm_path()
    for chunk in range(0, m, 2205):
        seg = sw[chunk:chunk + 2205]
        tm = 2.0 + chunk / SR
        pan = float(np.tanh(cxs[min(int(tm * HG), len(cxs) - 1)] / 1.4))
        put(seg * np.hanning(len(seg)) ** 0.0, tm, pan, 0.10)
    for tm in np.sort(rr.uniform(2.2, 4.6, 70)):
        pan = float(np.tanh(cxs[int(tm * HG)] / 1.4))
        k = int(0.03 * SR)
        put(bandnoise(k, 1500, 5000) * np.hanning(k), tm, pan, 0.06 * math.sin((tm - 2.0) / 2.6 * math.pi) ** 2 + 0.01)
    # reveal
    for f, dt in ((hz(74), 0), (hz(78), 0.05), (hz(81), 0.1), (hz(86), 0.17)):
        put(bell(f), 4.75 + dt, 0.0, 0.5)
    m = int(0.9 * SR)
    put(bandnoise(m, 2000, 7000) * np.sin(np.linspace(0, np.pi, m)) ** 3, 4.3, 0, 0.08)
    for t0, mid, pan in ((5.5, 78, -0.4), (5.95, 81, 0.3), (6.3, 83, 0.0)):
        put(pluck(hz(mid), 1.8), t0, pan, 0.38)
    # dissolve: rising hush, thump, scattered drops
    m = int(0.5 * SR)
    put(bandnoise(m, 1000, 6000) * np.linspace(0, 1, m) ** 2, 6.0, 0, 0.18)
    t = np.arange(int(0.6 * SR)) / SR
    put(np.sin(2 * np.pi * (90 * np.exp(-t * 5) + 38) * t) * np.exp(-t / 0.2) * 0.9, T_BURST, 0, 0.5)
    for tm in np.sort(rr.uniform(T_BURST + 0.05, T_TEXT + 0.1, 14)):
        put(plip(rr.uniform(500, 1300), 0.2, 2.5), tm, rr.uniform(-.8, .8), rr.uniform(.25, .55))
    # the song: Happy Birthday, sparse plucks on the sign forming
    beat = 0.13
    tune = [(62, .75), (62, .25), (64, 1), (62, 1), (67, 1), (66, 2),
            (62, .75), (62, .25), (64, 1), (62, 1), (69, 1), (67, 2)]
    t0 = 7.45
    for midi, d in tune:
        put(pluck(hz(midi + 12), 1.4), t0, 0.1, 0.46)
        put(pluck(hz(midi), 1.4), t0, -0.1, 0.18)
        t0 += d * beat
    for k, midi in enumerate((50, 57, 62, 66, 69, 74)):
        put(pluck(hz(midi + 12 * (k > 3)), 2.2), 9.35 + 0.03 * k, -0.3 + 0.12 * k, 0.42)
    put(bell(hz(86), 1.5), 9.38, 0.0, 0.5)
    mix = np.stack([L, R], 1)
    mix *= (ss(0, 0.6, tt) * (1 - ss(9.55, 10.0, tt)))[:, None]
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)
    mix *= 0.89 / np.abs(mix).max()
    pcm = (mix * 32767).astype("<i2")
    with wave.open(path, "wb") as wv:
        wv.setnchannels(2)
        wv.setsampwidth(2)
        wv.setframerate(SR)
        wv.writeframes(pcm.tobytes())


# ---- main ------------------------------------------------------------------
def render_all(mp4):
    wav = os.path.join(SCR, "sound.wav")
    make_audio(wav)
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-", "-i", wav, "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", mp4]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    with Pool(4) as pool:
        for i, fr in enumerate(pool.imap(render, range(NFR), chunksize=2)):
            ff.stdin.write(fr)
            if i % 24 == 0:
                print("frame", i, flush=True)
    ff.stdin.close()
    ff.wait()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("sim", "all"):
        simulate()
    if cmd == "test":
        for fi in map(int, sys.argv[2:]):
            render(fi, os.path.join(SCR, f"f{fi:03d}.png"))
            print("wrote", os.path.join(SCR, f"f{fi:03d}.png"))
    if cmd in ("render", "all"):
        render_all(os.path.join(OUT, "ink_birthday.mp4"))
    if cmd == "audio":
        make_audio(os.path.join(SCR, "sound.wav"))
