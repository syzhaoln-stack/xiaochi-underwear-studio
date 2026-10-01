"""Blender-authored teaching assets. Coordinates use metres, Z up, -Y front.
The GLB export converts this to Y up, +Z front. No cloth simulation is claimed.
Run: blender --background --python blender/build_assets.py
"""
import bpy, math, json, os, subprocess
from mathutils import Vector

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS=os.path.join(ROOT,'assets')
os.makedirs(ASSETS,exist_ok=True)
# Use the same released drafting engine for transferred wings and flat cut pieces.
# Three centimetres is only this downloadable scene's adjustable demonstration value.
draft_command="import {draft} from './pattern.js';const mid=draft({seamShift:3,rise:'mid',frontLength:18,backLength:21,sideSeam:9});const high=draft({seamShift:3,rise:'high',frontLength:26,backLength:29,sideSeam:17});if(!mid.valid||!high.valid)throw Error([...mid.errors,...high.errors].join(';'));console.log(JSON.stringify({mid,high}));"
DRAFTS=json.loads(subprocess.run(['node','--input-type=module','--eval',draft_command],cwd=ROOT,check=True,capture_output=True,encoding='utf8').stdout)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for dat in list(bpy.data.materials): bpy.data.materials.remove(dat)

def material(name,color,rough=.72):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=rough
    return m
porcelain=material('Porcelain · neutral teaching mannequin',(.76,.78,.76),.56)
terracotta=material('Cotton lycra · mauve front',(.456,.212,.332))
backmat=material('Cotton lycra · violet back with transferred front wings',(.262,.165,.347))
gussetmat=material('Outer gusset · sage',(.178,.332,.314))
liningmat=material('Cotton gusset lining · ivory gold',(.737,.521,.220))
trimat=material('Elastic binding and relocated seam C',(.085,.041,.083))
reference_mat=material('Original body side reference · white dashes',(.95,.95,.95))
slate=material('Ink',(.16,.18,.17))
floor_mat=material('Warm studio background',(.91,.88,.82),.9)

PROFILE=[(0,.110,.084,0),(.025,.149,.112,0),(.060,.176,.132,0),(.120,.190,.140,0),(.200,.182,.127,0),(.270,.169,.115,0),(.350,.158,.106,0),(.450,.156,.105,0)]
def profile(z):
    if z<=0:return PROFILE[0][1:]
    if z>=.45:return PROFILE[-1][1:]
    for a,b in zip(PROFILE,PROFILE[1:]):
        if a[0]<=z<=b[0]:
            t=(z-a[0])/(b[0]-a[0]);return tuple(a[i]*(1-t)+b[i]*t for i in range(1,4))

def mesh_object(name,verts,faces,mat):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob)
    if mat:ob.data.materials.append(mat)
    for p in mesh.polygons:p.use_smooth=True
    return ob

def ring_body(name,rings,cx=0,n=96):
    vv=[];ff=[]
    for z,rx,ry,cy in rings:
        for j in range(n):
            ang=j/n*2*math.pi;vv.append((cx+rx*math.sin(ang),cy-ry*math.cos(ang),z))
    for i in range(len(rings)-1):
        for j in range(n):
            a=i*n+j;b=i*n+(j+1)%n;ff.append((a,b,b+n,a+n))
    ff.append(tuple(range(n-1,-1,-1)));ff.append(tuple((len(rings)-1)*n+j for j in range(n)))
    return mesh_object(name,vv,ff,porcelain)

torso_rings=[(-.007,.018,.05,0),(0,.110,.084,0),(.012,.130,.099,0),(.025,.149,.112,0),(.060,.176,.132,0),(.09,.187,.139,0),(.120,.190,.140,0),(.16,.187,.135,0),(.200,.182,.127,0),(.270,.169,.115,0),(.350,.158,.106,0),(.410,.156,.105,0),(.45,.156,.105,0)]
body=ring_body('Mannequin · lower torso',torso_rings)
legs=[]
for sign,label in [(-1,'left'),(1,'right')]:
    rings=[(-.350,.067,.078,0),(-.346,.069,.080,0),(-.29,.073,.085,0),(-.20,.078,.093,0),(-.11,.083,.103,0),(-.035,.089,.114,0),(.045,.094,.124,0),(.105,.080,.106,0),(.13,.04,.06,0)]
    legs.append(ring_body('Mannequin · '+label+' thigh',rings,sign*.102))
bpy.ops.object.select_all(action='DESELECT')
for ob in [body]+legs:ob.select_set(True)
bpy.context.view_layer.objects.active=body;bpy.ops.object.join()
rem=body.modifiers.new('Joined smooth pelvis and thighs','REMESH');rem.mode='VOXEL';rem.voxel_size=.0038;rem.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=rem.name)
smooth=body.modifiers.new('Soft educational silhouette','SMOOTH');smooth.factor=.7;smooth.iterations=9
bpy.ops.object.modifier_apply(modifier=smooth.name)
sub=body.modifiers.new('Presentation smoothness','SUBSURF');sub.levels=1;sub.render_levels=1
bpy.ops.object.modifier_apply(modifier=sub.name)
decimate=body.modifiers.new('Lightweight web mesh','DECIMATE');decimate.ratio=.16
bpy.ops.object.modifier_apply(modifier=decimate.name)
body.name='Teaching mannequin · waist 84 / hip 104 · m'
body['purpose']='Neutral lower-body display, no anatomical details. Not a scanned human or fit certification.'
body['axis_glb']='Y up, Z front; waist Y=.35, hip Y=.12, crotch near Y=0'
body['profile_glb']=json.dumps(PROFILE)
bpy.ops.object.select_all(action='DESELECT');body.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(ASSETS,'mannequin.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True)

def solidify(ob,thick=.0012):
    sol=ob.modifiers.new('Fabric thickness · illustrative','SOLIDIFY');sol.thickness=thick;sol.offset=0
    bevel=ob.modifiers.new('Soft edge','BEVEL');bevel.width=.0006;bevel.segments=2

def curve(name,coords,radius,mat):
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.resolution_u=12
    sp=data.splines.new('POLY');sp.points.add(len(coords)-1)
    for p,co in zip(sp.points,coords):p.co=(*co,1)
    data.bevel_depth=radius;data.bevel_resolution=3
    ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);ob.data.materials.append(mat);return ob

def perimeter(a,b):
    h=((a-b)/(a+b))**2
    return math.pi*(a+b)*(1+3*h/(10+math.sqrt(4-3*h)))

def radial_scale(height,p,waist_height):
    hip=p['hip']/104;rx,rz,_=profile(waist_height);waist=p['waist']/(perimeter(rx,rz)*100)
    t=max(0,min(1,(height-.12)/max(.05,waist_height-.12)))
    return hip+(waist-hip)*t*t*(3-2*t)

def make_garment(name,model,center=(0,0,0)):
    result=[];p=model['params'];mapping=model['seamShift']
    waist=.35 if p['rise']=='high' else .27
    side_bottom=waist-p['sideSeam']/100;crotch=.014
    def surface(theta,v):
        back=math.cos(theta)<-1e-10;side=abs(math.sin(theta))
        join_width=p['gussetBack' if back else 'gussetFront']/100
        r0=profile(crotch)[0]*radial_scale(crotch,p,waist)+.006
        threshold=max(.07,min(.66,join_width/2/r0))
        blend=max(0,min(1,(side-threshold)/(1-threshold)))
        bottom=crotch+(side_bottom-crotch)*blend**.77
        height=bottom*(1-v)+waist*v
        rx,rz,_=profile(height);scale=radial_scale(height,p,waist)
        return ((rx*scale+.006)*math.sin(theta),-(rz*scale+.006)*math.cos(theta),height)
    def shifted_angle(v,fraction,start=0):
        samples=[(start,0)];prev=Vector(surface(start,v));distance=0
        for i in range(1,193):
            theta=start+(math.pi/2-start)*i/192;point=Vector(surface(theta,v));distance+=(point-prev).length;samples.append((theta,distance));prev=point
        target=distance*(1-max(0,min(.94,fraction)))
        for a,b in zip(samples,samples[1:]):
            if b[1]>=target:return a[0]+(b[0]-a[0])*(target-a[1])/max(1e-9,b[1]-a[1])
        return math.pi/2
    start=math.asin(max(.07,min(.66,p['gussetFront']/200/(profile(crotch)[0]*radial_scale(crotch,p,waist)+.006))))
    top_angle=shifted_angle(1,mapping['frontWaistFraction']);bottom_angle=shifted_angle(0,mapping['frontLegFraction'],start)
    def panel_point(back,u,v):
        boundary=bottom_angle*(1-v)+top_angle*v
        theta=math.pi-(2*u-1)*(math.pi-boundary) if back else (2*u-1)*boundary
        point=surface(theta,v);return tuple(point[i]+center[i] for i in range(3))
    for back in [False,True]:
        verts=[];faces=[];nt=64;nv=32
        for row in range(nv+1):
            for j in range(nt+1):
                verts.append(panel_point(back,j/nt,row/nv))
        for i in range(nv):
            for j in range(nt):
                a=i*(nt+1)+j;face=(a,a+1,a+nt+2,a+nt+1)
                faces.append(face if not back else tuple(reversed(face)))
        ob=mesh_object(name+(' · back panel' if back else ' · front panel'),verts,faces,backmat if back else terracotta);solidify(ob);result.append(ob)
        ob['construction']='One main fabric panel; joins at the two side seams and gusset.'
        ob['seamShift_cm']=mapping['amount'];ob['seam_note']='C is relocated toward the front. Rear panel continues across the original side line. 3 cm is an example, never a fixed finger-width conversion.'
        result.append(curve(name+' · '+('back' if back else 'front')+' leg binding',verts[:nt+1],.002,trimat))
    for sign in [-1,1]:
        result.append(curve(name+' · relocated seam C '+str(sign),[panel_point(False,0 if sign<0 else 1,i/64) for i in range(65)],.0016,trimat))
        for i in range(0,48,3):
            coords=[]
            for j in range(3):
                point=list(surface(sign*math.pi/2,(i+j)/48));point[0]+=sign*.0016
                coords.append(tuple(point[k]+center[k] for k in range(3)))
            result.append(curve(name+' · original side dashed reference '+str(sign)+' '+str(i),coords,.00105,reference_mat))
    verts=[];faces=[];nr=36;nc=10
    for r in range(nr+1):
        t=r/nr;depth=profile(crotch)[1]*radial_scale(crotch,p,waist)+.006
        z=-.016+.030*(abs(2*t-1)**2.2);width=(p['gussetFront']*(1-t)+p['gussetBack']*t)/100*(1-.18*math.sin(math.pi*t))
        radius=profile(crotch)[0]*radial_scale(crotch,p,waist)+.006
        for c in range(nc+1):
            x=(c/nc-.5)*width;y=(-depth+2*depth*t)*math.sqrt(max(.65,1-(x/radius)**2))
            verts.append((x+center[0],y+center[1],z+center[2]))
    for r in range(nr):
        for c in range(nc):
            a=r*(nc+1)+c;faces.append((a,a+1,a+nc+2,a+nc+1))
    gus=mesh_object(name+' · outer gusset',verts,faces,gussetmat);solidify(gus);result.append(gus)
    lining=mesh_object(name+' · inner gusset lining',[(x,y,z+.003) for x,y,z in verts],faces,liningmat);solidify(lining,.0007);result.append(lining)
    rx,rz,_=profile(waist);scale=radial_scale(waist,p,waist)
    points=[((rx*scale+.006)*math.sin(2*math.pi*i/128)+center[0],-(rz*scale+.006)*math.cos(2*math.pi*i/128)+center[1],waist+center[2]) for i in range(129)]
    result.append(curve(name+' · waist elastic binding',points,.003,trimat))
    return result

garment=make_garment('High-rise demonstration',DRAFTS['high'])
for ob in garment:ob['note']='Visual construction only, not an automatically validated sewing pattern or physical cloth simulation.'
mid=make_garment('Mid-rise demonstration',DRAFTS['mid'],(.56,0,0))
body2=body.copy();body2.data=body.data.copy();bpy.context.collection.objects.link(body2);body2.location.x=.56;body2.name='Mid-rise display mannequin'
for mannequin,model,waist in [(body,DRAFTS['high'],.35),(body2,DRAFTS['mid'],.27)]:
    for vertex in mannequin.data.vertices:
        scale=radial_scale(vertex.co.z,model['params'],waist);vertex.co.x*=scale;vertex.co.y*=scale

# Four true separate flat meshes, arranged as cut pieces for the educational .blend.
def flat_panel(piece,location,mat):
    verts=[(location[0]+x/100,location[1]+y/100,location[2]) for x,y in piece['seamPoints']]
    ob=mesh_object('Flat '+piece['id']+' · actual mid-rise engine seam polygon',verts,[tuple(range(len(verts)))],mat);solidify(ob)
    ob['grain']='Greatest fabric stretch runs across width; gusset lining is cotton.';ob['seamShift_cm']=3
    ob['source']='pattern.js draft({seamShift:3,rise:mid}); seam outline only, no allowance.'
    if piece['id']=='back':
        for side in ['sideLeft','sideRight']:
            a,b=piece['references'][side]['points']
            for i in range(0,18,3):
                coords=[]
                for j in range(3):
                    t=(i+j)/18;coords.append((location[0]+(a[0]*(1-t)+b[0]*t)/100,location[1]+(a[1]*(1-t)+b[1]*t)/100,location[2]+.0015))
                curve('Flat back · original side reference '+side+str(i),coords,.0007,reference_mat)
    return ob
flat_front=flat_panel(DRAFTS['mid']['pieces'][0],(-.60,-.23,-.347),terracotta)
flat_back=flat_panel(DRAFTS['mid']['pieces'][1],(-.59,.23,-.347),backmat)
flat_gusset=flat_panel(DRAFTS['mid']['pieces'][2],(-.87,.005,-.345),gussetmat)
flat_lining=flat_panel(DRAFTS['mid']['pieces'][3],(-.98,.005,-.340),liningmat)

def label(text,loc,size=.022):
    bpy.ops.object.text_add(location=loc,rotation=(math.pi/2,0,0))
    ob=bpy.context.object;ob.name='Label · '+text;ob.data.body=text;ob.data.align_x='CENTER';ob.data.size=size;ob.data.extrude=0;ob.data.materials.append(slate);return ob
label('HIGH RISE',(0,-.21,.51),.028)
label('MID RISE',(.56,-.21,.51),.028)
label('4 SEPARATE CUT PIECES',(-.62,-.38,-.29),.021)
label('C SEAM +3 cm FRONT · EXAMPLE',(0,-.23,.55),.018)

bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.36));ground=bpy.context.object;ground.name='Studio floor';ground.data.materials.append(floor_mat)
bpy.ops.object.camera_add(location=(.95,-2.80,1.35));cam=bpy.context.object
target=Vector((-.15,.02,.075));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.05
bpy.context.scene.camera=cam
for name,loc,power,size in [('Large soft key',(-1.3,-1.8,2.2),420,3),('Gentle fill',(1.6,-.5,1.3),190,2),('Top rim',(.3,1.7,2),300,2)]:
    bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.name=name;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(Vector((0,0,.1))-light.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.world.color=(.5,.5,.5);scene.view_settings.view_transform='AgX'
scene.view_settings.exposure=-.9
scene.unit_settings.system='METRIC';scene.unit_settings.length_unit='CENTIMETERS'
scene['READ_ME']='Teaching scene: two rise examples, two mannequins, four separate flat cut pieces. Body and garments are Blender-authored illustrative geometry. Flat pieces are the exact default mid-rise net seam polygons from the app drafting engine at seamShift=3 cm; seam allowances are omitted. Use the web SVG output for printing. No physical cloth simulation or fit guarantee.'
scene['construction_order']='01 Join front to outer gusset; 02 sandwich cotton gusset lining; 03 join back to gusset; 04 close side seams; 05 attach waist and leg elastics.'
scene['seamShift_cm']=3
scene['seamShift_note']='Both C seams are moved toward the front; the back piece wraps past the white dashed original side references. The 3 cm demonstration is not a fixed conversion of one-and-a-half finger widths. Flat pieces use the same app drafting engine.'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ASSETS,'briefs-demo.blend'))
scene.render.filepath=os.path.join(ASSETS,'blender-preview.png');bpy.ops.render.render(write_still=True)
with open(os.path.join(ASSETS,'mannequin-profile.json'),'w',encoding='utf8') as f:
    json.dump({'units':'m','axis':'Y up; front +Z','torso_profile_y_rx_rz_zCenter':PROFILE,'waist_y':.35,'hip_y':.12,'crotch_y_approx':0,'upper_cut_y':.45,'leg_bottom_y':-.35,'hip_circumference_approx_cm':104,'waist_circumference_approx_cm':84,'source':'Blender 4.5.13, blender/build_assets.py','note':'Illustrative smooth mannequin; dimensions approximate after surface smoothing.'},f,ensure_ascii=False,indent=2)
print('BLENDER_ASSETS_COMPLETE '+ASSETS)
