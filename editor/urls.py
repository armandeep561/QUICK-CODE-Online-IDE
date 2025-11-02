from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='editor-index'),
    path('save/', views.save_snippet, name='save-snippet'),
]
