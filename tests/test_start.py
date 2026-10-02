import json
from pathlib import Path
import socket
import subprocess
import sys
import unittest
import urllib.request


class StartTests(unittest.TestCase):
    def test_bundled_course_starts_from_other_directory_and_busy_port(self):
        root = Path(__file__).resolve().parents[1]
        with socket.socket() as occupied:
            occupied.bind(('127.0.0.1', 0))
            occupied.listen()
            port = occupied.getsockname()[1]
            process = subprocess.Popen(
                [sys.executable, str(root/'scripts/start.py'), '--port', str(port), '--no-open'],
                cwd=root.parent, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                line = process.stdout.readline().strip()
                self.assertTrue(line.startswith('Anatomy lesson: http://127.0.0.1:'), line)
                url = line.removeprefix('Anatomy lesson: ')
                self.assertNotIn(f':{port}/', url)
                with urllib.request.urlopen(url+'lesson.json', timeout=5) as response:
                    lesson = json.loads(response.read().decode('utf-8'))
                self.assertGreater(len(lesson['steps']), 1)
                with urllib.request.urlopen(url+'study-record.js', timeout=5) as response:
                    self.assertEqual(response.status, 200)
            finally:
                process.terminate()
                process.communicate(timeout=5)


if __name__ == '__main__':
    unittest.main()
