import pytest
from unittest.mock import patch, MagicMock
from comma_agents.agents import UserAgent
from unittest.mock import patch 

class TestUserAgentCall:
    
    @patch("builtins.input", return_value="Test User Input")
    def test_call_require_input(self, mocker):
        """
        Test to verify the call method when require_input is True.
        """
        agent = UserAgent(
            require_input=True,
            verbose_level=0 # Disable verbose output for this test as it's not relevant and will throw OSError that is not related...
        )
        assert agent.require_input == True
        
        result = agent.call('Test prompt')
        
        assert result == "Test User Input"