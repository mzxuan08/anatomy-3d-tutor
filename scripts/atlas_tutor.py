#!/usr/bin/env python3
"""Read-only Human Atlas inspection and portable, source-labelled learning pages."""
import argparse
import array
import functools
import gzip
import hashlib
import http.server
import json
import math
import os
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
VIEWS = {'front', 'back', 'left', 'right', 'top', 'bottom', 'oblique'}
ORDINALS = ['first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth','eleventh','twelfth']
CHINESE = ['一','二','三','四','五','六','七','八','九','十','十一','十二']

def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))

def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')

def model_dir(project):
    if not project:
        raise ValueError('请用 --atlas 指定 Human Atlas 项目目录，或设置 HUMAN_ATLAS_DIR 环境变量')
    p = Path(project).resolve()
    for candidate in (p / 'public/models', p / 'models', p):
        if (candidate / 'atlas.json').is_file():
            return candidate
    raise ValueError(f'找不到 atlas.json：{p}')

def load_atlas(project, sex):
    folder = model_dir(project)
    manifest = folder / ('atlas-female.json' if sex == 'female' else 'atlas.json')
    atlas = read_json(manifest)
    if atlas.get('sex', sex) != sex:
        raise ValueError('模型性别清单与请求不一致')
    return folder, atlas

@functools.lru_cache(maxsize=1)
def term_records():
    return read_json(ROOT / 'assets/terms-zh.json')['records']

def terminology(name):
    records = term_records()
    key = name.casefold().strip()
    direct = next((r for r in records if r['en'].casefold() == key), None)
    if direct:
        return dict(direct)
    for side, zh in [('right ', '右'), ('left ', '左')]:
        if key.startswith(side):
            base = next((r for r in records if r['en'].casefold() == key[len(side):]), None)
            if base:
                return {**base, 'en': name, 'zh': zh + base['zh'], 'status': 'derived', 'rule': '侧别＋已匹配基词'}
    match = re.fullmatch(r'(\w+) (cervical|thoracic|lumbar) vertebra', key)
    if match and match[1] in ORDINALS:
        ordinal = ORDINALS.index(match[1])
        if ordinal < {'cervical':7, 'thoracic':12, 'lumbar':5}[match[2]]:
            return {'en':name, 'zh':f'第{CHINESE[ordinal]}'+{'cervical':'颈椎','thoracic':'胸椎','lumbar':'腰椎'}[match[2]], 'status':'derived', 'rule':'课件分部与编号＋原始英文序数', 'source':'用户躯干骨课件，PDF第7、10–13页'}
    return {'en':name, 'zh':None, 'status':'unmatched', 'source':None}

def resolve_ids(ids, atlas):
    parts = {p['id']:p for p in atlas['parts']}
    concepts = {c['id']:c for c in atlas.get('concepts', [])}
    result = []
    if not isinstance(ids, list):
        raise ValueError('结构IDs必须为列表')
    for key in ids:
        if key in parts:
            matches = [key]
        elif key in concepts:
            matches = concepts[key]['elements']
        else:
            raise ValueError(f'模型中不存在ID：{key}')
        for item in matches:
            if item not in parts:
                raise ValueError(f'概念引用不存在网格：{key} → {item}')
            if item not in result:
                result.append(item)
    return result

def normalize_lesson(lesson, atlas):
    if not isinstance(lesson.get('title'), str) or not lesson['title'].strip():
        raise ValueError('lesson缺少title')
    steps = lesson.get('steps')
    if not isinstance(steps, list) or not steps:
        raise ValueError('lesson至少需要一个step')
    selected = []
    for step in steps:
        if not isinstance(step.get('title'), str) or not isinstance(step.get('body'), str):
            raise ValueError('每步需要title和body文本')
        step['show'] = resolve_ids(step.get('show'), atlas)
        if not step['show']:
            raise ValueError('每步至少显示一个结构')
        step['highlight'] = resolve_ids(step.get('highlight', []), atlas)
        if not set(step['highlight']).issubset(step['show']):
            raise ValueError('高亮结构必须在本步显示集合中')
        if step.get('view', 'oblique') not in VIEWS:
            raise ValueError('无效相机视角')
        if step.get('layout', 'native') not in {'native', 'compare'}:
            raise ValueError('无效排列方式')
        if not isinstance(step.get('quiz', False), bool):
            raise ValueError('quiz必须为布尔值')
        selected.extend(p for p in step['show'] if p not in selected)
    for key, value in lesson.get('labels', {}).items():
        if key not in selected or not isinstance(value, str):
            raise ValueError(f'无效或未使用的中文标签：{key}')
    return selected

def chunk_path(folder, chunk):
    name = chunk['url'].replace('\\','/').split('/')[-1]
    raw = (folder / name).resolve()
    if raw.parent != folder.resolve():
        raise ValueError('无效模型文件路径')
    if raw.is_file():
        return raw.read_bytes()
    compressed = folder / (name + '.gz')
    if compressed.is_file():
        return gzip.decompress(compressed.read_bytes())
    raise ValueError(f'缺少模型文件：{raw}')

def check_part(part, data):
    n, count = part['vertexCount'], part['indexCount']
    if n <= 0 or count <= 0 or count % 3:
        raise ValueError(f'无效三角网格：{part["id"]}')
    for key, size, alignment in [('positions', n*12, 4), ('normals', n*6, 2), ('indices', count*4, 4)]:
        offset = part[key]
        if not isinstance(offset, int) or offset < 0 or offset % alignment or offset + size > len(data):
            raise ValueError(f'几何缓冲区越界/未对齐：{part["id"]}/{key}')
    positions = array.array('f')
    positions.frombytes(data[part['positions']:part['positions']+n*12])
    indices = array.array('I')
    indices.frombytes(data[part['indices']:part['indices']+count*4])
    if sys.byteorder != 'little':
        positions.byteswap(); indices.byteswap()
    if not all(math.isfinite(v) for v in positions) or max(indices) >= n:
        raise ValueError(f'非有限坐标或三角索引越界：{part["id"]}')
    bounds = part['bounds']
    if len(bounds) != 2 or any(len(row) != 3 for row in bounds):
        raise ValueError(f'无效bounds：{part["id"]}')
    for axis in range(3):
        low, high = bounds[0][axis], bounds[1][axis]
        if not math.isfinite(low) or not math.isfinite(high) or low > high:
            raise ValueError(f'无效范围：{part["id"]}')
        values = positions[axis::3]
        if min(values) < low-0.0002 or max(values) > high+0.0002:
            raise ValueError(f'坐标超出原始bounds：{part["id"]}')

def build(args):
    lesson = read_json(args.lesson)
    sex = lesson.get('sex', 'male')
    if sex not in {'male', 'female'}:
        raise ValueError('sex仅支持male/female')
    folder, atlas = load_atlas(args.atlas, sex)
    ids = normalize_lesson(lesson, atlas)
    out = Path(args.out).resolve()
    if out.exists() and any(out.iterdir()) and not (out / '.anatomy-tutor.json').is_file():
        raise ValueError('拒绝覆盖非本播放器的已有输出目录')
    lookup = {p['id']:p for p in atlas['parts']}
    chunks = {}
    packed = bytearray()
    parts = []
    for key in ids:
        original = lookup[key]
        ci = original['chunk']
        if ci not in chunks:
            chunks[ci] = chunk_path(folder, atlas['chunks'][ci])
            if len(chunks[ci]) != atlas['chunks'][ci]['bytes']:
                raise ValueError(f'源chunk长度不符：{ci}')
        data = chunks[ci]
        check_part(original, data)
        part = dict(original)
        part['original_system'] = part['system']
        part['chunk'] = 0
        part['terminology'] = terminology(part['name'])
        if key in lesson.get('labels', {}):
            part['lesson_label'] = lesson['labels'][key]
        for field, length in [('positions',part['vertexCount']*12), ('normals',part['vertexCount']*6), ('indices',part['indexCount']*4)]:
            while len(packed) % 4:
                packed.append(0)
            part[field] = len(packed)
            start = original[field]
            packed.extend(data[start:start+length])
        check_part(part, packed)
        parts.append(part)
    out.mkdir(parents=True, exist_ok=True)
    (out / 'models').mkdir(exist_ok=True)
    (out / 'models/geometry.bin').write_bytes(packed)
    manifest = {'sex':sex, 'source':atlas.get('source'), 'scope':atlas.get('scope'), 'parts':parts, 'chunks':[{'url':'models/geometry.bin', 'bytes':len(packed)}]}
    write_json(out / 'models/atlas.json', manifest)
    write_json(out / 'lesson.json', lesson)
    for name in ('index.html','viewer.js','style.css','search.css','preview.ps1','launch.cmd'):
        shutil.copy2(ROOT / 'assets/viewer' / name, out / name)
    shutil.copytree(ROOT / 'assets/vendor', out / 'vendor', dirs_exist_ok=True)
    attribution = folder.parent / 'ATTRIBUTION.md'
    if not attribution.is_file():
        raise ValueError('源模型缺少ATTRIBUTION.md，不能分发')
    shutil.copy2(attribution, out / 'ATTRIBUTION.md')
    license_path = Path(args.atlas) / 'LICENSE'
    if license_path.is_file():
        shutil.copy2(license_path, out / 'HUMAN-ATLAS-LICENSE.txt')
    source_manifest = folder / ('atlas-female.json' if sex == 'female' else 'atlas.json')
    receipt = {'format':'anatomy-3d-tutor-v1', 'source_manifest':str(source_manifest), 'source_manifest_sha256':hashlib.sha256(source_manifest.read_bytes()).hexdigest(), 'source_chunk_sha256':{str(ci):hashlib.sha256(data).hexdigest() for ci,data in chunks.items()}, 'sex':sex, 'mesh_count':len(parts), 'sha256':hashlib.sha256(packed).hexdigest(), 'note':'缓冲区检查通过；未经过专业解剖学几何审定'}
    write_json(out / '.anatomy-tutor.json', receipt)
    print(json.dumps({'site':str(out), 'parts':len(parts), 'geometry_bytes':len(packed)}, ensure_ascii=False))

def validate_site(site):
    site = Path(site)
    atlas = read_json(site / 'models/atlas.json')
    lesson = read_json(site / 'lesson.json')
    ids = normalize_lesson(lesson, atlas)
    data = (site / 'models/geometry.bin').read_bytes()
    if len(data) != atlas['chunks'][0]['bytes']:
        raise ValueError('打包几何长度不符')
    for part in atlas['parts']:
        check_part(part, data)
    receipt = read_json(site / '.anatomy-tutor.json')
    if hashlib.sha256(data).hexdigest() != receipt['sha256']:
        raise ValueError('几何SHA256与打包记录不一致')
    for file in ['index.html','viewer.js','style.css','vendor/three.module.js','vendor/OrbitControls.js','vendor/THREE-LICENSE.txt','ATTRIBUTION.md']:
        if not (site / file).is_file():
            raise ValueError(f'缺失页面资源：{file}')
    return {'status':'passed', 'parts':len(ids), 'steps':len(lesson['steps']), 'note':'仅验证格式、引用与几何数据，不代表医学审定'}

def search(args):
    _, atlas = load_atlas(args.atlas, args.sex)
    query = args.query.casefold().strip()
    rows = []
    for kind, records in [('mesh',atlas['parts']),('concept',atlas.get('concepts', []))]:
        for part in records:
            term = terminology(part['name'])
            haystack = ' '.join([part['id'],part['name'],term.get('zh') or '']).casefold()
            if query in haystack:
                rows.append({'kind':kind,'id':part['id'],'en':part['name'],'zh':term.get('zh'),'term_status':term['status'],'system':part.get('system'),'elements':part.get('elements')})
    rows.sort(key=lambda r:(query not in {r['id'].casefold(), r['en'].casefold(), (r['zh'] or '').casefold()},r['kind']!='mesh',r['en']))
    print(json.dumps({'sex':args.sex,'matches':len(rows),'results':rows[:args.limit]}, ensure_ascii=False, indent=2))

def audit(args):
    report = {'note':'术语/元数据筛查；不等同于几何和医学正确性认证', 'models':[]}
    for sex in ['male','female']:
        _, atlas = load_atlas(args.atlas, sex)
        counts = {}
        issues = []
        for p in atlas['parts']:
            state = terminology(p['name'])['status']
            counts[state] = counts.get(state,0)+1
            if p['system'] == 'skeletal' and re.search(r'gingiva|tooth row|tooth',p['name'],re.I):
                issues.append({'id':p['id'], 'en':p['name'], 'original_system':'skeletal', 'issue':'骨骼展示分组包含口腔软组织/牙列，不能直接用于骨学全部骨集合', 'action':'保留原值；骨学主题显式选骨，不按整个system展示'})
        report['models'].append({'sex':sex,'mesh_count':len(atlas['parts']), 'concept_count':len(atlas.get('concepts',[])), 'term_counts':counts, 'classification_flags':issues, 'scope':atlas.get('scope')})
    if args.out:
        Path(args.out).parent.mkdir(parents=True,exist_ok=True)
        write_json(args.out,report)
    print(json.dumps(report,ensure_ascii=False,indent=2))

def explore(args):
    _, atlas = load_atlas(args.atlas, args.sex)
    system_names = {'skeletal':'骨与骨连结','muscular':'肌','arterial':'动脉','venous':'静脉','nervous':'神经','digestive':'消化系统参考结构','respiratory':'呼吸系统参考结构','urinary':'泌尿系统参考结构','reproductive':'生殖系统参考结构','lymphatic':'淋巴参考结构','endocrine':'内分泌参考结构','integumentary':'体表参考','connective':'结缔组织参考','sensory':'感觉器官参考','cardiac':'心脏参考','brain':'脑参考','pregnancy':'妊娠参考','borrowed':'男性来源借用骨','donor-muscle':'第二女性来源下肢肌','oral_reference':'口腔参考结构'}
    groups = {}
    for part in atlas['parts']:
        system = part['system']
        if system == 'skeletal' and re.search(r'gingiva|tooth row|tooth',part['name'],re.I):
            system = 'oral_reference'
        groups.setdefault(system, []).append(part['id'])
    steps = []
    display_order = ['skeletal','muscular','arterial','venous','cardiac','digestive','respiratory','urinary','reproductive','endocrine','lymphatic','nervous','brain','sensory','connective','oral_reference','integumentary','borrowed','donor-muscle','pregnancy']
    for system in sorted(groups, key=lambda key: display_order.index(key) if key in display_order else len(display_order)):
        ids = groups[system]
        if args.system and system != args.system:
            continue
        label = system_names.get(system,system)
        steps.append({'title':label,'body':'先在原位旋转观察整体分布。可用搜索找到具体结构，点击后单独观察，再返回整体。\n\n这是一套参考模型的可用结构，不代表该系统全部解剖结构；精细标志请与课件图核对。','show':ids,'highlight':[],'view':'front','layout':'native','source':'Human Atlas来源清单；教学展示已将牙龈和牙列另列为口腔参考，不修改源网格分类。','prompt':'提出你看不懂的位置、名称或关系，我会在聊天中针对这一处讲解。','quiz':False})
    if not steps:
        raise ValueError('没有匹配的展示分组')
    temporary = Path(args.lesson)
    temporary.parent.mkdir(parents=True,exist_ok=True)
    write_json(temporary,{'title':'Human Atlas · 中文学习版','sex':args.sex,'intro':'按结构探索，结合课件解答疑难。中文术语保留出处与状态；未匹配结构显示英文。展示分组不等于教材中的人体系统划分。','sources':[{'title':'Human Atlas / BodyParts3D / HRA，详见模型来源文件'}],'steps':steps})
    build(args)

def pdf(args):
    from pypdf import PdfReader
    reader = PdfReader(args.path)
    pages = [int(x) for x in args.pages.split(',')] if args.pages else range(1,len(reader.pages)+1)
    result = {'source':str(Path(args.path).resolve()), 'page_count':len(reader.pages), 'note':'文字提取，图示仍需逐页查看', 'pages':[]}
    for n in pages:
        if n < 1 or n > len(reader.pages):
            raise ValueError(f'页码越界：{n}')
        result['pages'].append({'pdf_page':n,'text':reader.pages[n-1].extract_text() or ''})
    if args.out:
        Path(args.out).parent.mkdir(parents=True,exist_ok=True)
        write_json(args.out,result)
    else:
        print(json.dumps(result,ensure_ascii=False,indent=2))

def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command',required=True)
    default = os.environ.get('HUMAN_ATLAS_DIR') or read_json(ROOT / 'assets/local-config.json').get('atlas_project') or None
    for name in ['search','audit','build','explore']:
        p = sub.add_parser(name)
        p.add_argument('--atlas',default=default)
        if name == 'search':
            p.add_argument('--query',required=True); p.add_argument('--sex',choices=['male','female'],default='male'); p.add_argument('--limit',type=int,default=15)
        elif name == 'audit':
            p.add_argument('--out')
        elif name == 'build':
            p.add_argument('--lesson',required=True); p.add_argument('--out',required=True)
        else:
            p.add_argument('--lesson',required=True); p.add_argument('--out',required=True); p.add_argument('--sex',choices=['male','female'],default='male'); p.add_argument('--system')
    p = sub.add_parser('pdf'); p.add_argument('--path',required=True); p.add_argument('--pages'); p.add_argument('--out')
    p = sub.add_parser('validate'); p.add_argument('--site',required=True)
    p = sub.add_parser('serve'); p.add_argument('--site',required=True); p.add_argument('--port',type=int,default=8765)
    args = parser.parse_args()
    try:
        if args.command == 'search': search(args)
        elif args.command == 'audit': audit(args)
        elif args.command == 'build': build(args)
        elif args.command == 'explore': explore(args)
        elif args.command == 'pdf': pdf(args)
        elif args.command == 'validate': print(json.dumps(validate_site(args.site),ensure_ascii=False))
        elif args.command == 'serve':
            validate_site(args.site)
            handler = functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(Path(args.site).resolve()))
            server = http.server.ThreadingHTTPServer(('127.0.0.1',args.port),handler)
            print(f'http://127.0.0.1:{args.port}/',flush=True)
            server.serve_forever()
    except (ValueError, OSError, KeyError) as e:
        print(f'错误：{e}',file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
