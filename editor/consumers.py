import json
import asyncio
import pty
import os
import re
import uuid
import shutil
import subprocess
from channels.generic.websocket import AsyncWebsocketConsumer


class CodeConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()
        self.proc = None
        self.fd = None
        self.temp_to_clean = None

    async def disconnect(self, close_code):
        if self.proc and self.proc.returncode is None:
            self.proc.terminate()
            await self.proc.wait()
        self.cleanup_files()

    async def receive(self, text_data):
        data = json.loads(text_data)
        action = data.get('action')

        if action == 'run':
            language = data.get('language')
            code = data.get('code')
            if self.proc and self.proc.returncode is None:
                self.proc.terminate()
            await self.execute_code(language, code)

        elif action == 'input' and self.fd is not None:
            os.write(self.fd, data['data'].encode())

        elif action == 'stop':
            if self.proc and self.proc.returncode is None:
                self.proc.terminate()

    async def execute_code(self, language, code):
        command, self.temp_to_clean = self.prepare_command(language, code)
        if not command:
            try:
                await self.send(text_data=json.dumps({'output': 'Error: Could not prepare command.'}))
            except Exception:
                pass
            self.cleanup_files()
            return

        master, slave = pty.openpty()
        self.fd = master

        try:
            self.proc = await asyncio.create_subprocess_exec(
                *command, stdin=slave, stdout=slave, stderr=slave
            )
        finally:
            os.close(slave)
        
        asyncio.create_task(self.stream_output())

    async def stream_output(self):
        while self.proc and self.proc.returncode is None:
            try:
                data = await asyncio.to_thread(os.read, self.fd, 1024)
                if data:
                    try:
                        await self.send(text_data=json.dumps({'output': data.decode(errors='ignore')}))
                    except Exception:
                        pass
                else:
                    break
            except (IOError, OSError):
                break
        
        if self.proc:
            await self.proc.wait()
        
        try:
            await self.send(text_data=json.dumps({'event': 'finished'}))
        except Exception:
            pass

    def prepare_command(self, language, code):
        unique_id = str(uuid.uuid4())
        
        if language == 'python':
            source_file = f"/tmp/{unique_id}.py"
            with open(source_file, "w") as f:
                f.write(code)
            return ["python3", "-u", source_file], source_file

        elif language == 'java':
            pub_match = re.search(r'public\s+class\s+(\w+)', code)
            if pub_match:
                class_name = pub_match.group(1)
            else:
                match = re.search(r'class\s+(\w+)[^{]*\{(?:[^{}]|\{[^}]*\})*public\s+static\s+void\s+main', code, re.DOTALL)
                if not match:
                    asyncio.create_task(self.send(text_data=json.dumps({'output': 'Error: No class with main() method found.'})))
                    return None, None
                class_name = match.group(1)
            
            temp_dir = f"/tmp/{unique_id}"
            os.makedirs(temp_dir, exist_ok=True)
            source_file = os.path.join(temp_dir, f"{class_name}.java")
            
            with open(source_file, "w") as f:
                f.write(code)
            
            compile_proc = subprocess.run(
                ["javac", "-J-Xms32m", "-J-Xmx128m", source_file],
                capture_output=True, text=True
            )
            if compile_proc.returncode != 0:
                error_output = f"Compilation Failed:\n{compile_proc.stderr or compile_proc.stdout}"
                asyncio.create_task(self.send(text_data=json.dumps({'output': error_output})))
                return None, temp_dir
            
            return ["java", "-Xms32m", "-Xmx128m", "-cp", temp_dir, class_name], temp_dir

        elif language == 'cpp':
            source_file = f"/tmp/{unique_id}.cpp"
            exe_file = f"/tmp/{unique_id}"
            with open(source_file, "w") as f:
                f.write(code)
            compile_proc = subprocess.run(["g++", source_file, "-o", exe_file], capture_output=True, text=True)
            if compile_proc.returncode != 0:
                error_output = f"Compilation Failed:\n{compile_proc.stderr or compile_proc.stdout}"
                asyncio.create_task(self.send(text_data=json.dumps({'output': error_output})))
                return None, [source_file, exe_file]
            return [exe_file], [source_file, exe_file]
            
        elif language == 'c':
            source_file = f"/tmp/{unique_id}.c"
            exe_file = f"/tmp/{unique_id}"
            with open(source_file, "w") as f:
                f.write(code)
            compile_proc = subprocess.run(["gcc", source_file, "-o", exe_file], capture_output=True, text=True)
            if compile_proc.returncode != 0:
                error_output = f"Compilation Failed:\n{compile_proc.stderr or compile_proc.stdout}"
                asyncio.create_task(self.send(text_data=json.dumps({'output': error_output})))
                return None, [source_file, exe_file]
            return [exe_file], [source_file, exe_file]

        return None, None

    def cleanup_files(self):
        if not self.temp_to_clean:
            return

        paths_to_clean = self.temp_to_clean if isinstance(self.temp_to_clean, list) else [self.temp_to_clean]
        
        for path in paths_to_clean:
            try:
                if os.path.isdir(path):
                    shutil.rmtree(path, ignore_errors=True)
                elif os.path.exists(path):
                    os.remove(path)
            except OSError:
                pass
        
        self.temp_to_clean = None
