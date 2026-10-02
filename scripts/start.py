#!/usr/bin/env python3
"""Launch the bundled lesson without an atlas checkout or extra dependencies."""
import argparse
import functools
import http.server
from pathlib import Path
import sys
import threading
import webbrowser
from atlas_tutor import ROOT, validate_site

def main():
    parser = argparse.ArgumentParser(description='Open a local anatomy lesson')
    parser.add_argument('--site', default=str(ROOT / 'examples/spine-demo'))
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--no-open', action='store_true')
    args = parser.parse_args()
    site = Path(args.site).resolve()
    try:
        validate_site(site)
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(site))
        try:
            server = http.server.ThreadingHTTPServer(('127.0.0.1', args.port), handler)
        except OSError:
            if args.port == 0:
                raise
            server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        url = f'http://127.0.0.1:{server.server_port}/'
        print(f'Anatomy lesson: {url}\nKeep this window open. Ctrl+C stops the server.', flush=True)
        if not args.no_open:
            threading.Timer(.3, lambda: webbrowser.open(url)).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
    except (ValueError, OSError, KeyError) as error:
        print(f'Unable to open lesson: {error}', file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
