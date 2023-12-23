from comma_agents.agents import UserAgent
from comma_agents.agents.user_agent import print_user_agent_prompt_format

class TestUserAgentInit:
    
    def test_init_defaults(self):
        """
        Test to verify the initialization of the UserAgent object.
        """
        agent = UserAgent()
        assert isinstance(agent, UserAgent)
        assert agent.name == 'UserAgent'
        assert agent.user_message == ''
        assert agent.require_input == False
        assert agent.verbose_formats.get("print_agent_prompt_format") == print_user_agent_prompt_format
    
    def test_init_passed_input(self):
        """
        Test to verify the initialization of the UserAgent object.
        """
        agent = UserAgent(user_message="Default Message", require_input=True)
        assert isinstance(agent, UserAgent)
        assert agent.name == 'UserAgent'
        assert agent.user_message == 'Default Message'
        assert agent.require_input == True
        assert agent.verbose_formats.get("print_agent_prompt_format") == print_user_agent_prompt_format
        
    def test_init_passed_input_false(self):
        """
        Test to verify the initialization of the UserAgent object.
        """
        agent = UserAgent(user_message="Default Message", require_input=False)
        assert isinstance(agent, UserAgent)
        assert agent.name == 'UserAgent'
        assert agent.user_message == 'Default Message'
        assert agent.require_input == False
        assert agent.verbose_formats.get("print_agent_prompt_format") == print_user_agent_prompt_format