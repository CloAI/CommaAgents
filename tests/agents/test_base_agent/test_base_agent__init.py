from comma_agents.agents import BaseAgent
from comma_agents.agents.base_agent import print_agent_prompt_format

class TestBaseAgentInit:
    """
    Testing for the BaseAgent class __init__ method.
    """
    def test_init_defaults(self):
        """
        Test to verify the initialization of the BaseAgent object.
        """
        agent = BaseAgent("TestAgent")
        assert isinstance(agent, BaseAgent)
        assert agent.name == 'TestAgent'
        
        assert not agent.interpret_code
        assert not agent.code_interpreter
        
        assert agent.hooks is not None
        assert agent.hooks.get("before_initial_call") == []
        assert agent.hooks.get("after_initial_call") == []
        assert agent.hooks.get("alter_initial_call_message") == []
        assert agent.hooks.get("alter_initial_response") == []
        
        assert agent.hooks.get("before_call") == []
        assert agent.hooks.get("after_call") == []
        assert agent.hooks.get("alter_call_message") == []
        assert agent.hooks.get("alter_response") == []
        
        # Technically could test this in the prompt system... But need to test here to ensure it's set properly as default too  
        assert agent.prompt_template is not None
        assert agent.prompt_template.prompt_format == "{system_message}\n{user_message}\n{assistant_message}\n"
        assert agent.prompt_template.remember_context is False
        assert agent.prompt_template.context_window_size is None
        
        assert agent.first_call is True
        
        assert agent.verbose_level == 1
        assert agent.verbose_formats.get("print_agent_prompt_format") == print_agent_prompt_format
        
    def test_init_with_hooks_empty(self):
        """
        Test to verify the initialization of the BaseAgent object with hooks.
        """
        agent = BaseAgent("TestAgent", hooks={
            "before_initial_call": [],
            "after_initial_call": [],
            "alter_initial_call_message": [],
            "alter_initial_response": [],
            "before_call": [],
            "after_call": [],
            "alter_call_message": [],
            "alter_response": []
        })
        assert isinstance(agent, BaseAgent)
        
        assert agent.hooks is not None
        assert agent.hooks.get("before_initial_call") == []
        assert agent.hooks.get("after_initial_call") == []
        assert agent.hooks.get("alter_initial_call_message") == []
        assert agent.hooks.get("alter_initial_response") == []
        
        assert agent.hooks.get("before_call") == []
        assert agent.hooks.get("after_call") == []
        assert agent.hooks.get("alter_call_message") == []
        assert agent.hooks.get("alter_response") == []
        
        # Defaults parameters already tested in test_init_defaults
    
    def test_init_with_single_hooks(self, mocker):
        """
        Test to verify the initialization of the BaseAgent object with single hooks.
        """
        
        # Mock some hooks
        before_initial_call =  mocker.MagicMock()
        after_initial_call =  mocker.MagicMock()
        alter_initial_call_message =  mocker.MagicMock()
        alter_initial_response =  mocker.MagicMock()
        before_call =  mocker.MagicMock()
        after_call =  mocker.MagicMock()
        alter_call_message =  mocker.MagicMock()
        alter_response =  mocker.MagicMock()
        
        
        agent = BaseAgent("TestAgent", hooks={
            "before_initial_call": before_initial_call,
            "after_initial_call": after_initial_call,
            "alter_initial_call_message": alter_initial_call_message,
            "alter_initial_response": alter_initial_response,
            "before_call": before_call,
            "after_call": after_call,
            "alter_call_message": alter_call_message,
            "alter_response": alter_response
        })
        
        assert isinstance(agent, BaseAgent)
        
        assert agent.hooks is not None
        assert agent.hooks.get("before_initial_call") == [before_initial_call]
        assert agent.hooks.get("after_initial_call") == [after_initial_call]
        assert agent.hooks.get("alter_initial_call_message") == [alter_initial_call_message]
        assert agent.hooks.get("alter_initial_response") == [alter_initial_response]
        
        assert agent.hooks.get("before_call") == [before_call]
        assert agent.hooks.get("after_call") == [after_call]
        assert agent.hooks.get("alter_call_message") == [alter_call_message]
        assert agent.hooks.get("alter_response") == [alter_response]
        
        # Defaults parameters already tested in test_init_defaults
        
    def test_init_with_multiple_hooks(self, mocker):
        """
        Test to verify the initialization of the BaseAgent object with multiple hooks.
        """
        
        # Mock some hooks
        before_initial_call =  mocker.MagicMock()
        after_initial_call =  mocker.MagicMock()
        alter_initial_call_message =  mocker.MagicMock()
        alter_initial_response =  mocker.MagicMock()
        before_call =  mocker.MagicMock()
        after_call =  mocker.MagicMock()
        alter_call_message =  mocker.MagicMock()
        alter_response =  mocker.MagicMock()
        
        
        agent = BaseAgent("TestAgent", hooks={
            "before_initial_call": [before_initial_call, before_initial_call],
            "after_initial_call": [after_initial_call, after_initial_call],
            "alter_initial_call_message": [alter_initial_call_message, alter_initial_call_message],
            "alter_initial_response": [alter_initial_response, alter_initial_response],
            "before_call": [before_call, before_call],
            "after_call": [after_call, after_call],
            "alter_call_message": [alter_call_message, alter_call_message],
            "alter_response": [alter_response, alter_response]
        })
        
        assert isinstance(agent, BaseAgent)
        
        assert agent.hooks is not None
        assert agent.hooks.get("before_initial_call") == [before_initial_call, before_initial_call]
        assert agent.hooks.get("after_initial_call") == [after_initial_call, after_initial_call]
        assert agent.hooks.get("alter_initial_call_message") == [alter_initial_call_message, alter_initial_call_message]
        assert agent.hooks.get("alter_initial_response") == [alter_initial_response, alter_initial_response]
        
        assert agent.hooks.get("before_call") == [before_call, before_call]
        assert agent.hooks.get("after_call") == [after_call, after_call]
        assert agent.hooks.get("alter_call_message") == [alter_call_message, alter_call_message]
        assert agent.hooks.get("alter_response") == [alter_response, alter_response]
        
        # Defaults parameters already tested in test_init_defaults
    
    def test_init_hooks_with_on_base_hooks(self, mocker):
        before_call_hook =  mocker.MagicMock()
        after_call_hook =  mocker.MagicMock()
        alter_call_message_hook =  mocker.MagicMock()
        alter_response_hook =  mocker.MagicMock()
        
        agent = BaseAgent("TestAgent", hooks={
            "before_call": [before_call_hook],
            "after_call": [after_call_hook],
            "alter_call_message": [alter_call_message_hook],
            "alter_response": [alter_response_hook]
        })
        
        assert isinstance(agent, BaseAgent)
        assert agent.hooks is not None
        
        assert agent.hooks.get("before_initial_call") == [before_call_hook]
        assert agent.hooks.get("after_initial_call") == [after_call_hook]
        assert agent.hooks.get("alter_initial_call_message") == [alter_call_message_hook]
        assert agent.hooks.get("alter_initial_response") == [alter_response_hook]
        
        assert agent.hooks.get("before_call") == [before_call_hook]
        assert agent.hooks.get("after_call") == [after_call_hook]
        assert agent.hooks.get("alter_call_message") == [alter_call_message_hook]
        assert agent.hooks.get("alter_response") == [alter_response_hook]
        
    
    def test_init_with_verbose_level(self):
        """
        Test to verify the initialization of the BaseAgent object with verbose_level.
        """
        agent = BaseAgent("TestAgent", verbose_level=2)
        assert isinstance(agent, BaseAgent)
        assert agent.verbose_level == 2
        
        # Defaults parameters already tested in test_init_defaults
    
    def test_init_with_verbose_formats(self, mocker):
        """
        Test to verify the initialization of the BaseAgent object with verbose_formats.
        """
        mock_print_agent_prompt_format = mocker.MagicMock()
        agent = BaseAgent("TestAgent", verbose_formats={"print_agent_prompt_format": mock_print_agent_prompt_format})
        assert isinstance(agent, BaseAgent)
        assert agent.verbose_formats.get("print_agent_prompt_format") == mock_print_agent_prompt_format
        
        # Defaults parameters already tested in test_init_defaults
