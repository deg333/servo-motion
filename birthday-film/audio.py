"""Synthesised score + engine sound for the 8 s film -> WAV (stereo, 44.1 kHz).
Pure numpy: no samples, no external audio. 120 bpm, C major.
 0-5 s  bright arpeggios, bass, hats; engine hum rising with the flight
 5-8 s  the "Happy Birthday" tune on bell synth as the sign lights up
usage: python3 audio.py out.wav
"""
import sys
import wave
import numpy as np

SR = 44100
DUR = 8.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
T = np.arange(N) / SR
L = np.zeros(N)
R = np.zeros(N)
BEAT = 0.5


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def place(sig, t0, pan=0.0, gain=1.0):
    i = int(t0 * SR)
    if i >= N:
        return
    n = min(len(sig), N - i)
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    L[i:i + n] += sig[:n] * gain * l
    R[i:i + n] += sig[:n] * gain * r


def env(n, a, d, sus=0.0):
    t = np.arange(n) / SR
    e = np.minimum(t / max(a, 1e-4), 1.0) * (sus + (1 - sus) * np.exp(-t / d))
    return e


def lowpass(x, fc):
    a = np.exp(-2 * np.pi * np.broadcast_to(np.asarray(fc, float), x.shape) / SR)
    y = np.empty_like(x)
    s = 0.0
    for i in range(len(x)):          # one-pole; fine for 8 s
        s = (1 - a[i]) * x[i] + a[i] * s
        y[i] = s
    return y


def pluck(m, dur):
    n = int(SR * dur)
    t = np.arange(n) / SR
    f = hz(m)
    s = sum(np.sin(2 * np.pi * f * k * t) / k for k in (1, 2, 3, 4)) * 0.5
    s += 0.4 * np.sign(np.sin(2 * np.pi * f * t * 1.003)) * np.exp(-t / 0.08)
    return s * env(n, 0.003, 0.16)


def bell(m, dur):
    n = int(SR * dur)
    t = np.arange(n) / SR
    f = hz(m)
    s = (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t / 0.5)
         + 0.35 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t / 0.3)
         + 0.2 * np.sin(2 * np.pi * f * 4.2 * t) * np.exp(-t / 0.15))
    s += 0.25 * np.sin(2 * np.pi * f * 0.5 * t)
    return s * env(n, 0.004, 0.9, 0.18) * np.minimum(1, (dur - t) / 0.08)


def bass(m, dur):
    n = int(SR * dur)
    t = np.arange(n) / SR
    f = hz(m)
    s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t)
    return s * env(n, 0.005, 0.25, 0.3)


def kick():
    n = int(SR * 0.3)
    t = np.arange(n) / SR
    f = 50 + 110 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.11)


def hat():
    n = int(SR * 0.06)
    x = rng.standard_normal(n)
    x = x - np.concatenate([[0], x[:-1]]) * 0.95       # crude high-pass
    return x * np.exp(-np.arange(n) / SR / 0.012)


def pad(ms, t0, dur):
    n = int(SR * dur)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for m in ms:
        for det in (-0.004, 0.004):
            s += np.sin(2 * np.pi * hz(m) * (1 + det) * t)
    return s * np.minimum(t / 0.4, 1) * np.minimum((dur - t) / 0.4, 1) / (2 * len(ms))


# ---- harmony: C | G | F (4-5) | C (5-6.5) | G (6.5-8)
chords = [  # start, end, root(bass), triad, arp pattern
    (0.0, 2.0, 36, [60, 64, 67]),
    (2.0, 4.0, 43, [62, 67, 71]),
    (4.0, 5.0, 41, [60, 65, 69]),
    (5.0, 6.5, 36, [60, 64, 67]),
    (6.5, 8.0, 43, [62, 67, 71]),
]
for a, b, root, tri in chords:
    place(pad([m - 12 for m in tri], a, b - a), a, 0.0, 0.16)
    t = a
    while t < b - 1e-6:                              # bass on the beats
        place(bass(root, BEAT * 0.9), t, 0.0, 0.5)
        t += BEAT

# arpeggio on 8ths for the first 5 s, thinner underneath the tune afterwards
step = BEAT / 2
i = 0
t = 0.0
while t < 8.0:
    for a, b, root, tri in chords:
        if a <= t < b:
            pat = [tri[0], tri[1], tri[2], tri[1] + 12, tri[2], tri[1], tri[0] + 12, tri[1]]
            note = pat[i % 8] + (12 if t < 5 else 0)
            g = 0.30 if t < 5 else 0.15
            place(pluck(note, 0.35), t, -0.5 + 0.5 * ((i % 4) / 3), g)
    t += step
    i += 1

# drums: kick on beats, hats on off-beats, light build
t = 0.0
while t < 8.0:
    place(kick(), t, 0.0, 0.55 if t > 0.4 else 0.0)
    place(hat(), t + BEAT / 2, 0.35, 0.16)
    t += BEAT

# ---- "Happy Birthday" (public domain), starting as the sign appears at 5.0 s
tune = [(67, .75), (67, .25), (69, 1), (67, 1), (72, 1), (71, 2)]   # G G A G C' B
t = 5.0
for k, (m, beats) in enumerate(tune):
    dur = beats * BEAT
    place(bell(m + 12, dur + 0.5 if k == len(tune) - 1 else dur + 0.15), t, 0.1, 0.42)
    place(bell(m, dur + 0.15), t, -0.1, 0.22)
    t += dur
for k, m in enumerate([79, 83, 86, 91, 95]):         # sparkle on the last note
    place(bell(m, 0.5), 7.0 + k * 0.09, -0.4 + 0.2 * k, 0.1)

# ---- engine: sawtooth rumble + filtered noise, pitch and level rising with speed
ramp = 1 + 0.5 * (T / DUR) + 0.25 * np.clip((T - 6) / 1.5, 0, 1)
phase = 2 * np.pi * np.cumsum(58 * ramp) / SR
saw = (2 * ((phase / (2 * np.pi)) % 1) - 1)
rumble = lowpass(saw, 420) * 0.5 + np.sin(phase) * 0.4
wob = 1 + 0.12 * np.sin(2 * np.pi * 13 * T)
noise = rng.standard_normal(N)
hiss = lowpass(noise, 2500) - lowpass(noise, 300)
swirl = 0.6 + 0.4 * np.sin(2 * np.pi * 0.7 * T)
lvl = (0.55 + 0.45 * np.minimum(T / 1.0, 1)) * (1 + 0.5 * np.clip((T - 5.8) / 1.5, 0, 1))
eng = (rumble * wob * 0.75 + hiss * swirl * 0.35) * lvl
# arch fly-throughs: whooshes at the two arches (z=150 and z=300 -> 2.55 s, 5.3 s) + a pass at the reveal
for tt, w in ((2.75, 1.0), (5.45, 1.0), (6.6, 1.3)):
    x = np.exp(-((T - tt) / (0.28 * w)) ** 2)
    wh = (lowpass(noise, 1800 + 3000 * x) - lowpass(noise, 200)) * x * 0.9
    eng += wh
L += eng * 0.5 * (1.0 - 0.15 * np.sin(T * 0.8))
R += eng * 0.5 * (1.0 + 0.15 * np.sin(T * 0.8))

# ---- small room: a few decaying echoes
for d, g in ((0.11, 0.28), (0.19, 0.2), (0.31, 0.14), (0.47, 0.09)):
    k = int(d * SR)
    L2, R2 = L.copy(), R.copy()
    L[k:] += R2[:-k] * g
    R[k:] += L2[:-k] * g

# fades + normalise
fade = np.minimum(T / 0.25, 1) * np.minimum((DUR - T) / 0.35, 1)
L *= fade
R *= fade
peak = max(np.abs(L).max(), np.abs(R).max())
L, R = L / peak * 0.89, R / peak * 0.89
pcm = (np.stack([L, R], 1) * 32767).astype("<i2")
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", sys.argv[1], f"{DUR}s")
