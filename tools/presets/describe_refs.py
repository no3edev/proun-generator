# Composition descriptors of the reference Prouns, for the preset search (search.mjs scores generator seeds against them).
#   python3 tools/presets/describe_refs.py   -> tools/presets/targets.json
# Descriptors (all in the picture's own frame, x right, y DOWN, 0..1): coverage of ink (pixels clearly darker than the paper), its centroid, spread
# (std per axis), the main axis (degrees, 0 = horizontal, counter-clockwise positive) and how elongated the mass is, a 3x3 grid of where the ink
# sits, and the coverage of dark ink. Rough by design: it finds compositions of similar weight and direction; the eye decides among the candidates.
import json, os, numpy as np
from PIL import Image
from scipy import ndimage
HERE = os.path.dirname(os.path.abspath(__file__))
P, U = '/mnt/project/', '/mnt/user-data/uploads/'
# name, file, crop ('full' keeps the whole image, 'bbox' crops to the drawn area), source note
REFS = [
  ('cracked-grey', P + '01.jpg', 'full'), ('ochre-suspension', P + 'images_1.jpg', 'full'), ('diagonals-19d', P + '02.jpg', 'full'),
  ('grey-cube', P + '03.jpg', 'full'), ('crossing-beams', P + '04.jpg', 'full'), ('red-bar', P + '05.jpg', 'bbox'),
  ('graphite-box', U + 'proun_01.jpg', 'bbox'), ('black-disc', U + 'proun_02.jpg', 'bbox'), ('tall-tower', U + 'proun_03.jpg', 'bbox'),
  ('long-diagonal', U + 'proun_04.jpg', 'bbox'), ('disc-and-boxes', U + 'proun_05.jpg', 'bbox'), ('figurine', U + 'proun_06.jpg', 'bbox'),
]
def luma(a): return (0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]) / 255.0
out = {}
for name, path, crop in REFS:
    im = Image.open(path).convert('RGB'); a = np.asarray(im).astype(float)
    L = luma(a); h, w = L.shape; bw = max(2, int(0.03 * min(h, w)))
    border = np.concatenate([L[:bw].ravel(), L[-bw:].ravel(), L[:, :bw].ravel(), L[:, -bw:].ravel()]); paper = float(np.median(border))
    if crop == 'bbox':
        m = np.abs(L - paper) > 0.12; m[:bw] = m[-bw:] = False; m[:, :bw] = m[:, -bw:] = False
        ys, xs = np.where(m); y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
        # a framed print: the frame is the extreme of the drawn area; a sheet with a figure: pad a little
        pad = int(0.02 * min(h, w)); y0, x0 = max(0, y0 - pad), max(0, x0 - pad); y1, x1 = min(h - 1, y1 + pad), min(w - 1, x1 + pad)
        L = L[y0:y1 + 1, x0:x1 + 1]
    H, W = L.shape; gw = 64; gh = max(8, int(round(gw * H / W)))
    g = np.asarray(Image.fromarray((L * 255).astype(np.uint8)).resize((gw, gh), Image.BILINEAR)).astype(float) / 255
    d = np.clip((paper - g) / max(paper, 0.2), 0, 1); mask = d > 0.18
    cov = float(mask.mean()); ys, xs = np.mgrid[0:gh, 0:gw]; xn, yn = (xs + 0.5) / gw, (ys + 0.5) / gh
    wgt = mask.astype(float); s = wgt.sum() or 1.0
    cx, cy = float((xn * wgt).sum() / s), float((yn * wgt).sum() / s)
    sx, sy = float(np.sqrt((((xn - cx) ** 2) * wgt).sum() / s)), float(np.sqrt((((yn - cy) ** 2) * wgt).sum() / s))
    cxy = float((((xn - cx) * (yn - cy)) * wgt).sum() / s)
    # covariance in picture units (x scaled by aspect so angles are true)
    asp = W / H; vx, vy, vxy = (sx * asp) ** 2, sy ** 2, cxy * asp * -1.0   # y up
    lam, vec = np.linalg.eigh(np.array([[vx, vxy], [vxy, vy]]))
    ang = float(np.degrees(np.arctan2(vec[1, 1], vec[0, 1])) % 180); aniso = float(1 - (lam[0] / lam[1] if lam[1] > 1e-9 else 1))
    comp = int(sum(1 for i in range(1, ndimage.label(mask)[1] + 1) if (ndimage.label(mask)[0] == i).sum() >= 4))
    grid = [float(mask[int(r * gh / 3):int((r + 1) * gh / 3), int(c * gw / 3):int((c + 1) * gw / 3)].sum() / max(mask.sum(), 1)) for r in range(3) for c in range(3)]
    out[name] = {'file': os.path.basename(path), 'aspect': round(W / H, 3), 'paperLuma': round(paper, 3), 'coverage': round(cov, 4), 'centroid': [round(cx, 3), round(cy, 3)],
                 'spread': [round(sx, 3), round(sy, 3)], 'angle': round(ang, 1), 'aniso': round(aniso, 3), 'grid': [round(v, 3) for v in grid], 'darkCoverage': round(float((d > 0.55).mean()), 4), 'components': comp}
    print(f"{name:18s} aspect {W / H:.2f} paper {paper:.2f} cov {cov:.2f} centroid {cx:.2f},{cy:.2f} spread {sx:.2f},{sy:.2f} angle {ang:3.0f} aniso {aniso:.2f} dark {float((d > 0.55).mean()):.2f}")
json.dump(out, open(os.path.join(HERE, 'targets.json'), 'w'), indent=1)
