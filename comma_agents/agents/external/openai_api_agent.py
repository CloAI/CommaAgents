from typing import TypedDict
from comma_agents.agents.base_agent import BaseAgent


class OpenAIAPICompatibleAgent(BaseAgent):
    
    class OpenAIAPICompatibleAgentConfig(TypedDict, total=True):
        """Configuration for OpenAI API Model Compatible Agent
        """
        model_name: str
        base_url: str
        api_key: str
        
        
    def __init__(self, name: str, system_prompt: str = None, keep_historical_context: bool = False, verbose_level: int = 1, hooks: "BaseAgent.AgentHooks" = {}, verbose_formats: "BaseAgent.AgentVerboseFormats" = {}):
        super().__init__(name, system_prompt, keep_historical_context, verbose_level, hooks, verbose_formats)
        
        # Crate the OpenAI API Model Compatible Agent Config and set the defaults
        self.config: OpenAIAPICompatibleAgent.OpenAIAPICompatibleAgentConfig = {
            "base_url": None,   
            "api_key": None,
            "model_name": None,
        }
        
    def _call_llm(self, prompt='', *args, **kwargs):
        # 
        return ""