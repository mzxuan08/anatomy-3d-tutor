import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import atlas_tutor as tutor


class LearningContentTests(unittest.TestCase):
    def setUp(self):
        self.lesson = {'title':'demo', 'steps':[{'title':'observe','body':'','show':['bone']}],
                       'courseware':[{'id':'course','title':'course','source_path':'source.pdf','pages':[1]}]}

    def test_page_bindings_must_exist(self):
        self.lesson['steps'][0]['course_pages'] = [{'document':'course','page':2}]
        with self.assertRaises(ValueError):
            tutor.validate_learning_content(self.lesson, ['bone'])

    def test_duplicate_pages_and_path_escape_rejected(self):
        for doc in [{'id':'../escape','title':'c','pages':[1]},
                    {'id':'course','title':'c','source_path':'x','pages':[1,1]},
                    {'id':'course','title':'c','pages':[{'number':1,'image':'../private.png'}]}]:
            self.lesson['courseware'] = [doc]
            with self.assertRaises(ValueError):
                tutor.validate_learning_content(self.lesson, ['bone'])

    def test_guide_requires_source_and_model_support(self):
        card = {'title':'difference','ids':['bone'],'items':[{'label':'a','cue':'look','support':'limited'}],
                'source':{'title':'book','locator':'chapter 1'}}
        self.lesson['comparisons'] = [card]
        tutor.validate_learning_content(self.lesson, ['bone'])
        for mutation in ['source','support','ids']:
            bad = copy.deepcopy(card)
            if mutation == 'source': bad['source'] = {}
            elif mutation == 'support': bad['items'][0]['support'] = 'unknown'
            else: bad['ids'] = ['missing']
            self.lesson['comparisons'] = [bad]
            with self.assertRaises(ValueError):
                tutor.validate_learning_content(self.lesson, ['bone'])

    @unittest.skipUnless(importlib.util.find_spec('pymupdf'), 'optional PyMuPDF unavailable')
    def test_render_exact_page_and_record_origin_without_private_path(self):
        import pymupdf
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with pymupdf.open() as pdf:
                pdf.new_page().insert_text((40,40), 'PAGE ONE')
                pdf.new_page().insert_text((40,40), 'PAGE TWO')
                pdf.save(root/'source.pdf')
            self.lesson['courseware'][0]['pages'] = [2]
            tutor.preflight_courseware(self.lesson, root/'lesson.json')
            hashes = tutor.render_courseware(self.lesson, root/'out', root/'lesson.json')
            doc = self.lesson['courseware'][0]
            self.assertNotIn('source_path', doc)
            self.assertEqual(doc['pages'][0]['number'], 2)
            self.assertEqual(doc['source_sha256'], hashlib.sha256((root/'source.pdf').read_bytes()).hexdigest())
            image = root/'out'/doc['pages'][0]['image']
            self.assertEqual(hashes[doc['pages'][0]['image']], hashlib.sha256(image.read_bytes()).hexdigest())
            self.assertFalse((root/'out/courseware/course/page-1.png').exists())

    @unittest.skipUnless(importlib.util.find_spec('pymupdf'), 'optional PyMuPDF unavailable')
    def test_out_of_range_source_rejected_before_output(self):
        import pymupdf
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with pymupdf.open() as pdf:
                pdf.new_page()
                pdf.save(root/'source.pdf')
            self.lesson['courseware'][0]['pages'] = [2]
            with self.assertRaises(ValueError):
                tutor.preflight_courseware(self.lesson, root/'lesson.json')
            self.assertFalse((root/'out').exists())


if __name__ == '__main__':
    unittest.main()
