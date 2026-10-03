import copy
import struct
import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'scripts'))
import atlas_tutor as tutor


class LandmarkTests(unittest.TestCase):
    def setUp(self):
        self.atlas = {'parts':[{'id':'bone','bounds':[[0,0,0],[1,1,1]]}], 'concepts':[]}
        self.lesson = {'title':'demo','steps':[{'title':'observe','body':'','show':['bone']}],
                       'landmarks':[{'id':'body','part':'bone','label':'body','point':[.5,.8,.5],
                                     'radius':.1,'view':'top','source':'book, figure 1',
                                     'review':'surface checked in top and side views','steps':[0],
                                     'geometry_sha256':'a'*64,'triangle':0,'cue':'observe the region'}]}

    def test_landmark_requires_traceable_surface_review(self):
        for field in ['source','review','geometry_sha256']:
            lesson=copy.deepcopy(self.lesson)
            del lesson['landmarks'][0][field]
            with self.assertRaises(ValueError):
                tutor.normalize_lesson(lesson,self.atlas)

    def test_landmark_rejects_nonfinite_outside_or_wrong_step(self):
        for patch in [{'point':[float('nan'),0,0]}, {'point':[2,0,0]}, {'radius':-1},
                      {'part':'missing'}, {'steps':[1]}, {'view':'unknown'}]:
            lesson=copy.deepcopy(self.lesson)
            lesson['landmarks'][0].update(patch)
            with self.assertRaises(ValueError):
                tutor.normalize_lesson(lesson,self.atlas)

    def test_valid_landmark_is_accepted(self):
        self.assertEqual(tutor.normalize_lesson(self.lesson,self.atlas),['bone'])

    def test_supporting_lesson_link_rejects_external_or_path_escape(self):
        for url in ['https://example.com','../private/','C:/private','javascript:alert(1)']:
            self.lesson['related_lessons']=[{'title':'other','url':url,'scope':'separate model'}]
            with self.assertRaises(ValueError):
                tutor.normalize_lesson(self.lesson,self.atlas)

    def test_geometry_change_or_off_surface_anchor_is_rejected(self):
        data=struct.pack('<9f3I',0,0,0,1,0,0,0,1,0,0,1,2)
        part={'id':'bone','vertexCount':3,'indexCount':3,'positions':0,'indices':36}
        mark=self.lesson['landmarks'][0]
        mark['geometry_sha256']=tutor.geometry_fingerprint(part,data)
        mark['point']=[1/3,1/3,0]
        tutor.check_landmark_geometry(self.lesson,[part],data)
        for patch in [{'point':[.5,.5,0]}, {'triangle':1}, {'geometry_sha256':'a'*64}]:
            lesson=copy.deepcopy(self.lesson)
            lesson['landmarks'][0].update(patch)
            with self.assertRaises(ValueError):
                tutor.check_landmark_geometry(lesson,[part],data)


if __name__=='__main__':
    unittest.main()
