"""Мульт-люди: модели Quaternius «Ultimate Animated Character Pack» (CC0) → компактные данные для игры.
Берётся сетка в позе покоя (по скелету), веса костей и цвета материалов; анимации не нужны —
персонаж привязывается к скелету игры (toonPeople.ts).
Запуск: python3 extract-toon.py <папка с .gltf> <папка вывода> Name1 Name2 ..."""
import json, base64, sys, os
import numpy as np

SRC, OUT, NAMES = sys.argv[1], sys.argv[2], sys.argv[3:]
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def load(path):
    g = json.load(open(path))
    bufs = []
    for b in g['buffers']:
        u = b['uri']
        bufs.append(base64.b64decode(u.split(',', 1)[1]) if u.startswith('data:') else open(os.path.join(os.path.dirname(path), u), 'rb').read())

    def acc(i):
        a = g['accessors'][i]
        bv = g['bufferViews'][a['bufferView']]
        dt = CT[a['componentType']]
        n = NC[a['type']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = bv.get('byteStride', 0)
        isz = np.dtype(dt).itemsize * n
        raw = bufs[bv['buffer']]
        if stride and stride != isz:
            rows = [np.frombuffer(raw, dt, n, off + k * stride) for k in range(a['count'])]
            return np.array(rows)
        return np.frombuffer(raw, dt, a['count'] * n, off).reshape(a['count'], n) if n > 1 else np.frombuffer(raw, dt, a['count'], off)
    return g, acc


def trs(nd):
    m = np.eye(4)
    if 'matrix' in nd:
        return np.array(nd['matrix']).reshape(4, 4).T
    t = nd.get('translation', [0, 0, 0]); r = nd.get('rotation', [0, 0, 0, 1]); s = nd.get('scale', [1, 1, 1])
    x, y, z, w = r
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    m[:3, :3] = R * np.array(s)[None, :]
    m[:3, 3] = t
    return m


def b64(a):
    return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()


for name in NAMES:
    g, acc = load(f'{SRC}/{name}.gltf')
    nodes = g['nodes']
    parent = {}
    for i, nd in enumerate(nodes):
        for c in nd.get('children', []):
            parent[c] = i
    sk = g['skins'][0]
    jn = [nodes[j]['name'] for j in sk['joints']]
    ibm = acc(sk['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
    # Поза привязки: вершины — как в файле (координаты сетки), суставы — из обратных матриц привязки.
    jpos = {jn[k]: np.linalg.inv(ibm[k])[:3, 3] for k in range(len(jn))}
    mesh_node = next(i for i, nd in enumerate(nodes) if 'mesh' in nd)
    prims = []
    for p in g['meshes'][nodes[mesh_node]['mesh']]['primitives']:
        a = p['attributes']
        P = acc(a['POSITION']).astype(np.float64)
        J = acc(a['JOINTS_0']).astype(np.int64)
        Wt = acc(a['WEIGHTS_0']).astype(np.float64)
        Wt = Wt / Wt.sum(1, keepdims=True)
        out = P
        idx = acc(p['indices']).astype(np.uint32)
        mat = g['materials'][p['material']]
        col = mat['pbrMetallicRoughness'].get('baseColorFactor', [1, 1, 1, 1])
        prims.append(dict(mat=mat['name'], col=[round(c, 4) for c in col[:3]], P=out, J=J, W=Wt, I=idx))
    allP = np.concatenate([q['P'] for q in prims])
    # Ноги на полу (y = 0), рост 1; смотрит на +Z, левая сторона — +X.
    y0 = allP[:, 1].min(); h = allP[:, 1].max() - y0
    face = np.concatenate([q['P'] for q in prims if q['mat'] == 'Face']) if any(q['mat'] == 'Face' for q in prims) else allP
    flipZ = face[:, 2].mean() < 0
    flipX = (jpos['Fist.L'][0] < 0) != flipZ
    def fix(v):
        v = (v - np.array([0, y0, 0])) / h
        if flipZ: v = v * np.array([-1, 1, -1])
        if flipX: v = v * np.array([-1, 1, 1])
        return v
    data = {'name': name, 'height': round(float(h), 4), 'joints': {k: [round(float(x), 5) for x in fix(v)] for k, v in jpos.items()}, 'bones': jn, 'prims': []}
    for q in prims:
        P = fix(q['P']).astype(np.float32)
        I = q['I'].astype(np.uint16 if len(P) < 65536 else np.uint32)
        if flipX != flipZ:  # зеркало — меняем обход треугольников
            I = I.reshape(-1, 3)[:, [0, 2, 1]].reshape(-1)
        data['prims'].append({'mat': q['mat'], 'col': q['col'], 'n': int(len(P)), 'pos': b64(P), 'idx': b64(I), 'j': b64(q['J'].astype(np.uint8)), 'w': b64((q['W'] * 255 + 0.5).astype(np.uint8))})
    os.makedirs(OUT, exist_ok=True)
    s = json.dumps(data, separators=(',', ':'))
    open(f'{OUT}/{name}.json', 'w').write(s)
    print(name, 'h', round(float(h), 3), 'flipZ', flipZ, 'flipX', flipX, 'verts', sum(q['P'].shape[0] for q in prims), 'kb', len(s) // 1024)
