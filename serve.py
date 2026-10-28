"""Static dev server for the cockpit with caching disabled, so edits always show on reload.
Usage: python3 serve.py [port]   (default 8791)"""
import http.server
import socketserver
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8791
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", port), NoCache) as httpd:
    print(f"Serving cockpit on http://localhost:{port}")
    httpd.serve_forever()
