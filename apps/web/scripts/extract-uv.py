"""Развёртка базовой модели MakeHuman (CC0) для тела и головы игры — под текстуры кожи MakeHuman.
Порядок треугольников — как в extract-mh.py (тело, перекрытие шеи, голова). У большинства вершин одна
точка развёртки (uv вершины); на швах развёртки у угла треугольника своя точка — список исключений.
Запуск: MH_DATA=<makehuman/data> python3 extract-uv.py <dir with uvData.ts>"""
import numpy as np, base64, json, sys, collections, os
D = os.environ.get('MH_DATA', '/home/claude/makehumancommunity/makehuman/makehuman/data')
OUT = sys.argv[1]
vs = []; vts = []; faces = collections.defaultdict(list); cur = None
for line in open(f'{D}/3dobjs/base.obj'):
    if line.startswith('v '): vs.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('vt '): vts.append([float(x) for x in line.split()[1:3]])
    elif line.startswith('g '): cur = line.split()[1]
    elif line.startswith('f '):
        parts = [x.split('/') for x in line.split()[1:]]
        faces[cur].append(([int(p[0]) - 1 for p in parts], [int(p[1]) - 1 for p in parts]))
V0 = np.array(vs); VT = np.array(vts)
CUT = 6.05
body = faces['body']
headF = [f for f in body if all(V0[i][1] > CUT for i in f[0])]
bodyF = [f for f in body if not all(V0[i][1] > CUT for i in f[0])]
ring = {i for f in headF for i in f[0] if V0[i][1] < CUT + 0.25}
overlapF = [f for f in headF if all(i in ring for i in f[0])]
def tri(fl, remap):
    t = []; u = []
    for f, ft in fl:
        q = [remap[i] for i in f]
        t.append([q[0], q[1], q[2]]); u.append([ft[0], ft[1], ft[2]])
        if len(q) == 4: t.append([q[0], q[2], q[3]]); u.append([ft[0], ft[2], ft[3]])
    return t, u
hUsed = sorted({i for f in headF for i in f[0]}); hMap = {o: n for n, o in enumerate(hUsed)}
bUsed = sorted({i for f in bodyF + overlapF for i in f[0]}); bMap = {o: n for n, o in enumerate(bUsed)}
def b64(a): return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
def pack(tris, uvs, n):
    tris = np.array(tris); uvs = np.array(uvs)
    # uv вершины — самая частая у её углов; остальные углы — исключения.
    cnt = [collections.Counter() for _ in range(n)]
    for t, u in zip(tris, uvs):
        for k in range(3): cnt[t[k]][u[k]] += 1
    vuv = np.array([c.most_common(1)[0][0] if c else 0 for c in cnt])
    corner = uvs.ravel(); vert = tris.ravel()
    ex = np.nonzero(corner != vuv[vert])[0]
    q = lambda a: np.round(np.clip(a, 0, 1) * 65535).astype('<u2')
    return {'uv': b64(q(VT[vuv])), 'ex': b64(ex.astype('<u4')), 'exUv': b64(q(VT[corner[ex]]))}, len(ex)
bt, bu = tri(bodyF, bMap); ot, ou = tri(overlapF, bMap); ht, hu = tri(headF, hMap)
body_pack, nb = pack(bt + ot, bu + ou, len(bUsed))
head_pack, nh = pack(ht, hu, len(hUsed))
print('body verts', len(bUsed), 'tris', len(bt) + len(ot), 'seam corners', nb, '| head verts', len(hUsed), 'tris', len(ht), 'seam corners', nh)
HDR = '// Сгенерировано из базовой модели MakeHuman (makehumancommunity.org), лицензия CC0.\n// Не редактировать вручную: apps/web/scripts/extract-uv.py пересоздаёт этот файл.\n/* eslint-disable */\n'
with open(f'{OUT}/uvData.ts', 'w') as fo:
    fo.write(HDR + 'export const UV_DATA = ' + json.dumps({'body': body_pack, 'head': head_pack}, separators=(',', ':')) + ' as const;\n')
print('size', os.path.getsize(f'{OUT}/uvData.ts'))
