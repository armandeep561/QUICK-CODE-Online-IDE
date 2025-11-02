from django.shortcuts import render
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST, require_http_methods
from django.views.decorators.csrf import csrf_exempt
import json
from .models import CodeSnippet

# --- Main View ---
def index(request):
    """Renders the main index.html template for the code editor page."""
    # Initialize session file storage if it doesn't exist
    if 'project_files' not in request.session:
        request.session['project_files'] = {
            'main.py': {
                'name': 'main.py',
                'content': '# Write your Python code here\nprint("Hello World!")',
                'language': 'python'
            }
        }
    return render(request, 'editor/index.html')

# --- Save Snippet View ---
@login_required
@require_POST
def save_snippet(request):
    """Handles an AJAX POST request to save a user's code snippet to the database."""
    try:
        data = json.loads(request.body)
        CodeSnippet.objects.create(
            user=request.user,
            language=data.get('language'),
            code=data.get('code')
        )
        return JsonResponse({'status': 'success'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

# --- File Management API ---

@csrf_exempt
def list_files(request):
    """Get all files in the current project."""
    if 'project_files' not in request.session:
        request.session['project_files'] = {}
    
    files = request.session['project_files']
    file_list = [
        {
            'name': name,
            'language': data.get('language', 'python')
        }
        for name, data in files.items()
    ]
    return JsonResponse({'files': file_list})

@csrf_exempt
@require_POST
def create_file(request):
    """Create a new file."""
    try:
        data = json.loads(request.body)
        filename = data.get('filename', 'untitled.py')
        
        if 'project_files' not in request.session:
            request.session['project_files'] = {}
        
        # Check if file already exists
        if filename in request.session['project_files']:
            return JsonResponse({
                'status': 'error',
                'message': 'File already exists'
            }, status=400)
        
        # Determine language from extension
        ext_map = {
            '.py': 'python',
            '.cpp': 'cpp',
            '.c': 'c',
            '.java': 'java',
            '.js': 'javascript',
            '.html': 'html',
            '.css': 'css'
        }
        
        language = 'python'
        for ext, lang in ext_map.items():
            if filename.endswith(ext):
                language = lang
                break
        
        # Create file
        request.session['project_files'][filename] = {
            'name': filename,
            'content': f'# New {language} file\n',
            'language': language
        }
        request.session.modified = True
        
        return JsonResponse({
            'status': 'success',
            'file': {
                'name': filename,
                'content': request.session['project_files'][filename]['content'],
                'language': language
            }
        })
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=400)

@csrf_exempt
@require_POST
def rename_file(request):
    """Rename a file."""
    try:
        data = json.loads(request.body)
        old_name = data.get('oldName')
        new_name = data.get('newName')
        
        if 'project_files' not in request.session:
            return JsonResponse({
                'status': 'error',
                'message': 'No files found'
            }, status=404)
        
        if old_name not in request.session['project_files']:
            return JsonResponse({
                'status': 'error',
                'message': 'File not found'
            }, status=404)
        
        if new_name in request.session['project_files']:
            return JsonResponse({
                'status': 'error',
                'message': 'File with new name already exists'
            }, status=400)
        
        # Rename file
        file_data = request.session['project_files'][old_name]
        file_data['name'] = new_name
        request.session['project_files'][new_name] = file_data
        del request.session['project_files'][old_name]
        request.session.modified = True
        
        return JsonResponse({
            'status': 'success',
            'message': 'File renamed successfully'
        })
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=400)

@csrf_exempt
@require_POST
def delete_file(request):
    """Delete a file."""
    try:
        data = json.loads(request.body)
        filename = data.get('filename')
        
        if 'project_files' not in request.session:
            return JsonResponse({
                'status': 'error',
                'message': 'No files found'
            }, status=404)
        
        if filename not in request.session['project_files']:
            return JsonResponse({
                'status': 'error',
                'message': 'File not found'
            }, status=404)
        
        # Prevent deleting last file
        if len(request.session['project_files']) == 1:
            return JsonResponse({
                'status': 'error',
                'message': 'Cannot delete the last file'
            }, status=400)
        
        del request.session['project_files'][filename]
        request.session.modified = True
        
        return JsonResponse({
            'status': 'success',
            'message': 'File deleted successfully'
        })
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=400)

@csrf_exempt
def get_file(request):
    """Get a specific file's content."""
    filename = request.GET.get('filename')
    
    if not filename:
        return JsonResponse({
            'status': 'error',
            'message': 'Filename required'
        }, status=400)
    
    if 'project_files' not in request.session:
        return JsonResponse({
            'status': 'error',
            'message': 'No files found'
        }, status=404)
    
    if filename not in request.session['project_files']:
        return JsonResponse({
            'status': 'error',
            'message': 'File not found'
        }, status=404)
    
    file_data = request.session['project_files'][filename]
    return JsonResponse({
        'status': 'success',
        'file': file_data
    })

@csrf_exempt
@require_POST
def save_file(request):
    """Save file content."""
    try:
        data = json.loads(request.body)
        filename = data.get('filename')
        content = data.get('content', '')
        
        if 'project_files' not in request.session:
            request.session['project_files'] = {}
        
        if filename in request.session['project_files']:
            request.session['project_files'][filename]['content'] = content
        else:
            # Create new file if it doesn't exist
            request.session['project_files'][filename] = {
                'name': filename,
                'content': content,
                'language': 'python'
            }
        
        request.session.modified = True
        
        return JsonResponse({
            'status': 'success',
            'message': 'File saved'
        })
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=400)
