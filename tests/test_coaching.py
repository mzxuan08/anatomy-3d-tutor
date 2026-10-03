import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import atlas_tutor as tutor


class CoachingTests(unittest.TestCase):
    def setUp(self):
        self.lesson = {'title': 'demo', 'steps': [{
            'title': 'observe', 'body': 'look', 'show': ['bone'], 'source': 'book chapter 1',
            'prompt': 'why?', 'answer': 'because', 'hints': ['look from above'],
            'guide': [{'cue': 'look', 'view': 'top', 'focus': 'bone'}],
            'exercise': {'kind': 'point', 'target': 'bone', 'criteria': ['explain shape']}
        }]}

    def test_valid_coaching(self):
        tutor.validate_coaching(self.lesson)

    def test_reject_unsupported_guidance_and_targets(self):
        for field, value in [('guide', [{'cue': 'look', 'view': 'fake'}]),
                             ('guide', [{'cue': 'look', 'view': 'top', 'focus': 'missing'}]),
                             ('guide', [{'cue': 'look', 'view': 'top', 'landmark': 'missing'}]),
                             ('exercise', {'kind': 'point', 'target': 'missing', 'criteria': ['look']}),
                             ('hints', ['']), ('source', '')]:
            lesson = copy.deepcopy(self.lesson)
            lesson['steps'][0][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                tutor.validate_coaching(lesson)

    def test_no_teaching_animation_in_blind_quiz(self):
        self.lesson['steps'][0]['quiz'] = True
        with self.assertRaises(ValueError):
            tutor.validate_coaching(self.lesson)

    def test_relation_requires_native_layout(self):
        self.lesson['steps'][0]['exercise']['kind'] = 'relation'
        self.lesson['steps'][0]['layout'] = 'compare'
        with self.assertRaises(ValueError):
            tutor.validate_coaching(self.lesson)


if __name__ == '__main__':
    unittest.main()
