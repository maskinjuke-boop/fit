"""Извлекает голову из базовой модели MakeHuman (CC0) для игры: женская и мужская формы,
ориентиры (глаза), ресницы и мишени для ползунков лица. Пишет TS-модуль с данными в base64."""
import numpy as np, base64, json, sys, collections, os
D = os.environ.get('MH_DATA', '/home/claude/makehumancommunity/makehuman/makehuman/data')
OUT = sys.argv[1]
vs=[]; faces=collections.defaultdict(list); cur=None
for line in open(f'{D}/3dobjs/base.obj'):
    if line.startswith('v '): vs.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('g '): cur=line.split()[1]
    elif line.startswith('f '): faces[cur].append([int(x.split('/')[0])-1 for x in line.split()[1:]])
V0=np.array(vs)
def target(path):
    d=np.zeros_like(V0)
    for line in open(path):
        line=line.strip()
        if not line or line.startswith('#'): continue
        p=line.split(); d[int(p[0])]=[float(p[1]),float(p[2]),float(p[3])]
    return d
def T(rel): return target(f'{D}/targets/{rel}.target')
def gender(g):
    v=V0+T(f'macrodetails/universal-{g}-young-averagemuscle-averageweight')
    for race in ('african','asian','caucasian'): v+= T(f'macrodetails/{race}-{g}-young')/3
    return v
VF=gender('female'); VM=gender('male')
# Область головы: грани тела выше линии среза шеи (по нейтральной модели).
CUT=6.05
body=[f for f in faces['body'] if all(V0[i][1]>CUT for i in f)]
used=sorted({i for f in body for i in f}); remap={o:n for n,o in enumerate(used)}
tris=[]
for f in body:
    q=[remap[i] for i in f]
    tris.append([q[0],q[1],q[2]])
    if len(q)==4: tris.append([q[0],q[2],q[3]])
print('head verts',len(used),'tris',len(tris))
def eye(v,side):
    idx=sorted({i for f in faces[f'helper-{side}-eye'] for i in f}); P=v[idx]; c=P.mean(0); r=np.linalg.norm(P-c,axis=1).mean(); return c,r
# Ухо — вершины, которые мишень «ухо вверх» сдвигает целиком (без зоны плавного перехода).
ear_d=sum(np.linalg.norm(T(f'ears/{sd}-ear-trans-up'),axis=1) for sd in 'lr')[used]
EAR=ear_d>0.9*ear_d.max()
print('ear verts',EAR.sum())
cnt=collections.Counter()
for t in tris:
    for a,b in ((t[0],t[1]),(t[1],t[2]),(t[2],t[0])): cnt[(min(a,b),max(a,b))]+=1
BE=[e for e,c in cnt.items() if c==1]
out={}
for name,v,H in (('female',VF,0.55),('male',VM,0.567)):
    P=v[used]
    top=P[:,1].max()
    ec,er=eye(v,'l')
    # Подбородок — самая низкая точка лица спереди (горло лежит глубже).
    front=P[(P[:,2]>ec[2]-0.35)&(np.abs(P[:,0])<0.15)&(P[:,1]<ec[1])]
    chin=front[:,1].min()
    s=H/(top-chin)
    # Ось головы: середина между лбом и затылком на уровне глаз.
    lvl=P[np.abs(P[:,1]-ec[1])<0.08]
    zc=(lvl[:,2].max()+lvl[:,2].min())/2
    off=np.array([0,(top+chin)/2,zc])
    def tf(p): return (p-off)*s
    Q=tf(P)
    lash=[]
    for g in ('helper-l-eyelashes-1','helper-l-eyelashes-2'):
        lidx=sorted({i for f in faces[g] for i in f}); lmap={o:n for n,o in enumerate(lidx)}
        lp=tf(v[lidx]); lt=[]
        for f in faces[g]:
            q=[lmap[i] for i in f]; lt.append([q[0],q[1],q[2]]);
            if len(q)==4: lt.append([q[0],q[2],q[3]])
        lash.append((lp,lt))
    # Рот: вершины, которые двигают мишени объёма губ (губы целиком).
    lipd=sum(np.abs(T(f'mouth/mouth-{w}lip-volume-incr')) for w in ('upper','lower'))[used].max(1)
    lip_i=np.where(lipd>1e-4)[0]
    L=Q[lip_i]; LW=lipd[lip_i]
    mo=dict(y=float((L[:,1]*LW).sum()/LW.sum()),w=float(np.abs(L[:,0]).max()),z=float(L[:,2].max()))
    out[name]=dict(P=Q,eye=tf(ec),er=er*s,s=s,lash=lash,mouth=mo,lipw=np.clip(lipd/np.percentile(lipd[lip_i],90),0,1))
    print(name,'mouth',{k:round(v,4) for k,v in mo.items()},'lip verts',len(lip_i))
    print(name,'scale',round(s,4),'eye',np.round(tf(ec),4),'er',round(er*s,4),'x range',Q[:,0].min().round(3),Q[:,0].max().round(3),'z',Q[:,2].min().round(3),Q[:,2].max().round(3),'y',Q[:,1].min().round(3),Q[:,1].max().round(3))
# Мишени для ползунков: (плюс, минус); у парных левых/правых — сумма.
SL={
 'faceWidth':(['head/head-scale-horiz-incr'],['head/head-scale-horiz-decr']),
 'cheekbones':(['cheek/l-cheek-bones-incr','cheek/r-cheek-bones-incr'],['cheek/l-cheek-bones-decr','cheek/r-cheek-bones-decr']),
 'jaw':(['head/head-square'],['head/head-invertedtriangular']),
 'chin':(['chin/chin-prominent-incr','chin/chin-height-incr'],['chin/chin-prominent-decr','chin/chin-height-decr']),
 'nose':(['nose/nose-scale-horiz-incr','nose/nose-scale-vert-incr','nose/nose-scale-depth-incr'],['nose/nose-scale-horiz-decr','nose/nose-scale-vert-decr','nose/nose-scale-depth-decr']),
 'lips':(['mouth/mouth-lowerlip-volume-incr','mouth/mouth-upperlip-volume-incr'],['mouth/mouth-lowerlip-volume-decr','mouth/mouth-upperlip-volume-decr']),
 'eyes':(['eyes/l-eye-scale-incr','eyes/r-eye-scale-incr'],['eyes/l-eye-scale-decr','eyes/r-eye-scale-decr']),
}
def b64(a): return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
def q16(a,sc): return np.clip(np.round(a/sc*32767),-32767,32767).astype('<i2')
SC=0.4
data={'n':len(used),'ear':b64(np.packbits(EAR.astype('u1'))),'tris':b64(np.array(tris,dtype='<u2')),'scale':SC}
for name in ('female','male'):
    o=out[name]
    data[name]={'pos':b64(q16(o['P'],SC)),'eye':[round(float(x),5) for x in o['eye']],'er':round(float(o['er']),5),
      'mouth':{k:round(v,5) for k,v in o['mouth'].items()},
      'lip':b64(np.round(o['lipw']*255).astype('u1')),
      'lash':[{'pos':b64(q16(lp,SC)),'tris':b64(np.array(lt,dtype='<u2'))} for lp,lt in o['lash']]}
# Дельты мишеней в масштабе нейтральной головы (средний масштаб полов).
s_avg=(out['female']['s']+out['male']['s'])/2
sl={}
for key,(plus,minus) in SL.items():
    ent={}
    for sign,files in (('p',plus),('m',minus)):
        d=sum(T(f) for f in files)[used]*s_avg
        nz=np.where(np.abs(d).max(1)>1e-6)[0]
        mx=float(np.abs(d).max()) or 1e-6
        ent[sign]={'idx':b64(nz.astype('<u2')),'d':b64(q16(d[nz],mx)),'sc':mx}
    sl[key]=ent
data['sliders']=sl
js=json.dumps(data,separators=(',',':'))
with open(OUT,'w') as f:
    f.write('// Сгенерировано из базовой модели MakeHuman (makehumancommunity.org), лицензия CC0.\n')
    f.write('// Не редактировать вручную: scripts/extract-head.py пересоздаёт этот файл.\n')
    f.write('/* eslint-disable */\n')
    f.write('export const HEAD_DATA = '+js+' as const;\n')
print('bytes',len(js))
