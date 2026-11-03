"""Извлекает голову и тело из базовой модели MakeHuman (CC0) для игры.
Обе части берутся из одной и той же модели, поэтому стыкуются по шее без шва.
Тело ставится в игровую позу (руки опущены) по скелету MakeHuman (веса — тоже CC0).
Запуск: MH_DATA=<makehuman/data> python3 extract-mh.py <dir with headData.ts/bodyData.ts>"""
import numpy as np, base64, json, sys, collections, os
D = os.environ.get('MH_DATA', '/home/claude/makehumancommunity/makehuman/makehuman/data')
OUT = sys.argv[1]
vs=[]; faces=collections.defaultdict(list); cur=None
for line in open(f'{D}/3dobjs/base.obj'):
    if line.startswith('v '): vs.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('g '): cur=line.split()[1]
    elif line.startswith('f '): faces[cur].append([int(x.split('/')[0])-1 for x in line.split()[1:]])
V0=np.array(vs)
_tc={}
def T(rel):
    if rel in _tc: return _tc[rel]
    d=np.zeros_like(V0)
    for line in open(f'{D}/targets/{rel}.target'):
        line=line.strip()
        if not line or line.startswith('#'): continue
        p=line.split(); d[int(p[0])]=[float(p[1]),float(p[2]),float(p[3])]
    _tc[rel]=d; return d
SK=json.load(open(f'{D}/rigs/default.mhskel'))
WT=json.load(open(f'{D}/rigs/default_weights.mhw'))['weights']

# ── Константы игры (совпадают с body.ts) ──
HEAD_Y=1.9      # центр головы в её собственных координатах
GROW=0.53       # масштаб головы относительно тела (HEAD_GROW)
K_MALE=0.13     # игровых единиц на единицу MakeHuman (дециметр) у мужской фигуры
CUT=6.05        # срез шеи: выше — голова, ниже — тело (по нейтральной модели)

def gender(g):
    u=f'{g}-young-averagemuscle-averageweight'
    v=V0+T(f'macrodetails/universal-{u}')
    for race in ('african','asian','caucasian'): v=v+T(f'macrodetails/{race}-{g}-young')/3
    v=v+0.6*T(f'macrodetails/proportions/{u}-idealproportions')
    mus=0.15 if g=='female' else 0.3
    v=v+mus*(T(f'macrodetails/universal-{g}-young-maxmuscle-averageweight')-T(f'macrodetails/universal-{u}'))
    if g=='female':
        v=v+0.55*T(f'breast/{u}-maxcup-averagefirmness')+0.3*T('hip/hip-scale-horiz-incr')+0.3*T('buttocks/buttocks-volume-incr')
    else:
        v=v+0.3*T('torso/torso-vshape-incr')
    return v

def joints(v): return {k:v[idx].mean(0) for k,idx in SK['joints'].items()}
def bone(J,b): bb=SK['bones'][b]; return J[bb['head']],J[bb['tail']]
def rot(a,b):
    a=a/np.linalg.norm(a); b=b/np.linalg.norm(b); c=np.cross(a,b); s=np.linalg.norm(c); d=a@b
    if s<1e-9: return np.eye(3)
    k=c/s; Kx=np.array([[0,-k[2],k[1]],[k[2],0,-k[0]],[-k[1],k[0],0]])
    return np.eye(3)+Kx*s+Kx@Kx*(1-d)
def slerpR(R,t):
    ang=np.arccos(np.clip((np.trace(R)-1)/2,-1,1))
    if ang<1e-9: return np.eye(3)
    ax=np.array([R[2,1]-R[1,2],R[0,2]-R[2,0],R[1,0]-R[0,1]])/(2*np.sin(ang))
    a=ang*t; Kx=np.array([[0,-ax[2],ax[1]],[ax[2],0,-ax[0]],[-ax[1],ax[0],0]])
    return np.eye(3)+np.sin(a)*Kx+(1-np.cos(a))*Kx@Kx
def children(b): return [c for c,bb in SK['bones'].items() if bb['parent']==b]
def subtree(b):
    out=[b]
    for c in children(b): out+=subtree(c)
    return out

# Направления плеча и предплечья в игровой позе (у +X руки; совпадают с прежней фигурой).
POSE={'male':((0.08,-0.39,-0.03),(0.05,-0.37,0.08)),'female':((0.075,-0.365,-0.03),(0.05,-0.36,0.08))}
def pose(v,g):
    J=joints(v); out=v.copy()
    up_t,fo_t=[np.array(x) for x in POSE[g]]
    for side,sx in (('L',1),('R',-1)):
        m=np.array([sx,1,1])
        sh,el=bone(J,f'upperarm01.{side}')[0],bone(J,f'lowerarm01.{side}')[0]
        wr=bone(J,f'wrist.{side}')[0]
        R1=rot(el-sh,up_t*m)
        el2=sh+R1@(el-sh); wr1=sh+R1@(wr-sh)
        R2=rot(wr1-el2,fo_t*m)
        # Трансформации костей: x -> R (x - pivot) + pivot'.
        tf={}
        for b in subtree(f'upperarm01.{side}'): tf[b]=(R1,sh,sh)
        for b in subtree(f'lowerarm01.{side}'): tf[b]=(R2@R1,el,el2)
        tf[f'shoulder01.{side}']=(slerpR(R1,0.45),sh,sh)
        tf[f'clavicle.{side}']=(slerpR(R1,0.08),bone(J,f'clavicle.{side}')[0],bone(J,f'clavicle.{side}')[0])
        acc=np.zeros_like(v); wsum=np.zeros(len(v))
        for b,(R,p0,p1) in tf.items():
            for i,w in WT.get(b,[]):
                acc[i]+=w*((R@(v[i]-p0))+p1); wsum[i]+=w
        moved=wsum>0
        out[moved]=acc[moved]+v[moved]*(1-wsum[moved])[:,None]
    return out

def rotAxis(k,a):
    k=k/np.linalg.norm(k); Kx=np.array([[0,-k[2],k[1]],[k[2],0,-k[0]],[-k[1],k[0],0]])
    return np.eye(3)+np.sin(a)*Kx+(1-np.cos(a))*Kx@Kx
FIST=SIGN=1
def fist(v,side,sign=1):
    """Сжатая кисть: пальцы сгибаются к ладони (углы суставов — как у кулака, держащего рукоять)."""
    J=joints(v); out=v.copy()
    wr=bone(J,f'wrist.{side}')[0]
    k2=bone(J,f'finger2-1.{side}')[0]; k5=bone(J,f'finger5-1.{side}')[0]
    Np=np.cross(k2-wr,k5-wr)*sign*(1 if side=='L' else -1); Np/=np.linalg.norm(Np)
    tf={}
    for n,angs in ((2,(1.25,1.6,1.0)),(3,(1.3,1.65,1.0)),(4,(1.35,1.65,1.0)),(5,(1.4,1.6,1.0)),(1,(0.35,0.6,0.5))):
        R=np.eye(3); off=np.zeros(3)   # x -> R x + off (накопленная трансформация цепочки)
        for j in (1,2,3):
            b=f'finger{n}-{j}.{side}'; h,t=bone(J,b)
            hp=R@h+off; d=R@(t-h)
            ax=np.cross(d,Np) if n!=1 else np.cross(d,Np)*0.7+np.cross(k5-k2,Np)*0.3
            Rj=rotAxis(ax,angs[j-1])
            # новая трансформация: x -> Rj (R x + off - hp) + hp
            R=Rj@R; off=Rj@(off-hp)+hp
            tf[b]=(R.copy(),off.copy())
    acc=np.zeros_like(v); ws=np.zeros(len(v))
    for b,(R,o) in tf.items():
        for i,w in WT.get(b,[]): acc[i]+=w*(v[i]@R.T+o); ws[i]+=w
    m=ws>0
    out[m]=acc[m]+v[m]*(1-ws[m])[:,None]
    # Точка хвата и ось рукояти (от мизинца к указательному).
    pts=[]
    for b in (f'finger3-1.{side}',f'finger3-2.{side}',f'finger3-3.{side}'):
        h,t=bone(J,b); R,o=tf.get(b,(np.eye(3),0)); pts+= [R@h+o, R@t+o]
    grip=(np.mean(pts,0)*0.6+k2*0.2+k5*0.2)
    return out,grip,(k2-k5)/np.linalg.norm(k2-k5)

# ── Разбиение граней: голова / тело (без кистей) ──
HAND_BONES={b for s in 'LR' for b in subtree(f'wrist.{s}')}
ARM_BONES={b for s in 'LR' for b in subtree(f'upperarm01.{s}')}
LEG_BONES={b for s in 'LR' for b in subtree(f'upperleg01.{s}')}
def wsum(bones):
    a=np.zeros(len(V0))
    for b in bones:
        for i,w in WT.get(b,[]): a[i]+=w
    return a
HANDW=wsum(HAND_BONES); ARMW=wsum(ARM_BONES); LEGW=wsum(LEG_BONES)
headF=[f for f in faces['body'] if all(V0[i][1]>CUT for i in f)]
bodyF=[f for f in faces['body'] if not all(V0[i][1]>CUT for i in f)]
# Перекрытие: кольцо граней головы у среза — тело заходит под голову (скрывает щель при повороте).
ring={i for f in headF for i in f if V0[i][1]<CUT+0.25}
overlapF=[f for f in headF if all(i in ring for i in f)]
def tri(fl,remap):
    t=[]
    for f in fl:
        q=[remap[i] for i in f]; t.append([q[0],q[1],q[2]])
        if len(q)==4: t.append([q[0],q[2],q[3]])
    return t
hUsed=sorted({i for f in headF for i in f}); hMap={o:n for n,o in enumerate(hUsed)}
bUsed=sorted({i for f in bodyF+overlapF for i in f}); bMap={o:n for n,o in enumerate(bUsed)}
hTris=tri(headF,hMap); bTris=tri(bodyF,bMap); oTris=tri(overlapF,bMap)
print('head',len(hUsed),len(hTris),'body',len(bUsed),len(bTris),'overlap tris',len(oTris))
# Кольцо среза (граница граней головы снизу) — шарнир шеи.
cnt=collections.Counter()
for t in hTris:
    for a,b in ((t[0],t[1]),(t[1],t[2]),(t[2],t[0])): cnt[(min(a,b),max(a,b))]+=1
cutRing=sorted({hUsed[i] for (a,b),c in cnt.items() if c==1 for i in (a,b)})

def eye(v,side):
    idx=sorted({i for f in faces[f'helper-{side}-eye'] for i in f}); P=v[idx]; c=P.mean(0); r=np.linalg.norm(P-c,axis=1).mean(); return c,r

frames={}
V={}
for g in ('male','female'):
    v=pose(gender(g),g); V[g]=v
    P=v[hUsed]; ec,_=eye(v,'l')
    top=P[:,1].max()
    front=P[(P[:,2]>ec[2]-0.35)&(np.abs(P[:,0])<0.15)&(P[:,1]<ec[1])]
    chin=front[:,1].min()
    lvl=P[np.abs(P[:,1]-ec[1])<0.08]
    zc=(lvl[:,2].max()+lvl[:,2].min())/2
    ground=v[bUsed][:,1].min()
    rc=v[cutRing].mean(0)
    frames[g]=dict(top=top,chin=chin,zc=zc,ground=ground,ring=rc)
fm=frames['male']
S_m=K_MALE/GROW
NECK_Y=HEAD_Y+S_m*(fm['ring'][1]-(fm['top']+fm['chin'])/2)
NECK_WORLD=K_MALE*(fm['ring'][1]-fm['ground'])
for g in ('male','female'):
    f=frames[g]
    k=K_MALE if g=='male' else NECK_WORLD/(f['ring'][1]-f['ground'])
    S=k/GROW
    f.update(k=k,S=S,Oy=f['ring'][1]-(NECK_Y-HEAD_Y)/S)
    print(g,'k',round(k,4),'S',round(S,4),'height',round(k*(f['top']-f['ground']),3),'head h (world)',round(k*(f['top']-f['chin']),3))
print('NECK_Y',round(NECK_Y,4),'NECK_WORLD',round(NECK_WORLD,4))
def headTf(g,p):
    f=frames[g]; return (p-np.array([0,f['Oy'],f['zc']]))*f['S']+np.array([0,HEAD_Y,0])
def bodyTf(g,p):
    f=frames[g]; return (p-np.array([0,f['ground'],f['zc']]))*f['k']

def b64(a): return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
def q16(a,sc): return np.clip(np.round(a/sc*32767),-32767,32767).astype('<i2')
HDR='// Сгенерировано из базовой модели MakeHuman (makehumancommunity.org), лицензия CC0.\n// Не редактировать вручную: apps/web/scripts/extract-mh.py пересоздаёт этот файл.\n/* eslint-disable */\n'

# ── Голова ── (координаты головы: центр (0, HEAD_Y, 0) → здесь без HEAD_Y)
ear_d=sum(np.linalg.norm(T(f'ears/{sd}-ear-trans-up'),axis=1) for sd in 'lr')[hUsed]
EAR=ear_d>0.9*ear_d.max()
HSC=0.4
head={'n':len(hUsed),'ear':b64(np.packbits(EAR.astype('u1'))),'tris':b64(np.array(hTris,dtype='<u2')),'scale':HSC,'neckY':round(NECK_Y-HEAD_Y,5)}
for g in ('female','male'):
    v=V[g]; tf=lambda p: headTf(g,p)-np.array([0,HEAD_Y,0])
    Q=tf(v[hUsed]); ec,er=eye(v,'l')
    lipd=sum(np.abs(T(f'mouth/mouth-{w}lip-volume-incr')) for w in ('upper','lower'))[hUsed].max(1)
    lip_i=np.where(lipd>1e-4)[0]; L=Q[lip_i]; LW=lipd[lip_i]
    mo=dict(y=float((L[:,1]*LW).sum()/LW.sum()),w=float(np.abs(L[:,0]).max()),z=float(L[:,2].max()))
    lipw=np.clip(lipd/np.percentile(lipd[lip_i],90),0,1)
    head[g]={'pos':b64(q16(Q,HSC)),'eye':[round(float(x),5) for x in tf(ec)],'er':round(float(er*frames[g]['S']),5),
      'mouth':{k:round(v_,5) for k,v_ in mo.items()},'lip':b64(np.round(lipw*255).astype('u1'))}
    print(g,'head y',Q[:,1].min().round(3),Q[:,1].max().round(3),'eye',np.round(tf(ec),4),'er',round(er*frames[g]['S'],4))
SL={
 'faceWidth':(['head/head-scale-horiz-incr'],['head/head-scale-horiz-decr']),
 'cheekbones':(['cheek/l-cheek-bones-incr','cheek/r-cheek-bones-incr'],['cheek/l-cheek-bones-decr','cheek/r-cheek-bones-decr']),
 'jaw':(['head/head-square'],['head/head-invertedtriangular']),
 'chin':(['chin/chin-prominent-incr','chin/chin-height-incr'],['chin/chin-prominent-decr','chin/chin-height-decr']),
 'nose':(['nose/nose-scale-horiz-incr','nose/nose-scale-vert-incr','nose/nose-scale-depth-incr'],['nose/nose-scale-horiz-decr','nose/nose-scale-vert-decr','nose/nose-scale-depth-decr']),
 'lips':(['mouth/mouth-lowerlip-volume-incr','mouth/mouth-upperlip-volume-incr'],['mouth/mouth-lowerlip-volume-decr','mouth/mouth-upperlip-volume-decr']),
}
s_avg=(frames['female']['S']+frames['male']['S'])/2
sl={}
for key,(plus,minus) in SL.items():
    ent={}
    for sign,files in (('p',plus),('m',minus)):
        d=sum(T(f) for f in files)[hUsed]*s_avg
        nz=np.where(np.abs(d).max(1)>1e-6)[0]; mx=float(np.abs(d).max()) or 1e-6
        ent[sign]={'idx':b64(nz.astype('<u2')),'d':b64(q16(d[nz],mx)),'sc':mx}
    sl[key]=ent
head['sliders']=sl
with open(f'{OUT}/headData.ts','w') as fo:
    fo.write(HDR+'export const HEAD_DATA = '+json.dumps(head,separators=(',',':'))+' as const;\n')

# ── Тело ── (мировые координаты игры: ноги на y = 0, лицо на +Z)
BSC=2.6
part=np.where(ARMW>0.5,1,np.where(LEGW>0.5,2,0))[bUsed]   # 0 корпус, 1 рука, 2 нога
body={'n':len(bUsed),'tris':b64(np.array(bTris,dtype='<u2')),'overlap':b64(np.array(oTris,dtype='<u2')),'part':b64(part.astype('u1')),'scale':BSC,
      'NECK_Y':round(NECK_Y,5),'NECK_WORLD':round(NECK_WORLD,5),'HEAD_GROW':GROW}
for g in ('female','male'):
    v=V[g]; J=joints(v); f=frames[g]
    Q=bodyTf(g,v[bUsed])
    # Кольцо шеи тела немного внутрь — под кожей головы.
    lm={}
    for nm,b,end in (('shoulder','upperarm01.L',0),('elbow','lowerarm01.L',0),('wrist','wrist.L',0),('hand','wrist.L',1),
                     ('hip','upperleg01.L',0),('knee','lowerleg01.L',0),('ankle','foot.L',0),('toe','foot.L',1),('neck','neck01',0),('chest','spine01',0),('pelvis','spine05',0),('clavicle','clavicle.L',0)):
        lm[nm]=[round(float(x),4) for x in bodyTf(g,bone(J,b)[end])]
    # Измерения по сетке: промежность, талия, подмышка.
    tor=Q[part!=1]; arm=Q[part==1]
    lm['crotch']=round(float(Q[np.abs(Q[:,0])<0.012][:,1].min()),4)
    ys=np.arange(lm['pelvis'][1]+0.04,lm['chest'][1],0.005)
    wid=[np.abs(tor[np.abs(tor[:,1]-y)<0.015][:,0]).max() for y in ys]
    lm['waist']=round(float(ys[int(np.argmin(wid))]),4); lm['waistW']=round(float(min(wid)),4)
    ap=None
    for y in np.arange(lm['shoulder'][1]-0.03,lm['wrist'][1],-0.005):
        t=tor[np.abs(tor[:,1]-y)<0.006]; a=arm[(np.abs(arm[:,1]-y)<0.006)&(arm[:,0]>0)]
        tt=t[t[:,0]>0]
        if len(tt) and len(a) and a[:,0].min()>tt[:,0].max()+0.004: ap=y; break
    lm['armpit']=round(float(ap),4)
    if g=='female':
        lm['nipple']=[round(float(x),4) for x in bodyTf(g,bone(J,'breast.L')[1])]
    vf,grip,gax=fist(v,'L'); vf,_,_=fist(vf,'R')
    hand_i=np.array([n for n,o in enumerate(bUsed) if HANDW[o]>0],dtype=int)
    FQ=bodyTf(g,vf[bUsed])[hand_i]
    lm['grip']=[round(float(x),4) for x in bodyTf(g,grip)]
    lm['gripAxis']=[round(float(x),4) for x in gax]
    body[g]={'pos':b64(q16(Q,BSC)),'k':round(f['k'],5),'landmarks':lm,'fistIdx':b64(hand_i.astype('<u2')),'fist':b64(q16(FQ,BSC))}
    print(g,'body x',Q[:,0].min().round(3),Q[:,0].max().round(3),'y',Q[:,1].min().round(3),Q[:,1].max().round(3),'z',Q[:,2].min().round(3),Q[:,2].max().round(3))
    print('  landmarks',lm)
with open(f'{OUT}/bodyData.ts','w') as fo:
    fo.write(HDR+'export const BODY_DATA = '+json.dumps(body,separators=(',',':'))+' as const;\n')
print('sizes',os.path.getsize(f'{OUT}/headData.ts'),os.path.getsize(f'{OUT}/bodyData.ts'))

# ── Причёски ── (системные причёски MakeHuman, CC0; привязка к базовой сетке в формате .mhclo,
# упакованная проектом Body Studio: src/body_studio/wardrobe/items/*.json.gz и текстуры static/wardrobe/*.png)
HAIR_SRC=os.environ.get('HAIR_SRC')
HAIR_OUT=os.environ.get('HAIR_OUT')   # папка для текстур (public/hair)
HAIR_STYLES=json.loads(os.environ.get('HAIR_STYLES','{}'))  # {наш стиль: имя ассета}
if HAIR_SRC and HAIR_STYLES:
    import gzip
    from PIL import Image
    def arr(s,code): return np.frombuffer(base64.b64decode(s),code)
    hair={'scale':1.0,'styles':{}}
    HQ={g:headTf(g,V[g][hUsed])-np.array([0,HEAD_Y,0]) for g in ('female','male')}
    for style,name in HAIR_STYLES.items():
        it=json.load(gzip.open(f'{HAIR_SRC}/wardrobe/items/{name}.json.gz'))
        ref=arr(it['ref'],'<i4').reshape(-1,3); w=arr(it['w'],'<f4').reshape(-1,3); off=arr(it['off'],'<f4').reshape(-1,3)
        tris=arr(it['tris'],'<i4'); tuv=arr(it['tuv'],'<i4'); uv=arr(it['uv'],'<f4').reshape(-1,2)
        pairs={}; vi=[]; ui=[]; nt=[]
        for a,b in zip(tris.tolist(),tuv.tolist()):
            k=(a,b)
            if k not in pairs: pairs[k]=len(vi); vi.append(a); ui.append(b)
            nt.append(pairs[k])
        vi=np.array(vi); ui=np.array(ui)
        ent={'n':len(vi),'tris':b64(np.array(nt,dtype='<u2')),'uv':b64(np.round(np.clip(uv[ui],0,1)*65535).astype('<u2'))}
        # Причёска на женской голове; на мужскую её переносит сдвиг ближайших вершин головы
        # (разница форм голов), поэтому хранится одна форма.
        g='female'; v=V[g]
        sc=np.array([abs(v[a][k]-v[b][k])/den for k,(a,b,den) in enumerate(it['scales'])])
        P=(w[:,:,None]*v[ref]).sum(1)+off*sc
        Q=(headTf(g,P)-np.array([0,HEAD_Y,0]))[vi]
        ent['pos']=b64(q16(Q,1.0))
        d=((Q[:,None,:]-HQ[g][None,:,:])**2).sum(2)
        ent['near']=b64(d.argmin(1).astype('<u2'))
        print('hair',style,name,'verts',len(vi),'y',Q[:,1].min().round(3),Q[:,1].max().round(3))
        hair['styles'][style]=ent
        # Текстура: яркость без цвета (цвет задаёт материал), средняя яркость прядей — одинаковая у всех причёсок.
        im=np.asarray(Image.open(f'{HAIR_SRC}/static/wardrobe/{it["texture"]}').convert('RGBA')).astype(np.float32)/255
        L=im[...,0]*0.3+im[...,1]*0.59+im[...,2]*0.11; A=im[...,3]
        # Контраст сжат (степень 0.45): у очень тёмных текстур шум не превращается в белые пряди.
        L=np.clip(0.62*(L/max(1e-3,L[A>0.5].mean()))**0.45,0,1)
        g8=np.round(L*255).astype('u1'); a8=np.round(A*255).astype('u1')
        Image.fromarray(np.dstack([g8,g8,g8,a8]),'RGBA').save(f'{HAIR_OUT}/{style}.webp',quality=80,method=6)
    with open(f'{OUT}/hairData.ts','w') as fo:
        fo.write(HDR.replace('базовой модели MakeHuman','системных причёсок MakeHuman')+'export const HAIR_DATA = '+json.dumps(hair,separators=(',',':'))+' as const;\n')
