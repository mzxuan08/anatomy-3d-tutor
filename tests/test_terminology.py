"""Terminology acceptance, ambiguous anatomy and bounded composition regressions."""
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import atlas_tutor as tutor


class TerminologyTests(unittest.TestCase):
    def test_every_displayed_base_has_locatable_evidence(self):
        tutor.term_index()
        for record in tutor.term_records():
            term = tutor.terminology(record['en'])
            if term.get('zh'):
                self.assertTrue(tutor.supported(record), record['en'])
                self.assertTrue(term['sources'])

    def test_missing_evidence_and_unapproved_status_fail_closed(self):
        for record in [
            {'en':'unknown','zh':'不能显示','status':'reference-matched','sources':[]},
            {'en':'unknown','zh':'不能显示','status':'review-needed','sources':[{'source_id':'x','locator':'page 1'}]},
            {'en':'unknown','zh':'不能显示','status':'reference-matched','sources':[{'source_id':'x'}]},
        ]:
            with patch.object(tutor, 'term_index', return_value={'unknown':record}), patch.object(tutor, 'term_data', return_value={'sources':{'x':{}}}):
                term=tutor.terminology('unknown')
                self.assertIsNone(term['zh'])
                self.assertEqual(term['status'],'review-needed')

    def test_duplicate_english_alias_is_rejected(self):
        records=[{'en':'one','aliases_en':['same']},{'en':'same'}]
        tutor.term_index.cache_clear()
        try:
            with patch.object(tutor, 'term_records', return_value=records):
                with self.assertRaises(ValueError):tutor.term_index()
        finally:
            tutor.term_index.cache_clear()

    def test_reference_status_needs_bilingual_and_textbook_evidence(self):
        rec={'en':'unapproved','zh':'不能显示','status':'reference-matched','sources':[{'source_id':'x','locator':'chapter 1'}]}
        with patch.object(tutor,'term_index',return_value={'unapproved':rec}),patch.object(tutor,'term_data',return_value={'sources':{'x':{'kind':'textbook'}}}):
            self.assertIsNone(tutor.terminology('unapproved')['zh'])

    def test_side_is_explicit_and_midline_terms_are_not_prefixed(self):
        self.assertEqual(tutor.terminology('Left kidney')['zh'],'左肾')
        for name in ['Left aorta','Left third ventricle','Left pineal body']:
            self.assertIsNone(tutor.terminology(name)['zh'])

    def test_reference_entries_keep_anatomical_distinctions(self):
        self.assertEqual(tutor.terminology('Third ventricle')['zh'],'第三脑室')
        self.assertEqual(tutor.terminology('Right ventricle')['zh'],'右心室')
        self.assertEqual(tutor.terminology('Right hepatic duct')['zh'],'肝右管')
        self.assertEqual(tutor.terminology('Left infraspinatus muscle')['zh'],'左冈下肌')

    def test_numbered_bone_templates_have_bounds(self):
        self.assertEqual(tutor.terminology('Right twelfth rib')['zh'],'右第十二肋')
        self.assertEqual(tutor.terminology('Left fifth metacarpal bone')['zh'],'左第五掌骨')
        for name in ['Right thirteenth rib','Left sixth metacarpal bone','Left eleventh costal cartilage','Eighth cervical vertebra','Sixth lumbar vertebra']:
            self.assertIsNone(tutor.terminology(name)['zh'],name)

    def test_hand_and_foot_phalanges_are_not_conflated(self):
        self.assertEqual(tutor.terminology('Proximal phalanx of left index finger')['zh'],'左示指近节指骨')
        self.assertEqual(tutor.terminology('Proximal phalanx of left second toe')['zh'],'左第2趾近节趾骨')
        self.assertIsNone(tutor.terminology('Proximal phalanx')['zh'])
        self.assertEqual(tutor.terminology('Middle phalanx of right thumb')['status'],'review-needed')
        self.assertEqual(tutor.terminology('Middle phalanx of left big toe')['status'],'review-needed')

    def test_qualified_names_not_silently_shortened(self):
        for name in ['Intervertebral disk of axis','Branch of left renal artery','Cavity of left ventricle','Posterior part of left kidney']:
            self.assertIsNone(tutor.terminology(name)['zh'],name)

    def test_search_normalizes_number_and_approved_alias(self):
        self.assertEqual(tutor.normalized('第３颈椎'),tutor.normalized('第三颈椎'))
        self.assertEqual(tutor.normalized('第五掌骨'),tutor.normalized('第5掌骨'))
        term=tutor.terminology('Left kidney')
        self.assertIn('左肾脏',tutor.term_search_text('Left kidney',term))

    def test_teaching_groups_distinguish_brain_from_heart(self):
        self.assertEqual(tutor.teaching_system({'name':'Third ventricle','system':'cardiac'}),'nervous')
        self.assertEqual(tutor.teaching_system({'name':'Cavity of left ventricle','system':'cardiac'}),'cardiac')
        self.assertEqual(tutor.teaching_system({'name':'Left levator scapulae','system':'skeletal'}),'muscular')


if __name__ == '__main__':
    unittest.main()
