import pytest
from unittest.mock import patch, MagicMock
from typing import Callable
from comma_agents.agents.base_agent import BaseAgent, print_agent_prompt_format

class TestBaseAgent:
    
    def test_init(self):
        """
        Test to verify the initialization of the BaseAgent object.
        """
        agent = BaseAgent("TestAgent")
        assert isinstance(agent, BaseAgent)
        assert agent.name == 'TestAgent'
        assert not agent.interpret_code
        assert not agent.code_interpreter
        assert agent.first_call 
        assert agent.verbose_level == 1
        assert agent.verbose_formats.get("print_agent_prompt_format") == print_agent_prompt_format

    def test_call_first_time(self, mocker):
        """
        Test to verify the call method when it's called for the first time.
        It verifies hooks are correctly called and the prompt is properly passed 
        to the _call_llm method.
        """
        before_hook =  mocker.MagicMock()
        after_hook =  mocker.MagicMock()
        _call_llm = mocker.patch.object(BaseAgent, '_call_llm', return_value='response')
        agent = BaseAgent("TestAgent", hooks={"before_initial_call": [before_hook], "after_initial_call": [after_hook]})
        
        result = agent.call('Test prompt')
        
        before_hook.assert_called_once()
        _call_llm.assert_called_once_with('Test prompt')
        after_hook.assert_called_once_with('response')
        assert result == 'response'
        assert not agent.first_call

    def test_call_not_first_time(self, mocker):
        """
        Test to verify the call method when it's not the first time being called.
        It verifies hooks are correctly called and the prompt is properly passed 
        to the _call_llm method.
        """
        before_hook =  mocker.MagicMock()
        after_hook =  mocker.MagicMock()
        _call_llm = mocker.patch.object(BaseAgent, '_call_llm', return_value='response')

        agent = BaseAgent("TestAgent", hooks={"before_call": [before_hook], "after_call": [after_hook]})
        agent.first_call = False

        result = agent.call('Test prompt')

        before_hook.assert_called_once()
        _call_llm.assert_called_once_with('Test prompt')
        after_hook.assert_called_once_with('response')
        assert result == 'response'
        assert not agent.first_call

    def test_execute_hooks(self, mocker):
        """
        Test to verify the _execute_hooks method.
        """
        hook =  mocker.MagicMock()
        agent = BaseAgent("TestAgent", hooks={"before_call": [hook]})
        assert agent._execute_hooks('before_call', "test") is None
        hook.assert_called_once_with('test')
    
    def test_execute_alter_hooks(self, mocker):
        """
        Test to verify the _execute_alter_hooks method.
        """
        hook =  mocker.MagicMock(return_value="altered prompt")
        agent = BaseAgent("TestAgent", hooks={"alter_call_message": [hook]})
        assert agent._execute_alter_hooks('alter_call_message', "test") == "altered prompt"
        hook.assert_called_once_with('test')

    def test_call_llm(self):
        """
        Test to verify the _call_llm method.
        """
        agent = BaseAgent("TestAgent")
        assert agent._call_llm('Test prompt') == "Calling TestAgent Agent with prompt Test prompt"