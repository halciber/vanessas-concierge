import http.server
import json
import os
import urllib.parse

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class ConciergeRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        
        # 1. API: List Files in subdirectory
        if parsed_url.path == '/api/list-files':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                
                path_array = data.get('pathArray', [])
                target_dir = os.path.join(DIRECTORY, 'data', *path_array)
                
                files = []
                if os.path.exists(target_dir):
                    for name in os.listdir(target_dir):
                        if os.path.isfile(os.path.join(target_dir, name)) and name.endswith('.md'):
                            files.append(name)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'files': files}).encode('utf-8'))
            except Exception as e:
                self.send_error_response(e)

        # 2. API: Write file inside data subdirectory
        elif parsed_url.path == '/api/write-file':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                
                path_array = data.get('pathArray', [])
                filename = data.get('filename', '')
                content = data.get('content', '')
                
                target_dir = os.path.join(DIRECTORY, 'data', *path_array)
                os.makedirs(target_dir, exist_ok=True)
                target_file = os.path.join(target_dir, filename)
                
                with open(target_file, 'w', encoding='utf-8') as f:
                    f.write(content)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'success'}).encode('utf-8'))
            except Exception as e:
                self.send_error_response(e)

        # 3. API: Delete file inside data subdirectory
        elif parsed_url.path == '/api/delete-file':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                
                path_array = data.get('pathArray', [])
                filename = data.get('filename', '')
                
                target_file = os.path.join(DIRECTORY, 'data', *path_array, filename)
                if os.path.exists(target_file):
                    os.remove(target_file)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'success'}).encode('utf-8'))
            except Exception as e:
                self.send_error_response(e)
        else:
            self.send_response(404)
            self.end_headers()

    def send_error_response(self, exception):
        try:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(exception)}).encode('utf-8'))
        except Exception as e:
            print("Failed to send error response:", e)

    def do_OPTIONS(self):
        # Support CORS preflight
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

if __name__ == '__main__':
    print(f"Starting Concierge Local Server on http://localhost:{PORT}...")
    server = http.server.HTTPServer(('localhost', PORT), ConciergeRequestHandler)
    server.serve_forever()
