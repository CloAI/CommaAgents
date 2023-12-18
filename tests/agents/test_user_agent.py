import pytest
from unittest.mock import patch, MagicMock
from comma_agents.agents.base_agent import BaseAgent
from comma_agents.agents.user_agent import UserAgent, print_user_agent_prompt_format

class TestUserAgent:
    
    def test_init(self):
        """
        Test to verify the initialization of the UserAgent object.
        """
        agent = UserAgent()
        assert isinstance(agent, UserAgent)
        assert isinstance(agent, BaseAgent)
        assert agent.name == 'UserAgent'
        assert agent.user_message == ''
        assert agent.require_input == False
        assert agent.verbose_formats.get("print_agent_prompt_format") == print_user_agent_prompt_format

    @patch("builtins.input", return_value="Hello, Agent!")
    def test_call_llm_require_input_true(self, mock_input):
        """
        Test to verify the _call_llm method when require_input is True.
        """
        agent = UserAgent(user_message="Default Message", require_input=True)
        result = agent._call_llm()
        mock_input.assert_called_once_with("User input: ")
        assert result == "Hello, Agent!"

    def test_call_llm_require_input_false(self):
        """
        Test to verify the _call_llm method when require_input is False.
        """
        agent = UserAgent(user_message="Default Message", require_input=False)
        result = agent._call_llm()
        assert result == "Default Message"
        
    def test_init_simple():
        user_agent = UserAgent()
        assert user_agent.name == "UserAgent"
        assert user_agent.prompt == ""
        assert user_agent.require_input is False

    def test_init_custom():
        user_agent = UserAgent(name="MyAssistant", prompt="Ready to assist!", require_input=True)
        assert user_agent.name == "MyAssistant"
        assert user_agent.prompt == "Ready to assist!"
        assert user_agent.require_input is True

    def test_call_llm_require_input():
        user_agent = UserAgent(require_input=True)
        message = user_agent._call_llm()
        assert isinstance(message, str)  # Check if user input is returned as string

    def test_call_llm_no_input():
        user_agent = UserAgent(prompt="What can I do for you?", require_input=False)
        message = user_agent._call_llm()
        assert message == "What can I do for you?"  # Check if preset prompt is returned

    def test_verbose_format():
        user_agent = UserAgent()
        assert user_agent.verbose_formats["print_agent_prompt_format"] == print_user_agent_prompt_format