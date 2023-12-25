import types
import sys
import importlib.abc
import git
import os

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

COMMA_AGENTS_HUB_DIRECTORY = ".comma_agents_hub"

class CommaAgentsRemoteHubModuleLoader(importlib.abc.Loader):
    def __init__(self, repo_link) -> None:
        super().__init__()
        self.repo_link = repo_link
        self.repo = self.get_git_repo()
        self.repo.git.config('core.sparseCheckout', 'true')

    def get_git_repo(self):
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
            repo = git.Repo.clone_from(self.repo_link, COMMA_AGENTS_HUB_DIRECTORY, no_checkout=True)
            repo.git.config('core.sparseCheckout', 'true')
            return repo
        
    
    def create_module(self, spec):
        # Magic, Magic, Magic
        return CommaAgentsHubProxyModule(spec.name)

    def add_remote_sub_directory(self, module_type, username):
        sparse_checkout_file = f"{COMMA_AGENTS_HUB_DIRECTORY}/.git/info/sparse-checkout"
        with open(sparse_checkout_file, "a") as f:
            # Check if the file path is already in the sparse checkout file
            if f"/{module_type}/{username}" not in f.read():
                f.write(f"/{module_type}/{username}/\n")
            

    def exec_module(self, module):
        if module.__name__.startswith("comma_agents.hub.agents."):
            module_split = module.__name__.split(".")
            if len(module_split) == 3:
                username = module_split[3]
                module_type = module_split[2]
                self.add_remote_sub_directory(module_type, username)
                self.repo.git.checkout('HEAD')
                # Load the module from the repo
                module.__path__ = [COMMA_AGENTS_HUB_DIRECTORY]
                module.__file__ = f"{COMMA_AGENTS_HUB_DIRECTORY}/{module_type}/{username}/__init__.py"
                module.__package__ = ".".join(module.__name__.split(".")[:-1])
                module.__loader__ = self
                module.__spec__ = importlib.machinery.ModuleSpec(module.__name__, self)
                with open(module.__file__, "r") as f:
                    exec(f.read(), module.__dict__)
            return module
        # Custom code to load the module, e.g., fetch from remote
        print("This ran?")
        pass  # For demonstration purposes
    

class CommaAgentsRemoteHubModuleFinder(importlib.abc.MetaPathFinder):
    def __init__(self, loader: CommaAgentsRemoteHubModuleLoader):
        self.loader = loader
    
    def find_spec(self, fullname, path, target=None):
        if fullname.startswith("comma_agents.hub.agents"):
            return importlib.machinery.ModuleSpec(fullname, self.loader)
        return None

# Do some hijacking magic to remotely allow imports ;)
repo_link = "https://github.com/CloAI/CommaAgentsHub.git"
sys.meta_path.insert(0, CommaAgentsRemoteHubModuleFinder(loader=CommaAgentsRemoteHubModuleLoader(repo_link)))