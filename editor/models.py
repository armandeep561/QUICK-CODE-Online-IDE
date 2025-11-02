from django.db import models
from django.contrib.auth.models import User # Import the built-in User model

class CodeSnippet(models.Model):
    # Link each snippet to a user. If a user is deleted, all their snippets are also deleted.
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    language = models.CharField(max_length=50)
    code = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        # This provides a nice, readable representation in the admin panel
        return f'{self.language} snippet by {self.user.username} created on {self.created_at.strftime("%Y-%m-%d")}'