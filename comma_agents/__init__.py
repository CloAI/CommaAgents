import importlib
import git
import os
import types
import sys

REPO_LINK = "https://github.com/CloAI/CommaAgentsHub.git"
COMMA_AGENTS_HUB_DIRECTORY = os.path.expanduser("~/.cache/comma_agents_hub")

def get_git_repo(REPO_LINK):
    # Check if the repo exists and if so return it
    if os.path.exists(COMMA_AGENTS_HUB_DIRECTORY):
        # validate that the repo is set and the remote is set to the correct link
        repo = git.Repo(COMMA_AGENTS_HUB_DIRECTORY)
        # if repo.remotes.origin.url != self.repo_link:
            # TODO: Add a warning that the repo is not set to the correct link and maybe some other stuff really should happen here
        repo.git.config('core.sparseCheckout', 'true')
        return repo
    # Otherwise clone the repo
    else:
        repo = git.Repo.clone_from(REPO_LINK, COMMA_AGENTS_HUB_DIRECTORY, no_checkout=True)
        repo.git.config('core.sparseCheckout', 'true')
        return repo
    
def add_remote_sub_directory_and_fetch(repo: git.Repo, module_type: str, username: str, module_name: str):
    sparse_checkout_file = f"{COMMA_AGENTS_HUB_DIRECTORY}/.git/info/sparse-checkout"

    # Ensure the directory exists
    os.makedirs(os.path.dirname(sparse_checkout_file), exist_ok=True)

    # Check if the file path is already in the sparse checkout file
    if os.path.exists(sparse_checkout_file):
            with open(sparse_checkout_file, "r") as f:
                if f"hub/{module_type}/{username}" in f.read():
                    repo.remotes.origin.fetch()
                    repo.git.checkout('HEAD')
                    return f"{COMMA_AGENTS_HUB_DIRECTORY}/hub/{module_type}/{username}/{module_name}"
    # Add the submodule to the sparse checkout file
    with open(sparse_checkout_file, "a") as f:
        f.write(f"hub/{module_type}/{username}/{module_name}\n")

    repo.remotes.origin.fetch()
    repo.git.checkout('HEAD')
    return f"{COMMA_AGENTS_HUB_DIRECTORY}/hub/{module_type}/{username}/{module_name}"

def dynamic_import_package_modules(package_path, package_name):
    # Create a new module object for the package
    root_module = types.ModuleType(package_name)
    root_module.__path__ = [package_path]  # Set the package path

    # Add the package to sys.modules
    sys.modules[package_name] = root_module

    # Dynamically import each Python file and merge its namespace
    for filename in os.listdir(package_path):
        if filename.endswith('.py') and not filename.startswith('__'):
            module_full_path = os.path.join(package_path, filename)

            spec = importlib.util.spec_from_file_location(package_name, module_full_path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            # Merge the submodule's namespace into the root module
            for attr_name in dir(module):
                if not attr_name.startswith('_'):
                    setattr(root_module, attr_name, getattr(module, attr_name))

    return root_module
     
def load_from_hub(hub_sting: str):
    """
    Load a module from the hub
    """
    username, module_type, module_name = hub_sting.split(".")
    # Check if the repo already exists locally based on the COMMA_AGENTS_HUB_DIRECTORY
    # If it does, clone the repo into the directory and set it to sparesely checkout
    # If it doesn't, clone the repo into the directory and set it to sparesely checkout
    # Then, load the module from the directory
    # Finally, return the module
    
    repo = get_git_repo(REPO_LINK)
    module_dir = add_remote_sub_directory_and_fetch(repo, module_type, username, module_name)
    
    # Check if the folder exists and the module is valid
    if not os.path.exists(module_dir):
        raise Exception(f"Module {hub_sting} does not exist")
    # Load the module from directory
    
    module_path = os.path.join(module_dir)

    module = dynamic_import_package_modules(module_path, module_name)
    
    return module

import os
import sys
import importlib.abc
import importlib.util
import git

class CommaAgentsHubProxyModule(types.ModuleType):
    """
    This is a proxy module that will be used to replace modules that are being loaded from the hub.
    We need this proxy module to be able to set a custom __path__ attribute so that we can load
    submodules from the hub as well without throwing errors that modules can not be loaded.
    Args:
        types (_type_): _description_
    """
    def __init__(self, name):
        super().__init__(name)
        self.__path__ = []  # Set a default __path__

class SparseCheckoutLoader(importlib.abc.SourceLoader):
    def __init__(self, base_path, repo_url):
        self.base_path = base_path
        self.repo_url = repo_url
        self.repo = None

    def _ensure_repo_cloned(self):
        repo_dir = os.path.join(self.base_path, 'hub')
        if not os.path.exists(os.path.join(repo_dir, '.git')):
            os.makedirs(repo_dir, exist_ok=True)
            self.repo = git.Repo.clone_from(self.repo_url, repo_dir, no_checkout=True)
        elif self.repo is None:
            self.repo = git.Repo(repo_dir)

    def _sparse_checkout(self, module_path):
        repo_dir = os.path.join(self.base_path, 'hub')
        self.repo.git.config('core.sparseCheckout', 'true')
        sparse_checkout_file = os.path.join(repo_dir, '.git', 'info', 'sparse-checkout')
        with open(sparse_checkout_file, 'w') as f:
            f.write(module_path + '\n')
        self.repo.remotes.origin.fetch()
        self.repo.git.checkout('HEAD')

    def create_module(self, spec):
        # Magic, Magic, Magic
        if spec.name.startswith('comma_agents.hub.'):
            module_name_parts = spec.name.split('.')
            # Check if path exists. If it does return none, else return a proxy module
            module_path = '/'.join(module_name_parts[1:])
            if os.path.exists(os.path.join(self.base_path, module_path)):
                return super().create_module(spec)
            else:
                return CommaAgentsHubProxyModule(spec.name)
        else:
            return super().create_module(spec)

    def exec_module(self, module):
        if module.__name__.startswith('comma_agents.hub.'):
            module_name_parts = module.__name__.split('.')
            
            # Construct the path to the module or package
            module_path = '/'.join(module_name_parts[1:-1])  # Exclude the last part for now
            module_or_package_path = os.path.join(self.base_path, module_path)
            module_file_name = module_name_parts[-1]  # Last part of the module name

            # Determine if it's a package or a module
            init_file_path = os.path.join(module_or_package_path, module_file_name, '__init__.py')
            module_file_path = os.path.join(module_or_package_path, module_file_name + '.py')

            if os.path.exists(init_file_path):
                # It's a package
                file_to_exec = init_file_path
                module.__path__ = [os.path.dirname(init_file_path)]
                module.__package__ = module.__name__
            elif os.path.exists(module_file_path):
                # It's a module
                file_to_exec = module_file_path
                module.__file__ = module_file_path
                module.__loader__ = self
            else:
                # Module/package not found; handle accordingly
                # For example, perform sparse checkout or raise an error
                self._ensure_repo_cloned()
                self._sparse_checkout('/'.join(module_name_parts[2:]))
                # Re-check if the file exists after sparse checkout
                if os.path.exists(init_file_path):
                    file_to_exec = init_file_path
                    module.__path__ = [os.path.dirname(init_file_path)]
                    module.__package__ = module.__name__
                elif os.path.exists(module_file_path):
                    file_to_exec = module_file_path
                    module.__file__ = module_file_path
                    module.__loader__ = self
                else:
                    raise ImportError(f"Module or package '{module.__name__}' not found")

            # Execute the module/package
            with open(file_to_exec, 'rb') as file:
                exec(compile(file.read(), file_to_exec, 'exec'), module.__dict__)
        
    def get_data(self, pathname):
        with open(pathname, 'rb') as file:
            return file.read()

    def get_filename(self, fullname):
        module_name_parts = fullname.split('.')

        # Construct the relative path for the module/package
        relative_path = os.path.join(*module_name_parts[2:])  # Skip 'comma_agents.hub'
        full_path = os.path.join(self.base_path, 'hub', relative_path)

        # Check if the path is a directory (i.e., a package)
        if os.path.isdir(full_path):
            init_file = os.path.join(full_path, '__init__.py')
            if os.path.isfile(init_file):
                return init_file  # Return the __init__.py file for a package

        # If it's not a package, assume it's a module
        return full_path + '.py'

class SparseCheckoutFinder(importlib.abc.MetaPathFinder):
    def __init__(self, loader):
        self.loader = loader

    def find_spec(self, fullname, path, target=None):
        if fullname.startswith("comma_agents.hub."):
            return importlib.machinery.ModuleSpec(fullname, self.loader)
        return None

import comma_agents
# Usage
repo_url = REPO_LINK
base_path = os.path.join(comma_agents.__path__[0]) # LETS HOPE THIS WORKS
sys.meta_path.insert(0, SparseCheckoutFinder(SparseCheckoutLoader(base_path, repo_url)))

    