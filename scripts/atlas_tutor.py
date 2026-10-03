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
import unicodedata

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
def term_data():
    return read_json(ROOT / 'assets/terms-zh.json')

def term_records():
    return term_data()['records']

def normalized(value):
    value = ' '.join(unicodedata.normalize('NFKC', value).casefold().split())
    values = dict(zip(CHINESE, range(1,13)))
    return re.sub(r'第(十二|十一|十|九|八|七|六|五|四|三|二|一)(?=颈椎|胸椎|腰椎|肋|掌骨|跖骨|脑室|趾|指)', lambda m:f'第{values[m[1]]}', value)

@functools.lru_cache(maxsize=1)
def term_index():
    result = {}
    for record in term_records():
        for name in [record['en'], *record.get('aliases_en', [])]:
            key = normalized(name)
            if key in result:
                raise ValueError(f'术语英文键或别名重复：{name}')
            result[key] = record
    return result

def supported(record):
    if record.get('status') not in {'textbook-matched', 'course-matched', 'reference-matched'} or not record.get('zh'):
        return False
    refs = record.get('sources', [])
    sources = term_data().get('sources', {})
    if not refs or not all(ref.get('source_id') in sources and (ref.get('locator') or (ref.get('term_id') and ref.get('pdf_page'))) for ref in refs):
        return False
    kinds = {sources[ref['source_id']].get('kind') for ref in refs}
    required = {'textbook-matched':{'textbook'}, 'course-matched':{'course'}, 'reference-matched':{'textbook','bilingual-reference'}}[record['status']]
    return required.issubset(kinds)

def derived(name, zh, records, rule, aliases=None):
    refs = []
    for record in records:
        for ref in record.get('sources', []):
            if ref not in refs:
                refs.append(dict(ref))
    if not refs:
        return None
    return {'en':name, 'zh':zh, 'status':'derived', 'sources':refs, 'rule':rule, 'aliases_zh':aliases or [], 'note':'；'.join(r['note'] for r in records if r.get('note')), 'review_note':'仅作限定命名组合；不是逐项医学审定'}

def terminology(name):
    records = term_index()
    key = normalized(name)
    direct = records.get(key)
    if direct:
        if supported(direct):
            return {**direct, 'en':name}
        return {'en':name, 'zh':None, 'status':'review-needed', 'sources':direct.get('sources', []), 'review_note':'译名或证据待复核，保留原始英文'}
    for side, zh in [('right ', '右'), ('left ', '左')]:
        if key.startswith(side):
            base = records.get(key[len(side):])
            if base and supported(base) and base.get('allow_side'):
                return derived(name, zh + base['zh'], [base], '明确左右侧别＋允许侧别的已匹配基词', [zh+a for a in base.get('aliases_zh', [])])
    match = re.fullmatch(r'(\w+) (cervical|thoracic|lumbar) vertebra', key)
    if match and match[1] in ORDINALS:
        ordinal = ORDINALS.index(match[1])
        if ordinal < {'cervical':7, 'thoracic':12, 'lumbar':5}[match[2]]:
            base = records.get('vertebra')
            if base and supported(base):
                return derived(name, f'第{CHINESE[ordinal]}'+{'cervical':'颈椎','thoracic':'胸椎','lumbar':'腰椎'}[match[2]], [base], '限定颈7/胸12/腰5的编号模板，不处理变异')
    match = re.fullmatch(r'(left|right) (\w+) (rib|costal cartilage|metacarpal bone|metatarsal bone)', key)
    if match and match[2] in ORDINALS:
        ordinal = ORDINALS.index(match[2])
        base = records.get(match[3])
        if ordinal < {'rib':12, 'costal cartilage':10, 'metacarpal bone':5, 'metatarsal bone':5}[match[3]] and base and supported(base):
            prefix = {'left':'左', 'right':'右'}[match[1]] + f'第{CHINESE[ordinal]}'
            return derived(name, prefix+base['zh'], [base], '明确左右与序数＋限定肋/肋软骨/掌跖骨模板', [prefix+a for a in base.get('aliases_zh',[])])
    match = re.fullmatch(r'(proximal|middle|distal) phalanx of (left|right) (thumb|index finger|middle finger|ring finger|little finger|big toe|second toe|third toe|fourth toe|little toe)', key)
    if match:
        section, side, digit = match.groups()
        if section == 'middle' and digit in {'thumb','big toe'}:
            return {'en':name, 'zh':None, 'status':'review-needed', 'review_note':'拇指/拇趾通常无中节指趾骨，不能机械翻译'}
        foot = digit.endswith('toe')
        label = {'thumb':'拇指','index finger':'示指','middle finger':'中指','ring finger':'环指','little finger':'小指','big toe':'拇趾','second toe':'第2趾','third toe':'第3趾','fourth toe':'第4趾','little toe':'第5趾'}[digit]
        segment = {'proximal':'近节','middle':'中节','distal':'远节'}[section] + ('趾骨' if foot else '指骨')
        components = term_data().get('components', {}).get(section+' phalanx', [])
        refs = [r for r in components if r.get('zh') == segment and r.get('source_id') in term_data().get('sources', {}) and r.get('term_id') and r.get('pdf_page')]
        digit_refs = term_data().get('components', {}).get('great toe' if digit=='big toe' else digit, [])
        refs += [{k:v for k,v in r.items() if k!='zh'} for r in digit_refs]
        if refs:
            zh = {'left':'左','right':'右'}[side] + label + segment
            return derived(name, zh, [{'sources':refs}], '原名明确区分指与趾、侧别、指序及节段；拇指/拇趾仅两节', [zh.replace('示指','食指')] if digit=='index finger' else [])
    return {'en':name, 'zh':None, 'status':'unmatched', 'sources':[]}

def term_search_text(name, term):
    return normalized(' '.join([name, term.get('zh') or '', *term.get('aliases_zh', []), *term.get('aliases_en', [])]))

def teaching_system(part):
    system = part['system']
    name = normalized(part['name'])
    if system == 'skeletal' and re.search(r'gingiva|tooth row|tooth', name):
        return 'oral_reference'
    if system == 'cardiac' and name in {'third ventricle','fourth ventricle','interventricular foramen','left lateral ventricle','right lateral ventricle'}:
        return 'nervous'
    base = re.sub(r'^(left|right) ', '', name)
    if system == 'skeletal' and base in {'subscapularis','tibialis posterior','levator scapulae'}:
        return 'muscular'
    if system == 'skeletal' and base == 'iliotibial tract':
        return 'connective'
    return system

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

def validate_learning_content(lesson, selected):
    documents = lesson.get('courseware', [])
    if not isinstance(documents, list):
        raise ValueError('courseware必须为文档列表')
    known = {}
    for document in documents:
        key = document.get('id', '')
        if not re.fullmatch(r'[a-zA-Z0-9_-]+', key) or key in known or not document.get('title'):
            raise ValueError('课件需要唯一安全ID与标题')
        numbers = []
        for page in document.get('pages', []):
            number = page if type(page) is int else page.get('number') if isinstance(page, dict) else None
            if type(page) is int and not document.get('source_path'):
                raise ValueError('打包后的课件页必须包含图片路径')
            if type(number) is not int or number < 1 or number in numbers:
                raise ValueError('课件页序必须为唯一正整数')
            if isinstance(page, dict) and (page.get('image') is not None or not document.get('source_path')) and page.get('image') != f'courseware/{key}/page-{number}.png':
                raise ValueError('课件图片路径不匹配页序')
            numbers.append(number)
        if not numbers:
            raise ValueError('课件必须明确需要的页序')
        known[key] = numbers
    for step in lesson['steps']:
        for ref in step.get('course_pages', []):
            if ref.get('document') not in known or ref.get('page') not in known[ref['document']]:
                raise ValueError('学习步骤引用了未打包的课件页')
    for card in lesson.get('comparisons', []):
        ids = card.get('ids', [])
        if not ids or not set(ids).issubset(selected) or not card.get('title') or not card.get('source', {}).get('title'):
            raise ValueError('易混点卡需要有效结构、标题与出处')
        if not card.get('items') or any(type(i) is not int or not 0 <= i < len(lesson['steps']) for i in card.get('steps', [])):
            raise ValueError('易混点卡缺少观察内容或步骤无效')
        source = card['source']
        if not source.get('pages') and not source.get('locator'):
            raise ValueError('易混点依据需要页序或具体章节定位')
        for item in card['items']:
            if not set(item.get('ids', [])).issubset(ids) or not item.get('label') or not item.get('cue') or item.get('support') not in {'visible','limited','course-only'} or item.get('view', 'oblique') not in VIEWS:
                raise ValueError('观察提示必须有模型支持程度、内容与有效视角')

def preflight_courseware(lesson, lesson_path):
    if not lesson.get('courseware'):
        return
    try:
        import pymupdf
    except ImportError as exc:
        raise ValueError('课件页联动需要PyMuPDF') from exc
    for document in lesson['courseware']:
        source = document.get('source_path')
        if not source:
            raise ValueError('构建课件联动需要source_path指向本地PDF')
        path = Path(source)
        if not path.is_absolute():
            path = Path(lesson_path).resolve().parent / path
        with pymupdf.open(path) as pdf:
            numbers = [p if type(p) is int else p['number'] for p in document['pages']]
            if not pdf.is_pdf or pdf.is_encrypted or max(numbers) > len(pdf):
                raise ValueError('课件需要可读取PDF，且页序不能超过文件范围')

def render_courseware(lesson, out, lesson_path):
    if not lesson.get('courseware'):
        return {}
    try:
        import pymupdf as fitz
    except ImportError as exc:
        raise ValueError('课件页联动需要PyMuPDF；请安装pymupdf或使用包含它的Python运行时') from exc
    hashes = {}
    for document in lesson['courseware']:
        source = document.get('source_path')
        if not source:
            raise ValueError('构建课件联动需要source_path指向本地PDF')
        pdf_path = Path(source)
        if not pdf_path.is_absolute():
            pdf_path = Path(lesson_path).resolve().parent / pdf_path
        pdf = fitz.open(pdf_path)
        if not pdf.is_pdf:
            raise ValueError('课件来源必须为PDF')
        document['source_sha256'] = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
        output_pages = []
        for item in document['pages']:
            number = item if type(item) is int else item['number']
            if number > len(pdf):
                raise ValueError('课件页序超出源PDF范围')
            page = pdf[number-1]
            name = f'courseware/{document["id"]}/page-{number}.png'
            target = out / name
            target.parent.mkdir(parents=True, exist_ok=True)
            scale = min(2, 1600 / max(page.rect.width, page.rect.height))
            page.get_pixmap(matrix=fitz.Matrix(scale,scale), alpha=False).save(target)
            hashes[name] = hashlib.sha256(target.read_bytes()).hexdigest()
            output_pages.append({'number':number, 'image':name, 'caption':item.get('caption', '') if isinstance(item, dict) else ''})
        document['pages'] = output_pages
        document.pop('source_path')
        pdf.close()
    return hashes

def validate_coaching(lesson):
    marks = {m['id']: m for m in lesson.get('landmarks', [])}
    for index, step in enumerate(lesson['steps']):
        guide, hints, exercise = step.get('guide', []), step.get('hints', []), step.get('exercise')
        if not (guide or hints or exercise):
            continue
        if not isinstance(step.get('source'), str) or not step['source'].strip():
            raise ValueError('演示、提示和练习需要本步具体出处')
        if not isinstance(guide, list) or len(guide) > 12 or (guide and step.get('quiz')):
            raise ValueError('演示最多12段，盲测步骤不能配置讲解演示')
        for frame in guide:
            if not isinstance(frame, dict) or not isinstance(frame.get('cue'), str) or not frame['cue'].strip() or frame.get('view') not in VIEWS:
                raise ValueError('演示需要观察提示与有效视角')
            if frame.get('focus') and frame['focus'] not in step['show']:
                raise ValueError('演示聚焦必须使用本步结构')
            if 'dim' in frame and type(frame['dim']) is not bool:
                raise ValueError('淡化选项必须为布尔值')
            if frame.get('dim') and not frame.get('focus'):
                raise ValueError('淡化演示必须指定聚焦结构')
            if frame.get('landmark'):
                mark = marks.get(frame['landmark'])
                if not mark or index not in mark['steps'] or mark['part'] not in step['show']:
                    raise ValueError('演示只能引用本步已核对的观察点')
        if not isinstance(hints, list) or len(hints) > 3 or any(not isinstance(h, str) or not h.strip() for h in hints):
            raise ValueError('分级提示须为1–3条非空文本')
        if hints and not step.get('prompt'):
            raise ValueError('提示需要对应问题')
        if exercise:
            if not isinstance(exercise, dict) or exercise.get('kind') not in {'point', 'explain', 'compare', 'relation'} or not step.get('prompt') or not step.get('answer'):
                raise ValueError('练习需要类型、题干和核对解释')
            criteria = exercise.get('criteria')
            if not isinstance(criteria, list) or not 1 <= len(criteria) <= 6 or any(not isinstance(c, str) or not c.strip() for c in criteria):
                raise ValueError('练习需要1–6条核对要点')
            if exercise['kind'] == 'point' and exercise.get('target') not in step['show']:
                raise ValueError('自动点选核验仅支持本步整块网格')
            if exercise['kind'] == 'relation' and step.get('layout', 'native') != 'native':
                raise ValueError('空间关系练习需要原位显示')


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
        source = lesson.get('label_sources', {}).get(key)
        if not isinstance(source, str) or not source.strip():
            raise ValueError(f'中文课内标注需要label_sources中的具体依据：{key}')
    validate_learning_content(lesson, selected)
    parts = {p['id']:p for p in atlas['parts']}
    keys = set()
    for mark in lesson.get('landmarks', []):
        point = mark.get('point', [])
        part = parts.get(mark.get('part'))
        if not re.fullmatch(r'[a-zA-Z0-9_-]+', mark.get('id', '')) or mark['id'] in keys or not part or part['id'] not in selected:
            raise ValueError('局部标志需要唯一安全ID和本课真实结构')
        keys.add(mark['id'])
        if not all(isinstance(mark.get(k), str) and mark[k].strip() for k in ['label','cue','source','review']) or not re.fullmatch(r'[a-f0-9]{64}', mark.get('geometry_sha256','')):
            raise ValueError('局部标志需要名称、观察提示、出处、表面核对记录与几何指纹')
        if len(point) != 3 or any(type(v) not in (int,float) or not math.isfinite(v) or not part['bounds'][0][i] <= v <= part['bounds'][1][i] for i,v in enumerate(point)):
            raise ValueError('局部标志坐标无效或超出原网格范围')
        radius = mark.get('radius')
        if type(radius) not in (int,float) or not math.isfinite(radius) or not 0 < radius <= max(part['bounds'][1][i]-part['bounds'][0][i] for i in range(3))*.3:
            raise ValueError('局部观察着色范围无效或过大')
        if mark.get('view') not in VIEWS or not mark.get('steps') or any(type(i) is not int or not 0 <= i < len(steps) or part['id'] not in steps[i]['show'] for i in mark['steps']):
            raise ValueError('局部标志需要有效视角与显示对应结构的步骤')
        if type(mark.get('triangle')) is not int or mark['triangle'] < 0:
            raise ValueError('观察点必须定位到原网格三角面')
        if mark.get('course_page'):
            ref=mark['course_page']
            if not any(d['id']==ref.get('document') and ref.get('page') in [p if type(p) is int else p['number'] for p in d['pages']] for d in lesson.get('courseware', [])):
                raise ValueError('局部标志引用了未打包的课件页')
    for link in lesson.get('related_lessons', []):
        if not link.get('title') or not link.get('scope') or not re.fullmatch(r'related/[a-zA-Z0-9_-]+/', link.get('url','')):
            raise ValueError('补充学习链接必须是站内related目录及明确的独立模型说明')
    validate_coaching(lesson)
    return selected

def geometry_fingerprint(part, data):
    return hashlib.sha256(b''.join(data[part[k]:part[k]+n] for k,n in [('positions',part['vertexCount']*12),('indices',part['indexCount']*4)])).hexdigest()

def check_landmark_geometry(lesson, parts, data):
    lookup = {p['id']:p for p in parts}
    for mark in lesson.get('landmarks', []):
        part=lookup[mark['part']]
        if geometry_fingerprint(part, data) != mark['geometry_sha256']:
            raise ValueError('局部标志的几何版本不符，需要重新核对表面位置')
        if mark['triangle'] >= part['indexCount']//3:
            raise ValueError('局部标志三角面越界')
        import struct
        indices=struct.unpack_from('<3I',data,part['indices']+mark['triangle']*12)
        points=[struct.unpack_from('<3f',data,part['positions']+i*12) for i in indices]
        center=[sum(p[axis] for p in points)/3 for axis in range(3)]
        if any(abs(a-b)>1e-6 for a,b in zip(center,mark['point'])):
            raise ValueError('局部观察点与核对三角面不一致')

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
    preflight_courseware(lesson, args.lesson)
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
        part['teaching_system'] = teaching_system(part)
        part['chunk'] = 0
        part['terminology'] = terminology(part['name'])
        if key in lesson.get('labels', {}):
            part['lesson_label'] = lesson['labels'][key]
            part['lesson_label_source'] = lesson['label_sources'][key]
        for field, length in [('positions',part['vertexCount']*12), ('normals',part['vertexCount']*6), ('indices',part['indexCount']*4)]:
            while len(packed) % 4:
                packed.append(0)
            part[field] = len(packed)
            start = original[field]
            packed.extend(data[start:start+length])
        check_part(part, packed)
        parts.append(part)
    check_landmark_geometry(lesson, parts, packed)
    out.mkdir(parents=True, exist_ok=True)
    (out / 'models').mkdir(exist_ok=True)
    (out / 'models/geometry.bin').write_bytes(packed)
    manifest = {'sex':sex, 'source':atlas.get('source'), 'scope':atlas.get('scope'), 'parts':parts, 'terminology_sources':term_data().get('sources', {}), 'chunks':[{'url':'models/geometry.bin', 'bytes':len(packed)}]}
    write_json(out / 'models/atlas.json', manifest)
    course_hashes = render_courseware(lesson, out, args.lesson)
    if lesson.get('courseware'):
        for source in lesson.get('sources', []):
            source.pop('path', None)
    write_json(out / 'lesson.json', lesson)
    for name in ('index.html','viewer.js','learning-tools.js','study-record.js','landmarks.js','coaching.js','style.css','search.css','preview.ps1','launch.cmd'):
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
    receipt = {'format':'anatomy-3d-tutor-v1', 'source_manifest':source_manifest.name, 'source_manifest_sha256':hashlib.sha256(source_manifest.read_bytes()).hexdigest(), 'source_chunk_sha256':{str(ci):hashlib.sha256(data).hexdigest() for ci,data in chunks.items()}, 'sex':sex, 'mesh_count':len(parts), 'sha256':hashlib.sha256(packed).hexdigest(), 'note':'缓冲区检查通过；未经过专业解剖学几何审定'}
    if course_hashes:
        receipt['course_page_sha256'] = course_hashes
        receipt['courseware_scope'] = '本地课程节选，不随技能自动开源'
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
    check_landmark_geometry(lesson, atlas['parts'], data)
    receipt = read_json(site / '.anatomy-tutor.json')
    if hashlib.sha256(data).hexdigest() != receipt['sha256']:
        raise ValueError('几何SHA256与打包记录不一致')
    for document in lesson.get('courseware', []):
        for page in document['pages']:
            image = site / page['image']
            if not image.is_file() or hashlib.sha256(image.read_bytes()).hexdigest() != receipt.get('course_page_sha256', {}).get(page['image']):
                raise ValueError('课件页缺失或与构建记录不一致')
    for file in ['learning-tools.js','study-record.js','landmarks.js','coaching.js','index.html','viewer.js','style.css','vendor/three.module.js','vendor/OrbitControls.js','vendor/THREE-LICENSE.txt','ATTRIBUTION.md']:
        if not (site / file).is_file():
            raise ValueError(f'缺失页面资源：{file}')
    return {'status':'passed', 'parts':len(ids), 'steps':len(lesson['steps']), 'note':'仅验证格式、引用与几何数据，不代表医学审定'}

def search(args):
    _, atlas = load_atlas(args.atlas, args.sex)
    query = normalized(args.query)
    if not query:
        raise ValueError('搜索词不能为空')
    rows = []
    for kind, records in [('mesh',atlas['parts']),('concept',atlas.get('concepts', []))]:
        for part in records:
            term = terminology(part['name'])
            haystack = normalized(part['id']) + ' ' + term_search_text(part['name'], term)
            if query in haystack:
                rows.append({'kind':kind,'id':part['id'],'en':part['name'],'zh':term.get('zh'),'term_status':term['status'],'sources':term.get('sources', []),'rule':term.get('rule'),'aliases_zh':term.get('aliases_zh', []),'system':part.get('system'),'elements':part.get('elements')})
    rows.sort(key=lambda r:(query not in {normalized(r['id']), normalized(r['en']), normalized(r['zh'] or ''), *map(normalized, r['aliases_zh'])},r['kind']!='mesh',r['en']))
    print(json.dumps({'sex':args.sex,'matches':len(rows),'results':rows[:args.limit]}, ensure_ascii=False, indent=2))

def audit(args):
    term_index()
    report = {'note':'覆盖指可追溯中文名称（含限定规则派生）；不等同于医学或几何正确性认证', 'base_term_count':len(term_records()), 'terminology_sources':term_data().get('sources', {}), 'models':[]}
    for sex in (['male','female'] if args.sex=='all' else [args.sex]):
        if sex=='female' and args.sex=='all' and not (model_dir(args.atlas)/'atlas-female.json').is_file():
            report['models'].append({'sex':sex,'availability':'missing','note':'该数据项目没有女性清单，未计算覆盖率'})
            continue
        _, atlas = load_atlas(args.atlas, sex)
        counts = {}
        issues = []
        by_system = {}
        for p in atlas['parts']:
            term = terminology(p['name'])
            state = term['status']
            counts[state] = counts.get(state,0)+1
            group=by_system.setdefault(p['system'], {'mesh_count':0, 'covered':0, 'derived':0, 'unmatched_sample':[]})
            group['mesh_count'] += 1
            if term.get('zh'):
                group['covered'] += 1
                group['derived'] += int(state=='derived')
            elif len(group['unmatched_sample'])<10:
                group['unmatched_sample'].append({'id':p['id'],'en':p['name'],'status':state})
            taught = teaching_system(p)
            if taught != p['system']:
                issues.append({'id':p['id'], 'en':p['name'], 'original_system':p['system'], 'teaching_system':taught, 'issue':'原展示分组与已核对的结构归属不同', 'action':'保留原始元数据；仅在伴学显示分组调整', 'term_sources':term.get('sources', [])})
        covered = sum(group['covered'] for group in by_system.values())
        report['models'].append({'sex':sex,'mesh_count':len(atlas['parts']), 'concept_count':len(atlas.get('concepts',[])), 'covered_mesh_count':covered, 'coverage_percent':round(covered/len(atlas['parts'])*100,2) if atlas['parts'] else 0, 'term_counts':counts, 'by_display_system':by_system, 'classification_flags':issues, 'scope':atlas.get('scope')})
    if args.out:
        Path(args.out).parent.mkdir(parents=True,exist_ok=True)
        write_json(args.out,report)
    print(json.dumps(report,ensure_ascii=False,indent=2))

def explore(args):
    _, atlas = load_atlas(args.atlas, args.sex)
    system_names = {'skeletal':'骨与骨连结','muscular':'肌','arterial':'动脉','venous':'静脉','nervous':'神经','digestive':'消化系统参考结构','respiratory':'呼吸系统参考结构','urinary':'泌尿系统参考结构','reproductive':'生殖系统参考结构','lymphatic':'淋巴参考结构','endocrine':'内分泌参考结构','integumentary':'体表参考','connective':'结缔组织参考','sensory':'感觉器官参考','cardiac':'心脏参考','brain':'脑参考','pregnancy':'妊娠参考','borrowed':'男性来源借用骨','donor-muscle':'第二女性来源下肢肌','oral_reference':'口腔参考结构'}
    groups = {}
    for part in atlas['parts']:
        system = teaching_system(part)
        groups.setdefault(system, []).append(part['id'])
    steps = []
    display_order = ['skeletal','muscular','arterial','venous','cardiac','digestive','respiratory','urinary','reproductive','endocrine','lymphatic','nervous','brain','sensory','connective','oral_reference','integumentary','borrowed','donor-muscle','pregnancy']
    for system in sorted(groups, key=lambda key: display_order.index(key) if key in display_order else len(display_order)):
        ids = groups[system]
        if args.system and system != args.system:
            continue
        label = system_names.get(system,system)
        steps.append({'title':label,'body':'先在原位旋转观察整体分布。可用搜索找到具体结构，点击后单独观察，再返回整体。\n\n这是一套参考模型的可用结构，不代表该系统全部解剖结构；精细标志请与课件图核对。','show':ids,'highlight':[],'view':'front','layout':'native','source':'Human Atlas来源清单；伴学分组仅调整已确认的口腔、脑室及少量肌/筋膜归属，原始分组仍保留。','prompt':'提出你看不懂的位置、名称或关系，我会在聊天中针对这一处讲解。','quiz':False})
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
            p.add_argument('--sex',choices=['male','female','all'],default='all')
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
