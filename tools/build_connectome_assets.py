from pathlib import Path
import json
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data' / 'raw'
OUT = ROOT / 'data' / 'derived'
SK = ROOT / 'data' / 'skeletons'
OUT.mkdir(parents=True, exist_ok=True)

ann = pd.read_feather(RAW / 'body-annotations-male-cns-v1.0.feather')
mask = (ann.status == 'Traced') & (ann.statusLabel != 'Glia') & ann.somaLocation.notna()
somata = ann.loc[mask].copy()
xyz = np.stack(somata.somaLocation.to_numpy()).astype('<f4')
lo, hi = xyz.min(0), xyz.max(0)
center = (lo + hi) / 2
scale = float((hi - lo).max() / 2)
norm = ((xyz - center) / scale).astype('<f4')

superclasses = [
    'central', 'descending_neuron', 'ascending_neuron', 'sensory',
    'visual_projection', 'visual_centrifugal', 'motor', 'endocrine'
]
codes = {name: i + 1 for i, name in enumerate(superclasses)}
groups = somata.superclass.map(codes).fillna(0).to_numpy(dtype='u1')
body_ids = somata.bodyId.to_numpy(dtype='<u4')

with (OUT / 'male-somata.bin').open('wb') as f:
    f.write(norm.tobytes())
    f.write(groups.tobytes())
    f.write(body_ids.tobytes())

hist, edges = np.histogram(norm[:, 2], bins=48, range=(-1, 1))
dimorphism = ann.dimorphism.dropna().value_counts().to_dict()
frudsx = int(ann.fruDsx.notna().sum())

skeleton_labels = {
    '10217': 'pC1x_b',
    '10666': 'pC1x_c',
    '10030': 'pIP1_R',
    '10388': 'DNp13_R',
}
skeleton_meta = []
segment_chunks = []
for body, label in skeleton_labels.items():
    nodes = {}
    ordered = []
    for line in (SK / f'{body}.swc').read_text().splitlines():
        if not line or line.startswith('#'):
            continue
        parts = line.split()
        idx, parent = int(parts[0]), int(parts[6])
        point = np.array(parts[2:5], dtype='f4')
        nodes[idx] = point
        ordered.append((idx, parent, point))
    segments = []
    for idx, parent, point in ordered:
        if parent in nodes:
            segments.extend((point - center) / scale)
            segments.extend((nodes[parent] - center) / scale)
    arr = np.asarray(segments, dtype='<f4').reshape(-1, 6)
    skeleton_meta.append({'bodyId': int(body), 'label': label, 'segments': len(arr)})
    segment_chunks.append(arr)

with (OUT / 'courtship-skeletons.bin').open('wb') as f:
    for arr in segment_chunks:
        f.write(arr.tobytes())

comparison = pd.read_feather(RAW / 'mcns_fw_edge_comp.feather')
courtship_types = {'pC1x_a', 'pC1_2a', 'pC1a', 'pC1b', 'pC1d', 'pC1e', 'pIP1', 'DNp13'}
court = comparison[comparison.pre.isin(courtship_types) | comparison.post.isin(courtship_types)]
verdicts = {str(k): int(v) for k, v in court.verdict_corr.value_counts().items()}
top = court.sort_values(['weight_m', 'weight_f'], ascending=False).head(12)
top_edges = [
    {'pre': r.pre, 'post': r.post, 'male': int(r.weight_m), 'female': int(r.weight_f), 'verdict': r.verdict_corr}
    for r in top.itertuples()
]

meta = {
    'release': 'MaleCNS v1.0 / FlyWire 783',
    'license': 'CC-BY 4.0',
    'filters': 'Traced, non-glia, soma present',
    'annotationRows': int(len(ann)),
    'tracedNonGlia': int(((ann.status == 'Traced') & (ann.statusLabel != 'Glia')).sum()),
    'renderedSomata': int(len(somata)),
    'center': center.tolist(),
    'scale': scale,
    'bounds': {'min': lo.tolist(), 'max': hi.tolist()},
    'superclasses': ['other'] + superclasses,
    'histogramZ': hist.tolist(),
    'histogramEdges': edges.tolist(),
    'dimorphismAnnotations': {str(k): int(v) for k, v in dimorphism.items()},
    'fruDsxAnnotated': frudsx,
    'skeletons': skeleton_meta,
}
meta['comparison'] = {
    'rows': int(len(comparison)),
    'courtshipRows': int(len(court)),
    'verdicts': verdicts,
    'topEdges': top_edges,
}
meta['format'] = {
    'somata': 'Float32 xyz[N*3], Uint8 superclass[N], Uint32 bodyId[N]',
    'skeletons': 'per meta order: Float32 line segments[count*6]',
}
(OUT / 'connectome-meta.json').write_text(
    json.dumps(meta, separators=(',', ':')), encoding='utf-8'
)
print(json.dumps({
    k: meta[k] for k in ['annotationRows', 'tracedNonGlia', 'renderedSomata', 'fruDsxAnnotated']
}, indent=2))
print('skeleton segments', sum(x['segments'] for x in skeleton_meta))
print('courtship rows', meta['comparison']['courtshipRows'], verdicts)
