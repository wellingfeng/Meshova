"""Side-by-side comparison of Meshova SBS reproductions vs the reference bakes.

Sheet columns per material:
 [ref lit | ours lit | ref base | ours base | ref rough | ours rough | ref normal | ours normal]
Prints per-channel L1 diff so we see where to push next.
"""
import os, numpy as np
from PIL import Image

REF = r"E:/BaiduNetdiskDownload/519/Materials_99_procedural_Vol2/Materials_99_procedural_Vol2/Textures"
OURS = r"E:/Meshova/out/sbs-compare"
RES = 256
L = np.array([0.4, 0.5, 0.75]); L = L/np.linalg.norm(L)

def load(path, mode, size=RES):
    return np.asarray(Image.open(path).convert(mode).resize((size,size)), dtype=np.float32)/255.0

def find(d, key):
    if not os.path.isdir(d): return None
    for fn in os.listdir(d):
        l = fn.lower()
        if not (l.endswith('.jpg') or l.endswith('.png')): continue
        if 'normalogl' in l: continue
        if key in l: return os.path.join(d, fn)
    return None

def srgb2lin(c): return np.where(c<=0.04045, c/12.92, ((c+0.055)/1.055)**2.4)
def lin2srgb(c):
    c=np.clip(c,0,1); return np.where(c<=0.0031308, c*12.92, 1.055*(c**(1/2.4))-0.055)

def lit(base_srgb, normal_rgb, ao):
    base=srgb2lin(base_srgb); n=normal_rgb*2-1
    n=n/(np.linalg.norm(n,axis=2,keepdims=True)+1e-6)
    ndotl=np.clip((n*L).sum(2),0,1)[...,None]
    return (np.clip(lin2srgb(base*(0.35+0.65*ndotl)*ao[...,None]),0,1)*255).astype(np.uint8)

def g(a): return (np.clip(a,0,1)*255).astype(np.uint8)

def panel(name, rd, od):
    ref_b=load(find(rd,'basecolor'),'RGB'); our_b=load(os.path.join(od,f'{name}_baseColor.png'),'RGB')
    ref_r=load(find(rd,'roughness'),'L');   our_r=load(os.path.join(od,f'{name}_roughness.png'),'L')
    ref_n=load(find(rd,'normal'),'RGB');    our_n=load(os.path.join(od,f'{name}_normal.png'),'RGB')
    rao=find(rd,'ambientocclusion'); oao=os.path.join(od,f'{name}_ao.png')
    ref_ao=load(rao,'L') if rao else np.ones((RES,RES),np.float32)
    our_ao=load(oao,'L') if os.path.exists(oao) else np.ones((RES,RES),np.float32)
    rl=lit(ref_b,ref_n,ref_ao); ol=lit(our_b,our_n,our_ao)
    db=float(np.abs(ref_b-our_b).mean()); dr=float(np.abs(ref_r-our_r).mean())
    dl=float(np.abs(rl.astype(float)-ol.astype(float)).mean()/255)
    tiles=[rl,ol,g(ref_b),g(our_b),g(ref_r),g(our_r),g(ref_n),g(our_n)]
    row=np.zeros((RES,RES*len(tiles),3),np.uint8)
    for i,t in enumerate(tiles):
        if t.ndim==2: t=np.stack([t]*3,2)
        row[:,i*RES:(i+1)*RES]=t
    return row,db,dr,dl

# cover every baked recipe under OURS/ (skip the stitched sheet + summary pngs)
names=sorted(d for d in os.listdir(OURS)
             if os.path.isdir(os.path.join(OURS,d)) and os.path.isdir(os.path.join(REF,d)))
rows=[]
print(f"{'material':24} {'dBase':>7} {'dRough':>7} {'dLit':>7}")
tot=[0,0,0]; diffs=[]
for n in names:
    row,db,dr,dl=panel(n, os.path.join(REF,n), os.path.join(OURS,n))
    rows.append(row); tot[0]+=db; tot[1]+=dr; tot[2]+=dl; diffs.append((db,dr,dl))
    print(f"{n:24} {db:7.3f} {dr:7.3f} {dl:7.3f}")
print(f"{'MEAN':24} {tot[0]/len(names):7.3f} {tot[1]/len(names):7.3f} {tot[2]/len(names):7.3f}")

# --- labelled contact sheet: name column + column headers + per-row diff ------
from PIL import ImageDraw, ImageFont
def font(sz):
    for f in ("C:/Windows/Fonts/msyh.ttc","C:/Windows/Fonts/segoeui.ttf","arial.ttf"):
        try: return ImageFont.truetype(f, sz)
        except Exception: pass
    return ImageFont.load_default()
LAB=200; HEAD=28; ncol=8
body=np.vstack(rows)
H=body.shape[0]+HEAD
W=LAB+body.shape[1]
sheet=Image.new('RGB',(W,H),(14,17,22))
sheet.paste(Image.fromarray(body),(LAB,HEAD))
d=ImageDraw.Draw(sheet); f=font(15); fs=font(12)
heads=['参考·光照','复现·光照','参考·底色','复现·底色','参考·粗糙','复现·粗糙','参考·法线','复现·法线']
for i,h in enumerate(heads):
    d.text((LAB+i*RES+6,7),h,fill=(230,237,243),font=fs)
for r,n in enumerate(names):
    y=HEAD+r*RES
    db,dr,dl=diffs[r]
    d.text((8,y+8),n,fill=(230,237,243),font=f)
    d.text((8,y+34),f"dBase {db:.3f}",fill=(139,152,165),font=fs)
    d.text((8,y+52),f"dRough {dr:.3f}",fill=(139,152,165),font=fs)
    d.text((8,y+70),f"dLit {dl:.3f}",fill=(77,163,255),font=fs)
sheet.save(os.path.join(OURS,'_compare_sheet.png'))
print("\ncols: [ref lit|ours lit|ref base|ours base|ref rough|ours rough|ref normal|ours normal]")
print("sheet ->", os.path.join(OURS,'_compare_sheet.png'))

