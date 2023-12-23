from comma_agents.agents import BaseAgent
from comma_agents.agents.base_agent import print_agent_prompt_format

class TestBaseAgentCall:
    
    def test_call_first_time_logic(self, mocker):
        """
        Test to verify the call method when it's called for the first time.
        It verifies hooks are correctly called and the prompt is properly passed 
        to the _call_llm method.
        """
        _call_llm = mocker.patch.object(BaseAgent, '_call_llm', return_value='LLM Response')
        agent = BaseAgent("TestAgent",
            verbose_level=0 # Disable verbose output for this test as it's not relevant and will throw OSError that is not related...
        )
        
        assert agent.first_call is True
        
        agent.call('Test prompt')
        
        assert agent.first_call is False
        
        agent.call('Test prompt')
        
        assert _call_llm.call_count == 2
        assert agent.first_call is False
        
    def test_call_first_time_hooks(self, mocker):
        """
        Test to verify the call method when it's called for the first time.
        It verifies hooks are correctly called and the prompt is properly passed 
        to the _call_llm method.
        """
        before_initial_call_hook =  mocker.MagicMock()
        after_initial_call_hook =  mocker.MagicMock()
        alter_initial_call_message_hook =  mocker.MagicMock()
        alter_initial_response_hook =  mocker.MagicMock()
        before_call_hook =  mocker.MagicMock()
        after_call_hook =  mocker.MagicMock()
        alter_call_message_hook =  mocker.MagicMock()
        alter_response_hook =  mocker.MagicMock()
        
        agent = BaseAgent("TestAgent",
            hooks={
                "before_initial_call": [before_initial_call_hook],
                "after_initial_call": [after_initial_call_hook],
                "alter_initial_call_message": [alter_initial_call_message_hook],
                "alter_initial_response": [alter_initial_response_hook],
                "before_call": [before_call_hook],
                "after_call": [after_call_hook],
                "alter_call_message": [alter_call_message_hook],
                "alter_response": [alter_response_hook]
            },
            verbose_level=0 # Disable verbose output for this test as it's not relevant and will throw OSError that is not related...
        )
        
        assert agent.first_call is True
        
        agent.call('Test prompt')
        
        # Verify hooks are called
        before_initial_call_hook.assert_called_once()
        after_initial_call_hook.assert_called_once()
        alter_initial_call_message_hook.assert_called_once()
        alter_initial_response_hook.assert_called_once()
        
        # Verify these hooks are not called as it's the first call
        before_call_hook.assert_not_called()
        after_call_hook.assert_not_called()
        alter_call_message_hook.assert_not_called()
        alter_response_hook.assert_not_called()
        
        assert agent.first_call is False
    
    def test_call_not_first_time_hooks(self, mocker):
        """
        Test to verify the call method when it's not the first time being called.
        It verifies hooks are correctly called and the prompt is properly passed 
        to the _call_llm method.
        """
        before_initial_call_hook =  mocker.MagicMock()
        after_initial_call_hook =  mocker.MagicMock()
        alter_initial_call_message_hook =  mocker.MagicMock()
        alter_initial_response_hook =  mocker.MagicMock()
        before_call_hook =  mocker.MagicMock()
        after_call_hook =  mocker.MagicMock()
        alter_call_message_hook =  mocker.MagicMock()
        alter_response_hook =  mocker.MagicMock()
        
        agent = BaseAgent("TestAgent",
            hooks={
                "before_initial_call": [before_initial_call_hook],
                "after_initial_call": [after_initial_call_hook],
                "alter_initial_call_message": [alter_initial_call_message_hook],
                "alter_initial_response": [alter_initial_response_hook],
                "before_call": [before_call_hook],
                "after_call": [after_call_hook],
                "alter_call_message": [alter_call_message_hook],
                "alter_response": [alter_response_hook]
            },
            verbose_level=0 # Disable verbose output for this test as it's not relevant and will throw OSError that is not related...
        )
        
        assert agent.first_call is True
        
        agent.call('Test prompt')
        
        assert agent.first_call is False
        
        agent.call('Test prompt')
        
        # Verify hooks are called
        before_initial_call_hook.assert_called_once()
        after_initial_call_hook.assert_called_once()
        alter_initial_call_message_hook.assert_called_once()
        alter_initial_response_hook.assert_called_once()
        
        # Verify these hooks are called as it's not the first call
        before_call_hook.assert_called_once()
        after_call_hook.assert_called_once()
        alter_call_message_hook.assert_called_once()
        alter_response_hook.assert_called_once()
        
        assert agent.first_call is False
    
    def test_call_first_time_return(self, mocker):
        """
        Test to verify the call method when it's called for the first time.
        It verifies hooks are correctly called and the prompt is properly passed 
        to the _call_llm method.
        """
        _call_llm = mocker.patch.object(BaseAgent, '_call_llm', return_value='LLM Response')
        agent = BaseAgent("TestAgent",
            verbose_level=0 # Disable verbose output for this test as it's not relevant and will throw OSError that is not related...
        )
        
        assert agent.first_call is True
        
        result = agent.call('Test prompt')
        
        assert result == 'LLM Response'
        
        assert agent.first_call is False
        
        result = agent.call('Test prompt')
        
        assert result == 'LLM Response'
        
        assert _call_llm.call_count == 2
        assert agent.first_call is False
    
    def test_call_with_only_base_hooks(self, mocker):
        
        before_call_hook =  mocker.MagicMock()
        after_call_hook =  mocker.MagicMock()
        alter_call_message_hook =  mocker.MagicMock()
        alter_response_hook =  mocker.MagicMock()
        
        agent = BaseAgent("TestAgent",
            hooks={
                "before_call": before_call_hook,
                "after_call": after_call_hook,
                "alter_call_message": alter_call_message_hook,
                "alter_response": alter_response_hook
            },
            verbose_level=0 # Disable verbose output for this test as it's not relevant and will throw OSError that is not related...
        )
        
        assert agent.first_call is True
        
        agent.call('Test prompt')
        
        assert agent.first_call is False
        
        before_call_hook.assert_called_once()
        after_call_hook.assert_called_once()
        alter_call_message_hook.assert_called_once()
        alter_response_hook.assert_called_once()
        
        agent.call('Test prompt')
        
        before_call_hook.call_count == 2
        after_call_hook.call_count == 2
        alter_call_message_hook.call_count == 2
        alter_response_hook.call_count == 2
        
        assert agent.first_call is False
        
        

        
'''
TODO: Need to add tests for the following
- Need to define the alter hooks and confirm that they alter the message and response correctly
'''