# Ommara

A dependency-free browser interface for real MaleCNS anatomy and published MaleCNS/FlyWire sex-comparison data. This build does not synthesize neural activity or behavioural scores.

## Local deployment

Run `python -m http.server 4317 --bind 127.0.0.1`, then open `http://127.0.0.1:4317/`. A web server is required because the interface fetches binary assets.

## Data used on the homepage

- `male-somata.bin`: 140,024 measured soma positions from MaleCNS v1.0, filtered to traced, non-glia rows with a soma coordinate.
- `courtship-skeletons.bin`: 47,142 line segments derived from the official SWC files for body IDs 10217 (`pC1x_b`), 10666 (`pC1x_c`), 10030 (`pIP1_R`) and 10388 (`DNp13_R`).
- `connectome-meta.json`: counts, coordinate bounds, depth histogram and a courtship-type subset of the published 3,761,792-row MaleCNS/FlyWire edge comparison.

The original MaleCNS and comparison datasets are CC-BY 4.0. Source links and scientific limits are shown in the interface.

## Rebuild derived assets

Install `pandas`, `numpy` and `pyarrow`, place the official annotation Feather, comparison Feather and SWC files under `data/raw` and `data/skeletons`, then run `python tools/build_connectome_assets.py`.
