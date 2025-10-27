"""Documentation portal engine for «Колибри ИИ».

This package aggregates markdown knowledge assets into a structured
portal with search, versioning and interactive example execution.
"""
from .app import create_app
from .engine import PortalEngine

__all__ = ["create_app", "PortalEngine"]
