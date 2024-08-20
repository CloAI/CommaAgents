# Configuration file for the Sphinx documentation builder.
#
# For the full list of built-in configuration values, see the documentation:
# https://www.sphinx-doc.org/en/master/usage/configuration.html

# -- Project information -----------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#project-information

import os
import sys

sys.path.insert(0, os.path.abspath("../"))

project = 'Comma Agents'
copyright = '2023, Nathaniel Hatch-Martinez'
author = 'Nathaniel Hatch-Martinez'
release = '0.0.5'

# -- General configuration ---------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#general-configuration

extensions = [
    'sphinx.ext.autodoc',
    'sphinx.ext.coverage',
    'sphinx.ext.napoleon',
    'm2r2'
]

templates_path = ['_templates']
exclude_patterns = []

# -- Options for HTML output -------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#options-for-html-output

html_theme = 'furo'
html_static_path = ['_static']
# html_logo = "_static/logo.png"

html_theme_options = {
    "source_repository": "https://github.com/CloAI/CommaAgents/",
    "source_branch": "main",
    "source_directory": "docs/source/",
}

html_context = {
    "display_github": True, # Integrate GitHub
    "github_user": "CloAI", # Username
    "github_repo": "CommaAgents", # Repo name
    "github_version": "main", # Version
    "conf_py_path": "/", # Path in the checkout to the docs root
}