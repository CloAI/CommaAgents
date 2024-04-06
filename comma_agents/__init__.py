import os
import sys
import importlib.abc
import importlib.util
import git
import types
import subprocess

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

class CommaAgentsHubSparseCheckoutLoader(importlib.abc.SourceLoader):
    """
    A custom module loader for dynamic import from a Git repository.

    This loader handles the cloning of a Git repository, sparse checkout of specific 
    modules or packages, and dynamic importing of these into the Python runtime. It 
    is tailored for a specific namespace structure ('comma_agents.hub').

    Parameters
    ----------
    hub_source_directory : str
        The local directory where the repository content will be stored.
    repo_url : str
        The URL of the Git repository.

    Attributes
    ----------
    repo : git.Repo or None
        The Git repository object. Initialized when the repo is cloned or opened.

    Methods
    -------
    _init_repo_cloned()
        Ensures the repository is cloned into the hub_source_directory.
    _sparse_checkout(module_path)
        Performs a sparse checkout of the specified module path.
    create_module(spec)
        Overrides to create a module; returns a proxy module if necessary.
    exec_module(module)
        Executes the specified module, handling both packages and modules.
    get_data(pathname)
        Reads and returns the content of the file at the given path.
    get_filename(fullname)
        Determines the filename for a given module, supporting both packages and modules.
    """
    def __init__(self, hub_source_directory: str, repo_url: str):
        """
        Initialize the CommaAgentsHubSparseCheckoutLoader.

        This constructor initializes the loader with the specified source directory and 
        repository URL. It also ensures that the Git repository is cloned or opened
        as part of the initialization process.

        Parameters
        ----------
        hub_source_directory : str
            The directory where the repository content will be stored. This directory 
            is used for cloning the repository and for subsequent operations.
        repo_url : str
            The URL of the Git repository to be cloned or opened.

        Attributes
        ----------
        repo : git.Repo or None
            The Git repository object. This is initialized by cloning or opening the 
            repository from the given URL. If the cloning or opening fails, this 
            attribute will be None.
        """
        self.hub_source_directory = hub_source_directory
        self.repo_url = repo_url
        self.repo = self._init_repo_cloned() 

    def _init_repo_cloned(self):
        """
        Initialize or open the Git repository.

        This method checks if the repository already exists in the specified directory. 
        If it does not exist, it clones the repository from the specified URL into 
        the directory. If it does exist, it opens the existing repository.

        The method ensures that the repository is available for further operations 
        such as sparse checkouts.

        Returns
        -------
        git.Repo
            The initialized or opened Git repository object. If the repository is 
            cloned, it will be set up with 'no_checkout=True', meaning the repository 
            will be cloned without checking out the working tree files.
        """
        repo_dir = os.path.join(self.hub_source_directory, 'hub')
        if not os.path.exists(os.path.join(repo_dir, '.git')):
            os.makedirs(repo_dir, exist_ok=True)
            repo = git.Repo.clone_from(self.repo_url, repo_dir, no_checkout=True)
        else:
            repo = git.Repo(repo_dir)
        return repo

    def _sparse_checkout(self, module_path):
        """
        Perform a sparse checkout of a specific module path in the repository.

        This method configures the repository for sparse checkout and then checks out 
        only the specified module path. It updates the sparse-checkout configuration 
        file with the given module path and then performs a fetch and checkout 
        operation to retrieve only the files relevant to the module.

        Parameters
        ----------
        module_path : str
            The path of the module or package within the Git repository to be sparsely 
            checked out. This path should be relative to the root of the repository.

        Notes
        -----
        This method modifies the repository's configuration to enable sparse checkout 
        if it's not already enabled. It overwrites the sparse-checkout configuration 
        file each time it's called, meaning that it will only checkout files related 
        to the most recent module path specified.
        """
        repo_dir = os.path.join(self.hub_source_directory, 'hub')
        self.repo.git.config('core.sparseCheckout', 'true')
        sparse_checkout_file = os.path.join(repo_dir, '.git', 'info', 'sparse-checkout')
        
        with open(sparse_checkout_file, 'a+') as f:
            if module_path not in f.read():
                f.write(module_path + '\n')
        
        self.repo.remotes.origin.pull()
        self.repo.git.checkout('HEAD')

    def create_module(self, spec):
        """
        Create a module object based on the given specification.

        This method is responsible for creating a module object when importing a module.
        If the module to be imported is part of the 'comma_agents.hub' namespace and its
        path does not exist in the hub source directory, a proxy module is created.
        Otherwise, it delegates to the superclass's `create_module` method for standard
        module creation.

        Parameters
        ----------
        spec : ModuleSpec
            The specification of the module to be imported. Contains all the information
            needed to create the module, such as its name and loader.

        Returns
        -------
        module : ModuleType or CommaAgentsHubProxyModule
            The created module object. If the module is part of the 'comma_agents.hub' 
            namespace and does not exist, a `CommaAgentsHubProxyModule` is returned.
            For all other modules, a standard module object is returned.

        Notes
        -----
        A `CommaAgentsHubProxyModule` is a special type of module used as a placeholder
        for modules in the 'comma_agents.hub' namespace that do not yet exist locally.
        This allows for dynamic module creation and import handling within this custom
        namespace structure.
        """
        if spec.name.startswith('comma_agents.hub.'):
            module_name_parts = spec.name.split('.')
            # Check if path exists. If it does return none, else return a proxy module
            module_path = '/'.join(module_name_parts[1:])
            if os.path.exists(os.path.join(self.hub_source_directory, module_path)):
                return super().create_module(spec)
            else:
                # Magic, Magic, Magic to create a proxy module with empty __path__ attribute for parent packages that do not exist
                return CommaAgentsHubProxyModule(spec.name)
        else:
            return super().create_module(spec)

    def install_requirements(self, requirements_path):
        """
        Install packages from the given requirements.txt file.
        
        Parameters:
        requirements_path (str): The path to the requirements.txt file.
        """
        try:
            subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-r', requirements_path])
            print("Dependencies installed successfully.")
        except subprocess.CalledProcessError as e:
            print(f"An error occurred while installing dependencies: {e}")

    def exec_module(self, module):
        """
        Execute the given module.

        This method is responsible for executing a module in its namespace. If the module
        is part of the 'comma_agents.hub' namespace, the method determines whether it is a
        regular module or a package and executes it accordingly. If the module or package
        is not found, it attempts a sparse checkout and then retries execution.

        Parameters
        ----------
        module : ModuleType
            The module object to be executed. This object is expected to have attributes
            like `__name__` set to the fully qualified module name.

        Raises
        ------
        ImportError
            If the module or package cannot be found after attempting a sparse checkout.

        Notes
        -----
        For modules in the 'comma_agents.hub' namespace, this method first constructs the
        path to the module or package. It then checks whether the path points to a package
        (by looking for an '__init__.py' file) or a regular module. Depending on this, it
        sets up the module's namespace and executes the corresponding file.

        For packages not found locally, a sparse checkout is performed, and the presence
        of the package or module is re-checked. If the file still does not exist, an
        ImportError is raised.
        """
        if module.__name__.startswith('comma_agents.hub.'):
            module_name_parts = module.__name__.split('.')
            
            # Construct the path to the module or package
            module_path = '/'.join(module_name_parts[1:-1])  # Exclude the last part for now
            module_or_package_path = os.path.join(self.hub_source_directory, module_path)
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
            elif len(module_name_parts) > 4:
                # Check if files are already there before we sparse checkout...
                if os.path.exists(init_file_path):
                    file_to_exec = init_file_path
                    module.__path__ = [os.path.dirname(init_file_path)]
                    module.__package__ = module.__name__
                elif os.path.exists(module_file_path):
                    file_to_exec = module_file_path
                    module.__file__ = module_file_path
                    module.__loader__ = self
                
                # Module/package not found; handle accordingly
                # For example, perform sparse checkout or raise an error
                repo_module_dir = '/'.join(module_name_parts[2:]) 
                self._sparse_checkout(repo_module_dir)
                
                # After sparse checkout, check if requirements.txt exists and install dependencies
                requirements_path = os.path.join(self.hub_source_directory, 'hub', repo_module_dir, 'requirements.txt')
                if os.path.exists(requirements_path):
                    self.install_requirements(requirements_path)
                
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
                    # raise ImportError(f"Module or package '{module.__name__}' not found")
                    return
            else:
                # If we are just checking out a submodule, and there is not any package or module there,
                # we need to create a proxy module temporarily
                module.__path__ = []
                module.__package__ = module.__name__ 
                return

            # Execute the module/package
            with open(file_to_exec, 'rb') as file:
                exec(compile(file.read(), file_to_exec, 'exec'), module.__dict__)
        
    def get_data(self, pathname):
        """
        Retrieve the binary content of a file from the given pathname.

        This method is part of the module loading process, specifically used in the 
        CommaAgentsHubSparseCheckoutLoader for reading the contents of Python files 
        that have been sparsely checked out from the Git repository.

        Parameters
        ----------
        pathname : str
            Path to the file within the sparsely checked-out repository.

        Returns
        -------
        bytes
            Content of the file as bytes, typically representing Python source code.
        """
        with open(pathname, 'rb') as file:
            return file.read()

    def get_filename(self, fullname):
        """
        Determine the file path for a module or package based on its full name.

        This method constructs the file path for the module or package corresponding to
        the given full name. It differentiates between a package and a module: for a
        package, it returns the path to the `__init__.py` file; for a module, it returns
        the path to the `.py` file.

        Parameters
        ----------
        fullname : str
            The fully qualified name of the module or package.

        Returns
        -------
        str
            The file path to the module or package. This path points to the `__init__.py` 
            file for packages and to the `.py` file for modules.
        """
        module_name_parts = fullname.split('.')

        # Construct the relative path for the module/package
        relative_path = os.path.join(*module_name_parts[2:])  # Skip 'comma_agents.hub'
        full_path = os.path.join(self.hub_source_directory, relative_path)

        # Check if the path is a directory (i.e., a package)
        if os.path.isdir(full_path):
            init_file = os.path.join(full_path, '__init__.py')
            if os.path.isfile(init_file):
                return init_file  # Return the __init__.py file for a package

        # If it's not a package, assume it's a module
        return full_path + '.py'

class CommaAgentsHubSparseCheckoutFinder(importlib.abc.MetaPathFinder):
    def __init__(self, loader, prefix="comma_agents.hub."):
        self.loader = loader
        self.prefix = prefix

    def find_spec(self, fullname, path, target=None):
        if fullname.startswith(self.prefix):
            return importlib.machinery.ModuleSpec(fullname, self.loader)
        return None


# Add the CommaAgentsHubSparseCheckoutFinder to the meta path to allow importing of the hub github repo
import comma_agents

# Usage
HUB_REPO_LINK = "https://github.com/CloAI/CommaAgentsHub.git"
base_path = os.path.join(comma_agents.__path__[0]) 
sys.meta_path.insert(0, CommaAgentsHubSparseCheckoutFinder(CommaAgentsHubSparseCheckoutLoader(base_path, HUB_REPO_LINK)))

    