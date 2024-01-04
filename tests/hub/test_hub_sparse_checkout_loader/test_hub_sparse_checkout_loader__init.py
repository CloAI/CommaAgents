import os
import pytest
from unittest.mock import patch, MagicMock, call
from comma_agents import CommaAgentsHubSparseCheckoutLoader

class TestHubSparseCheckoutLoader:
    """
    Test the HubSparseCheckoutLoader class.
    """

    def test_init(self):
        """
        Test to verify the initialization of the HubSparseCheckoutLoader object with default parameters.
        """
        hub_source_directory = "/example/path"
        repo_url = "example_remote_repo"
        repo_dir = os.path.join(hub_source_directory, 'hub')

        with patch('comma_agents.git.Repo') as mock_repo, \
             patch('os.makedirs') as mock_makedirs, \
             patch('os.path.exists', return_value=False):
            # Using patch to mock external interactions:
            # 1. `git.Repo`: Mocks Git operations to prevent actual network calls and repository manipulations.
            # 2. `os.makedirs`: Prevents actual directory creation on the filesystem, useful in read-only or restricted environments.
            # 3. `os.path.exists` (returning `False`): Simulates the non-existence of the repo directory to test cloning logic.

            # Mock the Repo object and clone_from method
            mock_repo_instance = MagicMock()
            mock_repo.clone_from.return_value = mock_repo_instance
            mock_repo.return_value = mock_repo_instance

            # Initialize the loader
            loader = CommaAgentsHubSparseCheckoutLoader(hub_source_directory, repo_url)

            # Assert that the loader is an instance of CommaAgentsHubSparseCheckoutLoader
            assert isinstance(loader, CommaAgentsHubSparseCheckoutLoader)

            # Assert that clone_from was called correctly
            mock_repo.clone_from.assert_called_once_with(repo_url, repo_dir, no_checkout=True)

            # Assert that makedirs was called
            mock_makedirs.assert_called_once_with(repo_dir, exist_ok=True)

            # Reset mock to test the scenario where the repo already exists
            mock_repo.reset_mock()
            mock_makedirs.reset_mock()
            with patch('os.path.exists', return_value=True):
                loader = CommaAgentsHubSparseCheckoutLoader(hub_source_directory, repo_url)
                # Verify if Repo was called to open the existing repository
                mock_repo.assert_called_once_with(repo_dir)
                # Verify that clone_from was not called for existing repo
                mock_repo.clone_from.assert_not_called()
                # makedirs should not be called for an existing repo
                mock_makedirs.assert_not_called()
        